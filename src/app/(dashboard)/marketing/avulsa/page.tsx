'use client'
/* eslint-disable @next/next/no-img-element -- miniaturas locais */

// =============================================================================
// Marketing › Post avulso — fotos, vídeos prontos e links de vídeo da loja
// (fora do estoque) no Instagram e no Facebook: sobe as mídias, escreve a
// legenda, vê a prévia no celular e publica agora, agenda ou salva rascunho.
// Lista separada por situação (agendados, publicados, com erro…), cada um com
// "Ver como ficou".
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, ExternalLink, Eye, FileText, ImagePlus, Layers, Link2, Loader2, Pencil, Rocket, Save, Sparkles, Stamp, Trash2, Upload, X } from 'lucide-react'
import { CADENCE_NOTICE } from '@/lib/publications/social/cadence-core'
import { OCCASION_LABEL, OCCASIONS, type Occasion } from '@/lib/publications/social/avulsa-text-core'
import { partsUrl, StoredPreview } from '@/components/publications/AvulsaPreview'
import { cn } from '@/lib/utils'
import { api, ErrorNote, inputCls, PubTabs } from '@/components/publications/ui'
import { PostPreview, type PreviewFormat, type PreviewMedia } from '@/components/publications/PostPreview'
import { AVULSA_FORMATS, AVULSA_LABEL, FACEBOOK_ONLY, MAX_VIDEO_BYTES, PART_BYTES, validateAvulsa, type AvulsaFormat, type AvulsaMedia, isBrandMark, type BrandMark } from '@/lib/publications/social/avulsa-core'
import { classifyVideo, VIDEO_HINT } from '@/lib/publications/social/video-core'

interface Conn { id: string; channel: string; label: string; status: string }
interface Item { key: string; media: AvulsaMedia | null; preview: string; kind: 'image' | 'video'; name: string; progress: number; error?: string }
/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS: Record<string, { label: string; cls: string }> = {
  RASCUNHO: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-600' }, AGENDADO: { label: 'Agendado', cls: 'bg-blue-50 text-blue-700' },
  ENVIANDO: { label: 'Enviando / processando', cls: 'bg-amber-50 text-amber-700' }, PUBLICADO: { label: 'Publicado', cls: 'bg-green-50 text-green-700' },
  PARCIAL: { label: 'Publicado em parte', cls: 'bg-amber-50 text-amber-700' }, FALHA: { label: 'Com erro', cls: 'bg-red-50 text-red-700' }, CANCELADO: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-400' },
}
const TABS: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: 'agendados', label: 'Agendados', statuses: ['AGENDADO'] },
  { key: 'enviando', label: 'Enviando', statuses: ['ENVIANDO'] },
  { key: 'publicados', label: 'Publicados', statuses: ['PUBLICADO', 'PARCIAL'] },
  { key: 'erro', label: 'Com erro', statuses: ['FALHA'] },
  { key: 'rascunhos', label: 'Rascunhos', statuses: ['RASCUNHO'] },
  { key: 'cancelados', label: 'Cancelados', statuses: ['CANCELADO'] },
]

/** Reduz a foto no navegador (lado maior 1440 px = o máximo que o Instagram usa). */
async function shrink(file: Blob, max = 1440): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Não foi possível ler a foto.'))), 'image/jpeg', 0.85))
}

/** Capa do vídeo (quadro de 1 s), para a prévia dos posts já feitos. */
async function videoPoster(file: File): Promise<Blob | null> {
  try {
    const v = document.createElement('video')
    v.muted = true; v.preload = 'auto'; v.src = URL.createObjectURL(file)
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('vídeo')) })
    v.currentTime = Math.min(1, (v.duration || 2) / 2)
    await new Promise<void>((res) => { v.onseeked = () => res() })
    const c = document.createElement('canvas')
    const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight))
    c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale)
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
    return await new Promise((res) => c.toBlob((b) => res(b), 'image/jpeg', 0.8))
  } catch { return null }
}

async function postRaw(url: string, body: Blob): Promise<any> {
  const r = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.success === false) throw new Error(j.error ?? `Erro ${r.status}`)
  return j
}

/** Mídias guardadas → prévia (fotos e capa do vídeo servidas pela loja). */

/** Rascunho salvo → itens do editor (com miniatura de volta). */
function itemsFromMedia(media: AvulsaMedia[]): Item[] {
  return media.flatMap((m): Item[] => {
    if (m.type === 'link') return []
    if (m.type === 'image') return [{ key: crypto.randomUUID(), media: m, preview: `/api/site/assets/${m.assetId}`, kind: 'image', name: 'Foto', progress: 100 }]
    if ('link' in m) return [{ key: crypto.randomUUID(), media: m, preview: classifyVideo(m.link)?.siteUrl ?? '', kind: 'video', name: `Vídeo (${classifyVideo(m.link)?.label ?? 'link'})`, progress: 100 }]
    return [{ key: crypto.randomUUID(), media: m, preview: partsUrl(m), kind: 'video', name: m.name ?? 'Vídeo', progress: 100 }]
  })
}
const DRAFT_KEY = 'autodrive:avulsa:editor:v1'

export default function PostAvulsoPage() {
  const [conns, setConns] = useState<Conn[]>([])
  const [sel, setSel] = useState<string[]>([])
  const [format, setFormat] = useState<AvulsaFormat>('POST')
  const [items, setItems] = useState<Item[]>([])
  const [linkMedia, setLinkMedia] = useState('')
  const [caption, setCaption] = useState('')
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const [when, setWhen] = useState('')
  const [tz, setTz] = useState('America/Sao_Paulo')
  const [contacts, setContacts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [posts, setPosts] = useState<any[] | null>(null)
  const [tab, setTab] = useState('agendados')
  const [net, setNet] = useState<'INSTAGRAM' | 'FACEBOOK'>('INSTAGRAM')
  const [viewing, setViewing] = useState<any | null>(null)
  // Lote: vários posts variados, agendados de uma vez em horários diferentes.
  type BatchItem = { id: string; title: string; format: AvulsaFormat; caption: string; media: AvulsaMedia[]; thumb: string | null; kind: 'image' | 'video' | 'link'; brand?: BrandMark | null }
  const [batch, setBatch] = useState<BatchItem[]>([])
  const [batchStart, setBatchStart] = useState('')
  const [batchResult, setBatchResult] = useState<{ message: string; results: Array<{ n: number; ok: boolean; message: string; local?: string }>; items: BatchItem[] } | null>(null)
  // Identidade da loja nas fotos e vídeos (só com a caixa marcada; preferência lembrada).
  const [brandOn, setBrandOn] = useState(false)
  const [brandStyle, setBrandStyle] = useState<BrandMark>('DISCRETO')
  useEffect(() => {
    const t = setTimeout(() => { try { const p = JSON.parse(localStorage.getItem('autodrive:avulsa:marca:v1') ?? 'null'); if (p) { setBrandOn(!!p.on); if (isBrandMark(p.style)) setBrandStyle(p.style) } } catch { /* sem armazenamento */ } }, 0)
    return () => clearTimeout(t)
  }, [])
  const setBrand = (on: boolean, style: BrandMark) => { setBrandOn(on); setBrandStyle(style); try { localStorage.setItem('autodrive:avulsa:marca:v1', JSON.stringify({ on, style })) } catch { /* ok */ } }
  const brand: BrandMark | null = brandOn ? brandStyle : null
  // Assistente de texto: modelo pronto por ocasião (com o nome da loja) ou IA.
  const [occasion, setOccasion] = useState<Occasion>('ENTREGA')
  const [notes, setNotes] = useState('')
  const writeText = async (useAi: boolean) => {
    if (caption.trim() && !confirm('Substituir o texto que já está escrito?')) return
    setBusy(useAi ? 'IA' : 'MODELO'); setMsg(null)
    try {
      const j = await api('/api/publications/avulsa/caption', { method: 'POST', json: { occasion, notes, format, useAi } })
      setCaption(j.text)
      setMsg({ ok: true, text: j.ai ? `Texto escrito pela IA (${j.source}). Revise antes de publicar.` : useAi ? 'Nenhuma IA configurada: usei o modelo pronto com os dados da loja.' : 'Modelo pronto preenchido com o nome e os contatos da loja — ajuste à vontade.' })
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  // Rascunho do servidor sendo continuado (salvar/publicar atualiza o mesmo).
  const [editingId, setEditingId] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)

  const loadIntoEditor = useCallback((d: { id?: string | null; format: AvulsaFormat; title?: string | null; caption?: string | null; media: AvulsaMedia[]; connectionIds?: string[] }) => {
    setFormat(d.format); setTitle(d.title ?? ''); setCaption(d.caption ?? '')
    setItems(itemsFromMedia(d.media)); setLinkMedia(d.media.find((m) => m.type === 'link')?.url ?? '')
    if (d.connectionIds?.length) setSel(d.connectionIds)
    setEditingId(d.id ?? null)
  }, [])

  // O editor não se perde ao sair da página: guardado neste navegador.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(DRAFT_KEY)
        const d = raw ? JSON.parse(raw) : null
        if (d && Date.now() - d.at < 2 * 86_400_000 && (d.media?.length || d.caption)) { loadIntoEditor(d); setMsg({ ok: true, text: 'Continuando de onde você parou.' }) }
      } catch { /* sem armazenamento local */ }
      setRestored(true)
    }, 0)
    return () => clearTimeout(t)
  }, [loadIntoEditor])
  const savedMedia = JSON.stringify(format === 'LINK' ? [{ type: 'link', url: linkMedia }] : items.flatMap((i) => (i.media ? [i.media] : [])))
  useEffect(() => {
    if (!restored) return
    const t = setTimeout(() => {
      try {
        const m = JSON.parse(savedMedia) as AvulsaMedia[]
        if (!m.some((x) => x.type !== 'link' || x.url) && !caption.trim()) localStorage.removeItem(DRAFT_KEY)
        else localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), id: editingId, format, title, caption, media: m, connectionIds: sel }))
      } catch { /* sem armazenamento local */ }
    }, 800)
    return () => clearTimeout(t)
  }, [restored, savedMedia, format, title, caption, sel, editingId])

  const continueDraft = (p: any) => {
    loadIntoEditor({ id: p.id, format: p.format, title: p.title, caption: p.caption, media: p.media ?? [], connectionIds: p.connectionIds })
    setMsg({ ok: true, text: 'Rascunho aberto no editor: ajuste e publique, agende ou salve de novo.' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  // Vindo do Painel ("Retomar"/"Visualizar"): ?editar=<id> ou ?ver=<id>.
  const [linked, setLinked] = useState(false)
  useEffect(() => {
    if (linked || !posts) return
    const sp = new URLSearchParams(window.location.search)
    const id = sp.get('editar') ?? sp.get('ver')
    const t = setTimeout(() => {
      setLinked(true)
      const p = id ? posts.find((x) => x.id === id) : null
      if (!p) return
      if (sp.get('editar') && p.status === 'RASCUNHO') continueDraft(p); else setViewing(p)
    }, 0)
    return () => clearTimeout(t)
  }, [posts, linked]) // eslint-disable-line react-hooks/exhaustive-deps

  // O lote fica guardado neste navegador (recarregar a página não perde).
  const [batchLoaded, setBatchLoaded] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => { try { const raw = localStorage.getItem('autodrive:avulsa:lote:v1'); if (raw) setBatch(JSON.parse(raw)) } catch { /* sem armazenamento */ } setBatchLoaded(true) }, 0)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (!batchLoaded) return
    try { if (batch.length) localStorage.setItem('autodrive:avulsa:lote:v1', JSON.stringify(batch)); else localStorage.removeItem('autodrive:avulsa:lote:v1') } catch { /* sem armazenamento */ }
  }, [batch, batchLoaded])

  const addToBatch = () => {
    // Miniatura pelo arquivo já enviado ao servidor (sobrevive a recarregar a página).
    const img = media.find((m) => m.type === 'image') as { assetId: string } | undefined
    const poster = media.find((m) => m.type === 'video' && 'posterAssetId' in m && m.posterAssetId) as { posterAssetId?: string } | undefined
    const thumb = img ? `/api/site/assets/${img.assetId}` : poster?.posterAssetId ? `/api/site/assets/${poster.posterAssetId}` : null
    setBatch((b) => [...b, { id: crypto.randomUUID(), title, format, caption, media, thumb, brand, kind: format === 'LINK' ? 'link' : media.some((m) => m.type === 'video') ? 'video' : 'image' }])
    setMsg({ ok: true, text: `Post ${batch.length + 1} adicionado ao lote. Monte o próximo ou agende o lote.` })
    clearEditor()
  }
  const runBatch = async () => {
    if (!batch.length || !selConns.length) return
    setBusy('LOTE'); setMsg(null)
    try {
      const j = await api('/api/publications/avulsa/batch', { method: 'POST', json: { items: batch.map(({ title, format, caption, media, brand: bm }) => ({ title, format, caption, media, brand: bm })), connectionIds: selConns.map((c) => c.id), startLocal: batchStart || undefined } })
      setBatchResult({ message: j.message, results: j.results, items: batch })
      setBatch((b) => b.filter((_, n) => !j.results.find((r: { n: number; ok: boolean }) => r.n === n && r.ok)))
      setTab('agendados'); loadPosts()
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const clearEditor = () => { setItems([]); setLinkMedia(''); setCaption(''); setTitle(''); setWhen(''); setEditingId(null); try { localStorage.removeItem(DRAFT_KEY) } catch { /* ok */ } }

  const loadPosts = useCallback(() => { api('/api/publications/avulsa').then((j) => { setPosts(j.data) }).catch(() => setPosts([])) }, [])
  useEffect(() => {
    api('/api/publications/connections').then((j) => {
      const list = (j.data.connections as Conn[]).filter((c) => (c.channel === 'INSTAGRAM' || c.channel === 'META_PAGE') && c.status === 'CONECTADO')
      setConns(list); setSel((cur) => (cur.length ? cur : list.map((c) => c.id)))
    }).catch(() => undefined)
    api('/api/publications/settings').then((j) => { setTz(j.data.timezone); setContacts(j.data.contacts ?? {}) }).catch(() => undefined)
    const t = setTimeout(loadPosts, 0); return () => clearTimeout(t)
  }, [loadPosts])

  const setItem = (key: string, x: Partial<Item>) => setItems((l) => l.map((i) => (i.key === key ? { ...i, ...x } : i)))

  const addImages = async (files: FileList) => {
    for (const f of Array.from(files).slice(0, 10 - items.length)) {
      const key = crypto.randomUUID()
      setItems((l) => [...l, { key, media: null, preview: URL.createObjectURL(f), kind: 'image', name: f.name, progress: 0 }])
      try {
        const j = await postRaw('/api/publications/avulsa/upload?kind=image', await shrink(f))
        setItem(key, { media: { type: 'image', assetId: j.assetId }, progress: 100 })
      } catch (e) { setItem(key, { error: (e as Error).message }) }
    }
  }

  const addVideo = async (f: File) => {
    if (f.size > MAX_VIDEO_BYTES) { setMsg({ ok: false, text: `Vídeo com mais de ${Math.round(MAX_VIDEO_BYTES / 1048576)} MB. Use um link do Google Drive ou Dropbox.` }); return }
    const key = crypto.randomUUID(); const uploadId = crypto.randomUUID()
    setItems([{ key, media: null, preview: URL.createObjectURL(f), kind: 'video', name: f.name, progress: 0 }])
    const parts = Math.ceil(f.size / PART_BYTES)
    try {
      const poster = await videoPoster(f)
      const posterAssetId = poster ? (await postRaw('/api/publications/avulsa/upload?kind=image', poster).catch(() => null))?.assetId : undefined
      for (let i = 0; i < parts; i++) {
        await postRaw(`/api/publications/avulsa/upload?kind=video&uploadId=${uploadId}&index=${i}`, f.slice(i * PART_BYTES, (i + 1) * PART_BYTES))
        setItem(key, { progress: Math.round(((i + 1) / parts) * 100) })
      }
      setItem(key, { media: { type: 'video', uploadId, parts, size: f.size, name: f.name.slice(0, 120), ...(posterAssetId ? { posterAssetId } : {}) } })
    } catch (e) { setItem(key, { error: `Envio interrompido: ${(e as Error).message}` }) }
  }

  const useVideoLink = () => {
    const v = classifyVideo(link)
    if (!v) { setMsg({ ok: false, text: `Link não reconhecido. ${VIDEO_HINT}` }); return }
    if (!v.downloadUrl) {
      // YouTube/Vimeo/TikTok: não dá para baixar (termos) → vira post de link no Facebook.
      setFormat('LINK'); setItems([]); setLinkMedia(v.url); setLink('')
      setMsg({ ok: true, text: `Link do ${v.label}: as regras do ${v.label} não permitem baixar o vídeo para postar no Instagram, então ele vai como post com o link na Página do Facebook.` })
      return
    }
    setItems([{ key: crypto.randomUUID(), media: { type: 'video', link: v.url }, preview: v.siteUrl ?? '', kind: 'video', name: `Vídeo (${v.label})`, progress: 100 }])
    setLink('')
  }

  const media: AvulsaMedia[] = format === 'LINK' ? (classifyVideo(linkMedia) ? [{ type: 'link', url: linkMedia.trim() }] : []) : items.flatMap((i) => (i.media ? [i.media] : []))
  const uploading = items.some((i) => !i.media && !i.error)
  const problem = validateAvulsa(format, media, caption)
  const allowed = (c: Conn) => !FACEBOOK_ONLY.includes(format) || c.channel === 'META_PAGE'
  const selConns = conns.filter((c) => sel.includes(c.id) && allowed(c))
  const previewNet = format === 'LINK' ? 'FACEBOOK' : selConns.some((c) => (net === 'INSTAGRAM' ? c.channel === 'INSTAGRAM' : c.channel === 'META_PAGE')) ? net : selConns[0]?.channel === 'META_PAGE' ? 'FACEBOOK' : 'INSTAGRAM'
  const account = selConns.find((c) => (previewNet === 'INSTAGRAM' ? c.channel === 'INSTAGRAM' : c.channel === 'META_PAGE'))?.label ?? 'sua loja'
  const previewMedia: PreviewMedia[] = useMemo(() => items.filter((i) => i.preview).map((i): PreviewMedia => {
    if (!brand) return { type: i.kind, url: i.preview }
    if (i.media?.type === 'image') return { type: 'image', url: i.media.branded ? i.preview : `/api/publications/avulsa/brand?${new URLSearchParams({ style: brand, assetId: i.media.assetId })}` }
    return { type: i.kind, url: i.preview, overlay: `/api/publications/avulsa/brand?${new URLSearchParams({ style: brand, w: '1080', h: '1920' })}` }
  }), [items, brand])
  const pf = (f: AvulsaFormat, n: number): PreviewFormat => (f === 'POST' ? (n > 1 ? 'CARROSSEL' : 'POST') : f)

  const insertContacts = () => {
    const lines = [contacts.whatsapp && `💬 WhatsApp: ${contacts.whatsapp}`, contacts.instagram && `📸 Instagram: ${contacts.instagram.startsWith('@') ? contacts.instagram : `@${contacts.instagram}`}`, contacts.site && `🌐 ${contacts.site}`].filter(Boolean)
    if (lines.length) setCaption((c) => `${c.trimEnd()}\n\n${lines.join('\n')}`.trimStart())
  }

  const submit = async (mode: 'AGORA' | 'AGENDAR' | 'RASCUNHO') => {
    setBusy(mode); setMsg(null)
    try {
      const j = await api('/api/publications/avulsa', { method: 'POST', json: { id: editingId, title, format, caption, media, connectionIds: selConns.map((c) => c.id), mode, scheduledLocal: mode === 'AGENDAR' ? when : undefined, brand } })
      setMsg({ ok: true, text: j.message }); clearEditor()
      setTab(mode === 'RASCUNHO' ? 'rascunhos' : mode === 'AGENDAR' ? 'agendados' : 'enviando'); loadPosts()
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const cancel = async (id: string) => {
    if (!confirm('Cancelar este post?')) return
    try { await api(`/api/publications/avulsa/${id}`, { method: 'DELETE' }); loadPosts() } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, (posts ?? []).filter((p) => t.statuses.includes(p.status)).length])), [posts])
  const shown = (posts ?? []).filter((p) => TABS.find((t) => t.key === tab)!.statuses.includes(p.status))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Post avulso</h1>
        <p className="text-sm text-gray-500">Fotos, vídeos prontos e links de vídeo da loja (bastidores, entregas, eventos, promoções) no Instagram e no Facebook — publique agora ou agende.</p>
      </div>
      <PubTabs />
      {editingId && <p className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-50/60 px-3 py-2 text-xs text-brand-800">Editando um rascunho salvo — ao salvar ou publicar, ele é atualizado (não cria outro).<button type="button" onClick={clearEditor} className="underline">Começar um post novo</button></p>}
      {msg && <p role="status" className={cn('rounded-lg px-3 py-2 text-xs', msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>{msg.text}</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr,320px]">
        <section className="space-y-4">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Formato">
            {AVULSA_FORMATS.map((f) => <button key={f} type="button" aria-pressed={format === f} onClick={() => { setFormat(f); setItems([]); setLinkMedia('') }} className={cn('rounded-full border px-3 py-1 text-xs', format === f ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 text-gray-600')}>{AVULSA_LABEL[f]}</button>)}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-700">Contas</p>
            {conns.map((c) => (
              <label key={c.id} className={cn('mr-4 inline-flex items-center gap-2 text-xs', allowed(c) ? 'text-gray-700' : 'text-gray-400')}>
                <input type="checkbox" disabled={!allowed(c)} checked={sel.includes(c.id) && allowed(c)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} />
                {c.channel === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} · {c.label}{!allowed(c) ? ' (não aceita link)' : ''}
              </label>
            ))}
            {!conns.length && <p className="text-xs text-gray-500">Conecte o Instagram ou a Página do Facebook em Canais conectados.</p>}
          </div>

          {format === 'LINK' ? (
            <label className="block text-xs font-medium text-gray-600">Link do vídeo
              <input className={inputCls} value={linkMedia} onChange={(e) => setLinkMedia(e.target.value)} placeholder="https://youtu.be/… ou Vimeo, TikTok, Instagram, Facebook" />
              <span className="text-[11px] text-gray-500">Vira um post na Página do Facebook com o cartão do vídeo (clicável). O Instagram não aceita links em posts, e os termos do YouTube/TikTok não permitem baixar o vídeo para repostar.</span>
            </label>
          ) : (
            <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap gap-2">
                {(format === 'POST' || format === 'STORY') && (
                  <label className="btn-secondary cursor-pointer px-3 py-1.5 text-xs"><ImagePlus size={14} />{format === 'POST' ? 'Adicionar fotos (até 10)' : 'Escolher foto'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple={format === 'POST'} className="hidden" onChange={(e) => { if (e.target.files?.length) { if (format === 'STORY') setItems([]); void addImages(e.target.files) } e.target.value = '' }} />
                  </label>
                )}
                {(format === 'REELS' || format === 'STORY') && (
                  <label className="btn-secondary cursor-pointer px-3 py-1.5 text-xs"><Upload size={14} />Carregar vídeo pronto (até {Math.round(MAX_VIDEO_BYTES / 1048576)} MB)
                    <input type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addVideo(f); e.target.value = '' }} />
                  </label>
                )}
              </div>
              {(format === 'REELS' || format === 'STORY') && (
                <div className="flex gap-2">
                  <input className={cn(inputCls, 'text-xs')} value={link} onChange={(e) => setLink(e.target.value)} placeholder="…ou cole o link: Google Drive, Dropbox, .mp4 (YouTube vira post de link no Facebook)" />
                  <button type="button" onClick={useVideoLink} className="btn-secondary px-2 py-1 text-xs"><Link2 size={14} />Usar link</button>
                </div>
              )}
              <ul className="flex flex-wrap gap-2">
                {items.map((i) => (
                  <li key={i.key} className="relative h-24 w-20 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                    {i.kind === 'image' ? <img src={i.preview} alt="" className="h-full w-full object-cover" /> : i.preview ? <video src={i.preview} className="h-full w-full object-cover" muted /> : <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-gray-500">{i.name}</span>}
                    {!i.media && !i.error && <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[10px] text-white">{i.progress}%</span>}
                    {i.error && <span className="absolute inset-0 flex items-center bg-red-600/80 p-1 text-center text-[9px] text-white">{i.error}</span>}
                    <button type="button" onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))} aria-label="Remover" className="absolute right-0.5 top-0.5 rounded-full bg-white/90 p-0.5"><X size={12} /></button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {format !== 'LINK' && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 text-xs">
              <label className="flex items-center gap-2 font-medium text-gray-800"><input type="checkbox" checked={brandOn} onChange={(e) => setBrand(e.target.checked, brandStyle)} className="rounded border-gray-300 text-brand-600" /><Stamp size={14} className="text-brand-700" />Aplicar a identidade da loja nas fotos e vídeos</label>
              {brandOn && (
                <select aria-label="Estilo da identidade" className={cn(inputCls, 'w-auto py-1 text-xs')} value={brandStyle} onChange={(e) => setBrand(true, e.target.value as BrandMark)}>
                  <option value="DISCRETO">Discreto — só o logo no canto</option>
                  <option value="COMPLETO">Completo — logo + faixa com nome e WhatsApp</option>
                </select>
              )}
              <span className="w-full text-[11px] text-gray-500">{brandOn ? 'Usa o logo, as cores, o nome, o WhatsApp e o @ da loja. A prévia ao lado já mostra como fica; nos vídeos a marca fica fora da área coberta pelos botões do Instagram.' : 'Desmarcado: as fotos e vídeos vão exatamente como foram enviados.'}</span>
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/30 p-3 text-xs">
            <p className="flex items-center gap-1.5 font-semibold text-gray-800"><Sparkles size={13} className="text-brand-700" />Texto do post</p>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="Ocasião" className={cn(inputCls, 'w-auto py-1 text-xs')} value={occasion} onChange={(e) => setOccasion(e.target.value as Occasion)}>
                {OCCASIONS.map((o) => <option key={o} value={o}>{OCCASION_LABEL[o]}</option>)}
              </select>
              <input className={cn(inputCls, 'min-w-[200px] flex-1 py-1 text-xs')} value={notes} maxLength={600} onChange={(e) => setNotes(e.target.value)} placeholder="Detalhe (opcional): ex. entrega do Compass para a família Souza" />
              <button type="button" onClick={() => void writeText(false)} disabled={!!busy} className="btn-secondary px-2.5 py-1 text-xs">{busy === 'MODELO' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}Modelo pronto</button>
              <button type="button" onClick={() => void writeText(true)} disabled={!!busy} className="btn-primary px-2.5 py-1 text-xs">{busy === 'IA' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}Escrever com IA</button>
            </div>
            <p className="text-[11px] text-gray-500">O modelo já sai com o nome, a cidade e os contatos da loja. Ou escreva/cole o seu próprio texto abaixo.</p>
          </div>

          {format !== 'STORY' && (
            <label className="block text-xs font-medium text-gray-600">
              <span className="flex items-center justify-between">{format === 'LINK' ? 'Texto do post' : 'Legenda'} <span className="flex items-center gap-2"><button type="button" onClick={insertContacts} className="text-brand-700 hover:underline">Inserir contatos da loja</button><span className="text-gray-400">{caption.length}/{format === 'LINK' ? 5000 : 2200}</span></span></span>
              <textarea rows={8} className={inputCls} value={caption} maxLength={format === 'LINK' ? 5000 : 2200} onChange={(e) => setCaption(e.target.value)} placeholder="Escreva o texto do post…" />
            </label>
          )}
          <label className="block max-w-sm text-xs font-medium text-gray-600">Nome interno (opcional)<input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Entrega da semana" /></label>

          {problem && (media.length > 0 || linkMedia) && <ErrorNote message={problem} />}
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3">
            <button type="button" onClick={() => submit('AGORA')} disabled={!!busy || uploading || !!problem || !selConns.length} className="btn-primary px-4 py-2 text-sm">{busy === 'AGORA' ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}Publicar agora</button>
            <label className="text-xs text-gray-600">Agendar ({tz.replace('_', ' ')})<input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} /></label>
            <button type="button" onClick={() => submit('AGENDAR')} disabled={!!busy || uploading || !!problem || !when || !selConns.length} className="btn-secondary px-3 py-2 text-sm"><CalendarClock size={15} />Agendar</button>
            <button type="button" onClick={addToBatch} disabled={!!busy || uploading || !!problem || !!editingId} title={editingId ? 'Termine o rascunho aberto antes de montar um lote' : undefined} className="btn-secondary px-3 py-2 text-sm"><Layers size={15} />Adicionar ao lote{batch.length ? ` (${batch.length})` : ''}</button>
            <button type="button" onClick={() => submit('RASCUNHO')} disabled={!!busy || uploading || !media.length} className="btn-secondary ml-auto px-3 py-2 text-sm"><Save size={15} />Salvar rascunho</button>
            {uploading && <p className="w-full text-xs text-amber-700">Aguarde terminar o envio das mídias…</p>}
          </div>
        </section>

        <aside className="space-y-2">
          <div className="flex justify-center gap-1.5" role="tablist" aria-label="Rede">
            {(['INSTAGRAM', 'FACEBOOK'] as const).map((n) => <button key={n} role="tab" aria-selected={previewNet === n} disabled={format === 'LINK' && n === 'INSTAGRAM'} onClick={() => setNet(n)} className={cn('rounded-full border px-3 py-0.5 text-xs disabled:opacity-40', previewNet === n ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 text-gray-600')}>{n === 'INSTAGRAM' ? 'Instagram' : 'Facebook'}</button>)}
          </div>
          <PostPreview network={previewNet} format={pf(format, previewMedia.length)} account={account} media={previewMedia} caption={format === 'STORY' ? '' : caption} link={format === 'LINK' ? linkMedia : undefined} />
          <p className="text-center text-[11px] text-gray-500">Prévia de como aparece no celular. Vídeo é ajustado para 9:16 (vertical) sem cortar.</p>
        </aside>
      </div>

      {(batch.length > 0 || batchResult) && (
        <section className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/30 p-4" aria-label="Lote de posts">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"><Layers size={15} className="text-brand-700" />Lote de posts {batch.length > 0 && <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[11px] text-white">{batch.length}</span>}</h2>
            <span className="text-[11px] text-gray-500">Contas: {selConns.map((c) => (c.channel === 'INSTAGRAM' ? 'Instagram' : 'Facebook')).join(' + ') || 'escolha acima'}</span>
          </div>
          {batch.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {batch.map((b, n) => (
                <li key={b.id} className="flex gap-2 rounded-lg border border-gray-200 bg-white p-2 text-xs">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 text-gray-500">{b.thumb ? <img src={b.thumb} alt="" className="h-full w-full object-cover" /> : b.kind === 'link' ? <Link2 size={16} /> : <Upload size={16} />}</span>
                  <span className="min-w-0 flex-1"><b className="block truncate text-gray-800">{n + 1}. {b.title || AVULSA_LABEL[b.format]}</b><span className="block text-gray-500">{AVULSA_LABEL[b.format]} · {b.media.length} mídia(s)</span>{b.caption && <span className="line-clamp-1 text-gray-500">{b.caption}</span>}</span>
                  <button type="button" onClick={() => setBatch((l) => l.filter((x) => x.id !== b.id))} aria-label="Tirar do lote" className="self-start text-gray-400 hover:text-red-600"><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          {batch.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-gray-600">A partir de (opcional)<input type="datetime-local" className={inputCls} value={batchStart} onChange={(e) => setBatchStart(e.target.value)} /></label>
              <button type="button" onClick={() => void runBatch()} disabled={!!busy || !selConns.length} className="btn-primary px-4 py-2 text-sm">{busy === 'LOTE' ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />}Agendar os {batch.length} em horários diferentes</button>
              <button type="button" onClick={() => { if (confirm('Esvaziar o lote?')) setBatch([]) }} className="text-xs text-gray-500 underline">Esvaziar</button>
            </div>
          )}
          <p className="text-[11px] text-gray-600">O sistema escolhe o horário de cada post entre 07:00 e 20:00, sem repetir horário com nada que já está na agenda (anúncios e outros posts) e respeitando o limite seguro por dia — o que passar vai para o dia seguinte. {CADENCE_NOTICE}</p>
          {batchResult && (
            <div role="status" className="rounded-lg border border-gray-200 bg-white p-3 text-xs">
              <p className="font-semibold text-gray-800">{batchResult.message}</p>
              <ul className="mt-1 space-y-0.5">{batchResult.results.map((r) => <li key={r.n} className={r.ok ? 'text-green-700' : 'text-red-700'}>{r.n + 1}. {batchResult.items[r.n]?.title || AVULSA_LABEL[batchResult.items[r.n]?.format ?? 'POST']}: {r.ok && r.local ? new Date(`${r.local}:00`).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : r.message}</li>)}</ul>
              <button type="button" onClick={() => setBatchResult(null)} className="mt-1 text-gray-500 underline">Fechar</button>
            </div>
          )}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-800">Seus posts avulsos</h2>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Situação">
          {TABS.map((t) => <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn('rounded-full border px-3 py-1 text-xs', tab === t.key ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 text-gray-600', t.key === 'erro' && counts.erro && tab !== t.key && 'border-red-200 text-red-700')}>{t.label} ({counts[t.key] ?? 0})</button>)}
        </div>
        {!posts ? <Loader2 className="animate-spin text-gray-400" /> : !shown.length ? <p className="text-xs text-gray-500">Nada aqui.</p> : (
          <ul className="space-y-2">
            {shown.map((p) => {
              const st = STATUS[p.status] ?? STATUS.RASCUNHO
              return (
                <li key={p.id} className="rounded-xl border border-gray-200 bg-white p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 font-medium', st.cls)}>{st.label}</span>
                    <b className="text-gray-800">{p.title || AVULSA_LABEL[p.format as AvulsaFormat] || p.format}</b>
                    <span className="text-gray-500">{p.status === 'AGENDADO' && p.scheduledAt ? `para ${new Date(p.scheduledAt).toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })}` : p.publishedAt ? `publicado ${new Date(p.publishedAt).toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })}` : new Date(p.createdAt).toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })}</span>
                    <span className="ml-auto flex items-center gap-3">
                      <button type="button" onClick={() => setViewing(p)} className="inline-flex items-center gap-1 text-brand-700 hover:underline"><Eye size={12} />Ver como {p.status === 'PUBLICADO' || p.status === 'PARCIAL' ? 'ficou' : 'vai ficar'}</button>
                      {p.status === 'RASCUNHO' && <button type="button" onClick={() => continueDraft(p)} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"><Pencil size={12} />Continuar editando</button>}
                      {(p.status === 'AGENDADO' || p.status === 'RASCUNHO') && <button type="button" onClick={() => cancel(p.id)} className="inline-flex items-center gap-1 text-red-700 hover:underline"><Trash2 size={12} />Cancelar</button>}
                    </span>
                  </div>
                  {p.caption && <p className="mt-1 line-clamp-2 text-gray-600">{p.caption}</p>}
                  <ul className="mt-1 space-y-0.5">
                    {(p.connectionIds as string[]).map((id) => {
                      const c = conns.find((x) => x.id === id); const r = p.results?.[id]
                      return <li key={id} className="text-gray-600">{c ? `${c.channel === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} · ${c.label}` : 'Conta'}: {r ? (r.state === 'PUBLICADO' ? <>publicado {r.remoteUrl && <a href={r.remoteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand-700 underline">abrir na rede<ExternalLink size={10} /></a>}</> : r.state === 'EM_ANALISE' ? 'processando o vídeo…' : <span className="text-red-700">erro — {r.error}</span>) : p.status === 'AGENDADO' || p.status === 'RASCUNHO' ? 'aguardando' : 'enviando…'}</li>
                    })}
                  </ul>
                  {p.lastError && <p className="mt-1 text-amber-700">{p.lastError}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {viewing && <StoredPreview post={viewing} conns={conns} onClose={() => setViewing(null)} />}
    </div>
  )
}
