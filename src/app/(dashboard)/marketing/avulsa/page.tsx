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
import { CalendarClock, ExternalLink, Eye, FileText, ImagePlus, Layers, Link2, Loader2, Pencil, RefreshCw, Rocket, Save, ScanSearch, Sparkles, Stamp, Trash2, Upload, X } from 'lucide-react'
import { CADENCE_NOTICE } from '@/lib/publications/social/cadence-core'
import { OCCASION_LABEL, OCCASIONS, type Occasion } from '@/lib/publications/social/avulsa-text-core'
import { CAR_KIND_LABEL, CAR_KINDS, type CarKind } from '@/lib/publications/social/caption-library-core'
import { partsUrl, StoredPreview } from '@/components/publications/AvulsaPreview'
import { cn } from '@/lib/utils'
import { api, ErrorNote, inputCls, PubTabs } from '@/components/publications/ui'
import { PostPreview, type PreviewFormat, type PreviewMedia } from '@/components/publications/PostPreview'
import { AVULSA_FORMATS, AVULSA_LABEL, FACEBOOK_ONLY, MAX_BLOB_VIDEO_BYTES, MAX_VIDEO_BYTES, PART_BYTES, validateAvulsa, type AvulsaFormat, type AvulsaMedia, isBrandMark, type BrandMark } from '@/lib/publications/social/avulsa-core'
import { classifyVideo, VIDEO_HINT } from '@/lib/publications/social/video-core'

interface Conn { id: string; channel: string; label: string; status: string }
interface Item { key: string; media: AvulsaMedia | null; preview: string; kind: 'image' | 'video'; name: string; progress: number; error?: string; /** Tamanho do vídeo (para a prévia da marca). */ vw?: number; vh?: number }
interface Guess { kind: CarKind; model: string | null; brand: string | null; source: 'texto' | 'ia'; confidence: number; scene?: string | null }
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

/**
 * Do vídeo, no navegador: a capa (quadro de 1 s), o tamanho e uma folha com
 * 3 quadros lado a lado (início, meio e fim) para identificar o carro.
 */
async function videoFrames(file: File): Promise<{ poster: Blob | null; sheet: string | null; w: number; h: number }> {
  try {
    const v = document.createElement('video')
    v.muted = true; v.preload = 'auto'; v.src = URL.createObjectURL(file)
    await new Promise<void>((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('vídeo')) })
    const seek = async (t: number) => { v.currentTime = t; await new Promise<void>((res) => { v.onseeked = () => res() }) }
    const d = v.duration || 2
    const grab = (max: number) => {
      const c = document.createElement('canvas')
      const scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight))
      c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale)
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
      return c
    }
    await seek(Math.min(1, d / 2))
    const poster = await new Promise<Blob | null>((res) => grab(720).toBlob((b) => res(b), 'image/jpeg', 0.8))
    const frames: HTMLCanvasElement[] = []
    for (const t of [d * 0.2, d * 0.5, d * 0.8]) { await seek(t); frames.push(grab(480)) }
    const sheet = document.createElement('canvas')
    sheet.width = frames.reduce((a, c) => a + c.width, 0); sheet.height = Math.max(...frames.map((c) => c.height))
    let x = 0
    for (const c of frames) { sheet.getContext('2d')!.drawImage(c, x, 0); x += c.width }
    return { poster, sheet: sheet.toDataURL('image/jpeg', 0.7), w: v.videoWidth, h: v.videoHeight }
  } catch { return { poster: null, sheet: null, w: 0, h: 0 } }
}

/** Foto reduzida (para identificar o carro). */
async function photoSheet(file: Blob): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 800 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.75)
  } catch { return null }
}

async function postRaw(url: string, body: Blob): Promise<any> {
  let r: Response
  try {
    r = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' } })
  } catch {
    throw new Error('sem conexão com o servidor (internet caiu ou oscilou)')
  }
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.success === false) throw new Error(j.error ?? (r.status === 401 ? 'sessão expirada — entre de novo' : r.status === 413 ? 'pedaço grande demais para o servidor' : `erro ${r.status} do servidor`))
  return j
}

/** Envia com novas tentativas (rede do celular oscila): 3 tentativas, esperando 1,5 s, 4 s e 8 s. */
async function postRetry(url: string, body: Blob, tries = 4): Promise<any> {
  let last: Error = new Error('falha no envio')
  for (let t = 0; t < tries; t++) {
    try { return await postRaw(url, body) } catch (e) {
      last = e as Error
      if (/sessão expirada|grande demais/.test(last.message)) break
      if (t < tries - 1) await new Promise((ok) => setTimeout(ok, [1500, 4000, 8000][t] ?? 8000))
    }
  }
  throw last
}

/** Promessa com prazo (o navegador do celular às vezes não lê o vídeo e fica esperando). */
const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> => Promise.race([p, new Promise<T>((ok) => setTimeout(() => ok(fallback), ms))])

/** Envios de vídeo em andamento (para retomar de onde parou). */
type PendingUpload = { file: Blob; name: string; uploadId: string; parts: number; next: number; posterAssetId?: string; /** Pasta no armazenamento de arquivos (vídeo fora do banco); sem ela, envia em pedaços para o banco. */ blobFolder?: string }
const pendingUploads = new Map<string, PendingUpload>()
/** Tipo do armazenamento (público por padrão; troca sozinho se for privado). */
let blobAccess: 'public' | 'private' = 'public'

/** Nome seguro para o arquivo no armazenamento. */
const safeName = (n: string) => (n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-80) || 'video.mp4')

/** Mídias guardadas → prévia (fotos e capa do vídeo servidas pela loja). */

/** Rascunho salvo → itens do editor (com miniatura de volta). */
function itemsFromMedia(media: AvulsaMedia[]): Item[] {
  return media.flatMap((m): Item[] => {
    if (m.type === 'link') return []
    if (m.type === 'image') return [{ key: crypto.randomUUID(), media: m, preview: `/api/site/assets/${m.assetId}`, kind: 'image', name: 'Foto', progress: 100 }]
    if ('link' in m) return [{ key: crypto.randomUUID(), media: m, preview: classifyVideo(m.link)?.siteUrl ?? '', kind: 'video', name: `Vídeo (${classifyVideo(m.link)?.label ?? 'link'})`, progress: 100 }]
    if ('blobUrl' in m) return [{ key: crypto.randomUUID(), media: m, preview: m.blobUrl, kind: 'video', name: m.name ?? 'Vídeo', progress: 100 }]
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
  const [brandStyle, setBrandStyle] = useState<BrandMark>('ASSINATURA')
  useEffect(() => {
    const t = setTimeout(() => { try { const p = JSON.parse(localStorage.getItem('autodrive:avulsa:marca:v1') ?? 'null'); if (p) { setBrandOn(!!p.on); if (isBrandMark(p.style)) setBrandStyle(p.style) } } catch { /* sem armazenamento */ } }, 0)
    return () => clearTimeout(t)
  }, [])
  const setBrand = (on: boolean, style: BrandMark) => { setBrandOn(on); setBrandStyle(style); try { localStorage.setItem('autodrive:avulsa:marca:v1', JSON.stringify({ on, style })) } catch { /* ok */ } }
  const brand: BrandMark | null = brandOn ? brandStyle : null
  // Assistente de texto: biblioteca por TIPO DE CARRO (600 legendas por tipo,
  // identificado sozinho pelo vídeo/foto) ou modelo por OCASIÃO; os dois com IA opcional.
  const [textMode, setTextMode] = useState<'TIPO' | 'OCASIAO'>('TIPO')
  const [occasion, setOccasion] = useState<Occasion>('ENTREGA')
  const [carKind, setCarKind] = useState<CarKind>('DIA_A_DIA')
  const [guess, setGuess] = useState<Guess | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [detectNote, setDetectNote] = useState<string | null>(null)
  const [variant, setVariant] = useState<{ n: number; total: number } | null>(null)
  const [notes, setNotes] = useState('')
  const [lastSheet, setLastSheet] = useState<{ image: string | null; hints: string } | null>(null)
  const kindBody = (k: CarKind, g: Guess | null) => ({ kind: k, model: g?.kind === k ? g.model : null, brand: g?.kind === k ? g.brand : null })
  const writeText = async (useAi: boolean, opts: { next?: boolean; kind?: CarKind; g?: Guess | null; quiet?: boolean } = {}) => {
    if (!opts.quiet && !opts.next && caption.trim() && !confirm('Substituir o texto que já está escrito?')) return
    setBusy(useAi ? 'IA' : 'MODELO'); if (!opts.quiet) setMsg(null)
    const k = opts.kind ?? carKind
    try {
      const body = textMode === 'TIPO' || opts.kind
        ? { ...kindBody(k, opts.g !== undefined ? opts.g : guess), notes, format, useAi, ...(opts.next && variant ? { variant: variant.n + 1 } : {}) }
        : { occasion, notes, format, useAi }
      const j = await api('/api/publications/avulsa/caption', { method: 'POST', json: body })
      setCaption(j.text)
      setVariant(typeof j.variant === 'number' ? { n: j.variant, total: j.total } : null)
      if (!opts.quiet) setMsg({ ok: true, text: j.ai ? `Texto escrito pela IA (${j.source}). Revise antes de publicar.` : useAi ? 'Nenhuma IA configurada: usei a legenda pronta com os dados da loja.' : 'Legenda pronta preenchida com o nome e os contatos da loja — ajuste à vontade.' })
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }
  /** Identifica o tipo de carro (quadros do vídeo/foto + nome do arquivo) e, se a legenda está vazia, já escreve. */
  const detect = async (image: string | null, hints: string, autoFill: boolean) => {
    setDetecting(true)
    try {
      const j = await api<{ guess: Guess | null; note?: string }>('/api/publications/avulsa/detect', { method: 'POST', json: { image: image ?? undefined, hints: [hints, title, notes].filter(Boolean).join(' ') } })
      if (!j.guess) { setGuess(null); setDetectNote(`Não consegui identificar o carro${j.note ? ` — ${j.note}` : ''}. Escolha o tipo na lista — dica: o nome do arquivo com a marca/modelo (ex.: ferrari-sf90.mp4) já resolve.`); return }
      setDetectNote(null); setGuess(j.guess); setCarKind(j.guess.kind); setTextMode('TIPO')
      if (autoFill) await writeText(false, { kind: j.guess.kind, g: j.guess, quiet: true })
    } catch { /* identificação é ajuda: sem ela, a pessoa escolhe */ } finally { setDetecting(false) }
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

  // Vindo do botão "Subir vídeo" (?formato=REELS): já abre no formato certo.
  useEffect(() => {
    if (!restored) return
    const f = new URLSearchParams(window.location.search).get('formato')
    const t = setTimeout(() => { if (f && (AVULSA_FORMATS as readonly string[]).includes(f) && !items.length) setFormat(f as AvulsaFormat) }, 0)
    return () => clearTimeout(t)
  }, [restored]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const clearEditor = () => { setItems([]); setLinkMedia(''); setCaption(''); setTitle(''); setWhen(''); setEditingId(null); setGuess(null); setDetectNote(null); setVariant(null); setLastSheet(null); try { localStorage.removeItem(DRAFT_KEY) } catch { /* ok */ } }

  const loadPosts = useCallback(() => { api('/api/publications/avulsa').then((j) => { setPosts(j.data) }).catch(() => setPosts([])) }, [])
  useEffect(() => {
    api('/api/publications/connections').then((j) => {
      const list = (j.data.connections as Conn[]).filter((c) => (c.channel === 'INSTAGRAM' || c.channel === 'META_PAGE') && c.status === 'CONECTADO')
      setConns(list); setSel((cur) => (cur.length ? cur : list.map((c) => c.id)))
    }).catch(() => undefined)
    api('/api/publications/settings').then((j) => { setTz(j.data.timezone); setContacts(j.data.contacts ?? {}) }).catch(() => undefined)
    const t = setTimeout(loadPosts, 0); return () => clearTimeout(t)
  }, [loadPosts])

  // Armazenamento de arquivos para vídeos (fora do banco): ligado quando o servidor tem a chave.
  const [blobCfg, setBlobCfg] = useState<{ enabled: boolean; folder: string; reason?: string } | null>(null)
  useEffect(() => { api<{ enabled: boolean; folder: string; reason?: string }>('/api/publications/avulsa/blob').then((j) => setBlobCfg({ enabled: j.enabled, folder: j.folder, reason: j.reason })).catch((e) => setBlobCfg({ enabled: false, folder: '', reason: `Não consegui consultar o armazenamento de vídeos: ${(e as Error).message}` })) }, [])

  const setItem = (key: string, x: Partial<Item>) => setItems((l) => l.map((i) => (i.key === key ? { ...i, ...x } : i)))

  const addImages = async (files: FileList) => {
    const first = !items.length ? files[0] : null
    if (first) void photoSheet(first).then((image) => { setLastSheet({ image, hints: first.name }); return detect(image, first.name, !caption.trim()) })
    for (const f of Array.from(files).slice(0, 10 - items.length)) {
      const key = crypto.randomUUID()
      setItems((l) => [...l, { key, media: null, preview: URL.createObjectURL(f), kind: 'image', name: f.name, progress: 0 }])
      try {
        const j = await postRaw('/api/publications/avulsa/upload?kind=image', await shrink(f))
        setItem(key, { media: { type: 'image', assetId: j.assetId }, progress: 100 })
      } catch (e) { setItem(key, { error: (e as Error).message }) }
    }
  }

  /** Sobe os pedaços que faltam (do `next` em diante); em erro, guarda onde parou para "Continuar envio". */
  const sendParts = async (key: string) => {
    const u = pendingUploads.get(key)
    if (!u) return
    setItem(key, { error: undefined, progress: u.blobFolder ? 0 : Math.round((u.next / u.parts) * 100) })
    if (u.blobFolder) {
      // Direto do celular para o armazenamento de arquivos (em partes, com novas tentativas).
      try {
        const { upload } = await import('@vercel/blob/client')
        const send = (access: 'public' | 'private') => upload(`${u.blobFolder}${safeName(u.name)}`, u.file, {
          access, handleUploadUrl: '/api/publications/avulsa/blob', contentType: u.file.type || 'video/mp4',
          multipart: u.file.size > 8 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => setItem(key, { progress: Math.min(99, Math.round(percentage)) }),
        })
        // Armazenamento criado como privado recusa envio público (e vice-versa): tenta o outro.
        let r
        try { r = await send(blobAccess) } catch (e) {
          if (!/private|public|access/i.test((e as Error).message)) throw e
          blobAccess = blobAccess === 'public' ? 'private' : 'public'
          r = await send(blobAccess)
        }
        pendingUploads.delete(key)
        setItem(key, { progress: 100, media: { type: 'video', blobUrl: r.url, size: u.file.size, name: u.name.slice(0, 120), ...(u.posterAssetId ? { posterAssetId: u.posterAssetId } : {}) } })
      } catch (e) {
        const m = (e as Error).message || 'falha no envio'
        setItem(key, { error: `Envio do vídeo parou: ${/fetch|network|Failed/i.test(m) ? 'sem conexão com o servidor (internet caiu ou oscilou)' : m}` })
      }
      return
    }
    try {
      for (let i = u.next; i < u.parts; i++) {
        await postRetry(`/api/publications/avulsa/upload?kind=video&uploadId=${u.uploadId}&index=${i}`, u.file.slice(i * PART_BYTES, (i + 1) * PART_BYTES))
        u.next = i + 1
        setItem(key, { progress: Math.round(((i + 1) / u.parts) * 100) })
      }
      pendingUploads.delete(key)
      setItem(key, { media: { type: 'video', uploadId: u.uploadId, parts: u.parts, size: u.file.size, name: u.name.slice(0, 120), ...(u.posterAssetId ? { posterAssetId: u.posterAssetId } : {}) } })
    } catch (e) {
      setItem(key, { error: `Envio parou em ${Math.round((u.next / u.parts) * 100)}% (parte ${u.next + 1} de ${u.parts}): ${(e as Error).message}` })
    }
  }

  const addVideo = async (f: File) => {
    if (!f.size) { setMsg({ ok: false, text: 'O celular entregou o vídeo vazio. Escolha de novo (se estiver na nuvem, baixe para o aparelho antes).' }); return }
    const big = blobCfg?.enabled ? f.size > MAX_BLOB_VIDEO_BYTES : f.size > MAX_VIDEO_BYTES
    if (big) { setMsg({ ok: false, text: `Vídeo com mais de ${Math.round((blobCfg?.enabled ? MAX_BLOB_VIDEO_BYTES : MAX_VIDEO_BYTES) / 1048576)} MB. Use um link do Google Drive ou Dropbox.` }); return }
    const key = crypto.randomUUID(); const uploadId = crypto.randomUUID()
    setItems([{ key, media: null, preview: '', kind: 'video', name: f.name, progress: 0 }])
    // Lê o vídeo inteiro AGORA: no celular (Android/Google Fotos) o acesso ao arquivo
    // escolhido pode cair no meio do envio, e aí cada parte falharia.
    let data: Blob
    try {
      data = new Blob([await f.arrayBuffer()], { type: f.type || 'video/mp4' })
      if (data.size !== f.size) throw new Error('leitura incompleta')
    } catch {
      setItem(key, { error: 'O celular não deixou ler este vídeo (ele pode estar só na nuvem, ex.: Google Fotos/Drive). Baixe o vídeo para o aparelho (galeria) e escolha de novo.' })
      return
    }
    setItem(key, { preview: URL.createObjectURL(data) })
    const u: PendingUpload = { file: data, name: f.name, uploadId, parts: Math.ceil(f.size / PART_BYTES), next: 0, ...(blobCfg?.enabled ? { blobFolder: blobCfg.folder } : {}) }
    pendingUploads.set(key, u)
    // Capa, tamanho e identificação do carro: em paralelo e com prazo (não seguram o envio).
    void withTimeout(videoFrames(new File([data], f.name, { type: data.type })), 12_000, { poster: null, sheet: null, w: 0, h: 0 }).then(async (fr) => {
      if (fr.w) setItem(key, { vw: fr.w, vh: fr.h })
      setLastSheet({ image: fr.sheet, hints: f.name })
      void detect(fr.sheet, f.name, !caption.trim())
      if (fr.poster) u.posterAssetId = (await postRaw('/api/publications/avulsa/upload?kind=image', fr.poster).catch(() => null))?.assetId
    })
    await sendParts(key)
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
    // Link (Drive/Dropbox): o navegador não lê os quadros — identifica pelo título/observação.
    setLastSheet({ image: null, hints: '' })
    if (title || notes) void detect(null, '', !caption.trim())
  }

  const media: AvulsaMedia[] = format === 'LINK' ? (classifyVideo(linkMedia) ? [{ type: 'link', url: linkMedia.trim() }] : []) : items.flatMap((i) => (i.media ? [i.media] : []))
  const uploading = items.some((i) => !i.media && !i.error)
  const problem = validateAvulsa(format, media, caption)
  const allowed = (c: Conn) => !FACEBOOK_ONLY.includes(format) || c.channel === 'META_PAGE'
  const selConns = conns.filter((c) => sel.includes(c.id) && allowed(c))
  const previewNet = format === 'LINK' ? 'FACEBOOK' : selConns.some((c) => (net === 'INSTAGRAM' ? c.channel === 'INSTAGRAM' : c.channel === 'META_PAGE')) ? net : selConns[0]?.channel === 'META_PAGE' ? 'FACEBOOK' : 'INSTAGRAM'
  const account = selConns.find((c) => (previewNet === 'INSTAGRAM' ? c.channel === 'INSTAGRAM' : c.channel === 'META_PAGE'))?.label ?? 'sua loja'
  const previewMedia: PreviewMedia[] = useMemo(() => items.filter((i) => i.preview).map((i): PreviewMedia => {
    if (!brand) return { type: i.kind, url: i.preview, contain: i.kind === 'video' }
    if (i.media?.type === 'image') return { type: 'image', url: i.media.branded ? i.preview : `/api/publications/avulsa/brand?${new URLSearchParams({ style: brand, assetId: i.media.assetId })}` }
    return { type: i.kind, url: i.preview, contain: true, overlay: `/api/publications/avulsa/brand?${new URLSearchParams({ style: brand, w: '1080', h: '1920', ...(i.vw && i.vh ? { vw: String(i.vw), vh: String(i.vh) } : {}) })}` }
  }), [items, brand])
  const hasVideo = items.some((i) => i.kind === 'video')
  const pf = (f: AvulsaFormat, n: number): PreviewFormat => (f === 'POST' ? (n > 1 ? 'CARROSSEL' : 'POST') : f)

  const insertContacts = () => {
    const lines = [contacts.whatsapp && `💬 WhatsApp: ${contacts.whatsapp}`, contacts.instagram && `📸 Instagram: ${contacts.instagram.startsWith('@') ? contacts.instagram : `@${contacts.instagram}`}`, contacts.site && `🌐 ${contacts.site}`].filter(Boolean)
    if (lines.length) setCaption((c) => `${c.trimEnd()}\n\n${lines.join('\n')}`.trimStart())
  }

  // Agendamento: automático (melhor horário livre 07:00–20:00, sem repetir) ou dia/hora escolhidos.
  const [whenMode, setWhenMode] = useState<'AUTO' | 'MANUAL'>('AUTO')
  const submit = async (mode: 'AGORA' | 'AGENDAR' | 'RASCUNHO') => {
    setBusy(mode); setMsg(null)
    try {
      let chosen = when
      if (mode === 'AGENDAR' && whenMode === 'AUTO') {
        const ids = selConns.map((c) => c.id)
        const sl = await api<{ slots: Record<string, string> }>('/api/publications/social/slots', { method: 'POST', json: { requests: [{ key: 'post', connectionId: ids[0], also: ids.slice(1), format: format === 'LINK' ? 'POST' : format }] } })
        chosen = sl.slots.post
        if (!chosen) throw new Error('Não encontrei horário livre. Escolha o dia e a hora.')
      }
      const j = await api('/api/publications/avulsa', { method: 'POST', json: { id: editingId, title, format, caption, media, connectionIds: selConns.map((c) => c.id), mode, scheduledLocal: mode === 'AGENDAR' ? chosen : undefined, brand } })
      setMsg({ ok: true, text: mode === 'AGENDAR' && whenMode === 'AUTO' ? `Agendado automaticamente para ${new Date(`${chosen}:00`).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} — horário livre, sem repetir com a agenda.` : j.message }); clearEditor()
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr),320px]">
        <section className="min-w-0 space-y-4">
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
                  <label className="btn-secondary cursor-pointer px-3 py-1.5 text-xs"><Upload size={14} />Carregar vídeo pronto (até {Math.round((blobCfg?.enabled ? MAX_BLOB_VIDEO_BYTES : MAX_VIDEO_BYTES) / 1048576)} MB)
                    <input type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addVideo(f); e.target.value = '' }} />
                  </label>
                )}
              </div>
              {(format === 'REELS' || format === 'STORY') && (
                <>{blobCfg && !blobCfg.enabled && blobCfg.reason && <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{blobCfg.reason}</p>}</>
              )}
              {(format === 'REELS' || format === 'STORY') && (
                <p className="text-[11px] text-gray-500">O vídeo fica guardado no AutoDrive só até ser publicado — depois de postado, ele é apagado automaticamente (rascunho esquecido some em 3 dias).</p>
              )}
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
                    {i.error && <span className="absolute inset-0 flex items-center justify-center bg-red-600/85 p-1 text-center text-[10px] font-medium leading-tight text-white">{/não deixou ler/.test(i.error) ? 'Não deu para ler o vídeo' : 'Envio parou — veja abaixo'}</span>}
                    <button type="button" onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))} aria-label="Remover" className="absolute right-0.5 top-0.5 rounded-full bg-white/90 p-0.5"><X size={12} /></button>
                  </li>
                ))}
              </ul>
              {items.filter((i) => i.error).map((i) => (
                <div key={i.key} role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                  <span className="min-w-0 flex-1">{i.kind === 'video' ? 'Vídeo' : 'Foto'} “{i.name}”: {i.error}</span>
                  {i.kind === 'video' && pendingUploads.has(i.key) && <button type="button" onClick={() => void sendParts(i.key)} className="btn-primary px-2.5 py-1 text-xs"><RefreshCw size={13} />Continuar envio</button>}
                </div>
              ))}
            </div>
          )}

          {format !== 'LINK' && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 text-xs">
              <label className="flex items-center gap-2 font-medium text-gray-800"><input type="checkbox" checked={brandOn} onChange={(e) => setBrand(e.target.checked, brandStyle)} className="rounded border-gray-300 text-brand-600" /><Stamp size={14} className="text-brand-700" />Colocar a marca da loja (logo e @){hasVideo ? ' no vídeo' : ''}</label>
              {brandOn && (
                <select aria-label="Estilo da marca" className={cn(inputCls, 'w-auto max-w-full py-1 text-xs')} value={brandStyle} onChange={(e) => setBrand(true, e.target.value as BrandMark)}>
                  <option value="ASSINATURA">Assinatura — logo e @ limpos, sem cobrir o vídeo (recomendado)</option>
                  <option value="DISCRETO">Discreto — só o logo no canto</option>
                  <option value="COMPLETO">Completo — logo + faixa com nome e WhatsApp</option>
                </select>
              )}
              {brandOn && brandStyle === 'ASSINATURA' && hasVideo && (
                <span className="flex items-center gap-2 text-[11px] text-gray-600"><img src="/api/publications/avulsa/brand?end=1" alt="Encerramento do vídeo" className="h-16 w-9 rounded border border-gray-200 object-cover" />+ encerramento de 2,5 s com logo, @ e WhatsApp</span>
              )}
              <span className="w-full text-[11px] text-gray-500">{!brandOn ? 'Desmarcado: as fotos e vídeos vão exatamente como foram enviados.' : brandStyle === 'ASSINATURA' ? 'Logo e @ pequenos, sem caixa, com sombra suave (logo escuro vira branco para ler em cima da imagem). Vídeo deitado ou quadrado: o logo vai na faixa de cima e o @ na de baixo — nada cobre a imagem. Vídeo em pé: assinatura no canto livre dos botões do Instagram. A prévia ao lado mostra como fica.' : 'Usa o logo, as cores, o nome, o WhatsApp e o @ da loja. A prévia ao lado já mostra como fica; nos vídeos a marca fica fora da área coberta pelos botões do Instagram.'}</span>
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/30 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 font-semibold text-gray-800"><Sparkles size={13} className="text-brand-700" />Texto do post</p>
              <div className="flex gap-1" role="tablist" aria-label="Tipo de legenda">
                {([['TIPO', 'Por tipo de carro'], ['OCASIAO', 'Por ocasião']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={textMode === k} onClick={() => setTextMode(k)} className={cn('rounded-full border px-2.5 py-0.5', textMode === k ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 bg-white text-gray-600')}>{l}</button>)}
              </div>
            </div>
            {textMode === 'TIPO' && (
              <p className="flex flex-wrap items-center gap-1.5 text-[11px]">
                {detecting ? <span className="inline-flex items-center gap-1 text-gray-600"><Loader2 size={12} className="animate-spin" />Identificando o carro do {hasVideo ? 'vídeo' : 'conteúdo'}…</span>
                  : guess ? <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-brand-800 ring-1 ring-brand-200"><ScanSearch size={12} />Identificado{guess.source === 'ia' ? ' pela IA' : ' pelo nome do arquivo'}: <b>{CAR_KIND_LABEL[guess.kind]}</b>{guess.model ? ` — ${guess.model}` : ''}{guess.scene ? ` · ${guess.scene}` : ''}</span>
                  : detectNote ? <span className="text-amber-700">{detectNote}</span>
                  : <span className="text-gray-500">Ao carregar o vídeo ou a foto, o sistema identifica o tipo de carro e escolhe a legenda que mais combina.</span>}
                {lastSheet && !detecting && <button type="button" onClick={() => void detect(lastSheet!.image, lastSheet!.hints, false)} className="text-brand-700 underline">identificar de novo</button>}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {textMode === 'TIPO' ? (
                <select aria-label="Tipo de carro" className={cn(inputCls, 'w-auto max-w-full py-1 text-xs')} value={carKind} onChange={(e) => { setCarKind(e.target.value as CarKind); setVariant(null) }}>
                  {CAR_KINDS.map((k) => <option key={k} value={k}>{CAR_KIND_LABEL[k]}</option>)}
                </select>
              ) : (
                <select aria-label="Ocasião" className={cn(inputCls, 'w-auto max-w-full py-1 text-xs')} value={occasion} onChange={(e) => setOccasion(e.target.value as Occasion)}>
                  {OCCASIONS.map((o) => <option key={o} value={o}>{OCCASION_LABEL[o]}</option>)}
                </select>
              )}
              <input className={cn(inputCls, 'w-full py-1 text-xs sm:w-auto sm:min-w-[200px] sm:flex-1')} value={notes} maxLength={600} onChange={(e) => setNotes(e.target.value)} placeholder={textMode === 'TIPO' ? 'Detalhe (opcional, para a IA): ex. Porsche 911 Carrera S, único dono' : 'Detalhe (opcional): ex. entrega do Compass para a família Souza'} />
              <button type="button" onClick={() => void writeText(false)} disabled={!!busy} className="btn-secondary px-2.5 py-1 text-xs">{busy === 'MODELO' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}{textMode === 'TIPO' ? 'Legenda pronta' : 'Modelo pronto'}</button>
              {textMode === 'TIPO' && variant && <button type="button" onClick={() => void writeText(false, { next: true })} disabled={!!busy} className="btn-secondary px-2.5 py-1 text-xs"><RefreshCw size={13} />Outra opção</button>}
              <button type="button" onClick={() => void writeText(true)} disabled={!!busy} className="btn-primary px-2.5 py-1 text-xs">{busy === 'IA' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}Escrever com IA</button>
            </div>
            <p className="text-[11px] text-gray-500">{textMode === 'TIPO' ? `600 legendas por tipo de carro — do dia a dia ao superluxo, cada uma no tom certo — já com o nome e os contatos da loja.${variant ? ` Opção ${variant.n + 1} de ${variant.total}.` : ''}` : 'O modelo já sai com o nome, a cidade e os contatos da loja.'} Ou escreva/cole o seu próprio texto abaixo.</p>
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
            <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 px-2 py-1.5">
              <fieldset className="space-y-0.5 text-xs text-gray-700">
                <legend className="sr-only">Quando agendar</legend>
                <label className="flex items-center gap-1.5"><input type="radio" name="quando" checked={whenMode === 'AUTO'} onChange={() => setWhenMode('AUTO')} /><b>Automático</b> — melhor horário livre entre 07:00 e 20:00</label>
                <label className="flex items-center gap-1.5"><input type="radio" name="quando" checked={whenMode === 'MANUAL'} onChange={() => setWhenMode('MANUAL')} />Escolher dia e hora</label>
              </fieldset>
              {whenMode === 'MANUAL' && <input type="datetime-local" aria-label={`Dia e hora (${tz.replace('_', ' ')})`} className={cn(inputCls, 'w-auto')} value={when} onChange={(e) => setWhen(e.target.value)} />}
              <button type="button" onClick={() => submit('AGENDAR')} disabled={!!busy || uploading || !!problem || (whenMode === 'MANUAL' && !when) || !selConns.length} className="btn-secondary px-3 py-2 text-sm">{busy === 'AGENDAR' ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />}Agendar</button>
            </div>
            <button type="button" onClick={addToBatch} disabled={!!busy || uploading || !!problem || !!editingId} title={editingId ? 'Termine o rascunho aberto antes de montar um lote' : undefined} className="btn-secondary px-3 py-2 text-sm"><Layers size={15} />Adicionar ao lote{batch.length ? ` (${batch.length})` : ''}</button>
            <button type="button" onClick={() => submit('RASCUNHO')} disabled={!!busy || uploading || !media.length} className="btn-secondary ml-auto px-3 py-2 text-sm"><Save size={15} />Salvar rascunho</button>
            {uploading && <p className="w-full text-xs text-amber-700">Aguarde terminar o envio das mídias…</p>}
          </div>
        </section>

        <aside className="min-w-0 space-y-2">
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
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
