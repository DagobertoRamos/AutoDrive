'use client'
/* eslint-disable @next/next/no-img-element -- miniaturas locais */

// =============================================================================
// Marketing › Post avulso — fotos e vídeos da loja (fora do estoque) no
// Instagram e no Facebook: sobe as mídias, escreve a legenda, vê a prévia no
// celular e publica agora, agenda ou salva como rascunho.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, ExternalLink, ImagePlus, Link2, Loader2, Rocket, Save, Trash2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, ErrorNote, inputCls, PubTabs } from '@/components/publications/ui'
import { PostPreview, type PreviewMedia } from '@/components/publications/PostPreview'
import { AVULSA_FORMATS, AVULSA_LABEL, MAX_VIDEO_BYTES, PART_BYTES, validateAvulsa, type AvulsaFormat, type AvulsaMedia } from '@/lib/publications/social/avulsa-core'
import { classifyVideo, VIDEO_HINT } from '@/lib/publications/social/video-core'

interface Conn { id: string; channel: string; label: string; status: string }
interface Item { key: string; media: AvulsaMedia | null; preview: string; kind: 'image' | 'video'; name: string; progress: number; error?: string }
/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS: Record<string, { label: string; cls: string }> = {
  RASCUNHO: { label: 'Rascunho', cls: 'bg-gray-100 text-gray-600' }, AGENDADO: { label: 'Agendado', cls: 'bg-blue-50 text-blue-700' },
  ENVIANDO: { label: 'Enviando / processando', cls: 'bg-amber-50 text-amber-700' }, PUBLICADO: { label: 'Publicado', cls: 'bg-green-50 text-green-700' },
  PARCIAL: { label: 'Publicado em parte', cls: 'bg-amber-50 text-amber-700' }, FALHA: { label: 'Falhou', cls: 'bg-red-50 text-red-700' }, CANCELADO: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-400' },
}

/** Reduz a foto no navegador (lado maior 2160 px, JPEG): sobe rápido e cabe no limite. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 2160 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Não foi possível ler a foto.'))), 'image/jpeg', 0.9))
}

async function postRaw(url: string, body: Blob): Promise<any> {
  const r = await fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.success === false) throw new Error(j.error ?? `Erro ${r.status}`)
  return j
}

export default function PostAvulsoPage() {
  const [conns, setConns] = useState<Conn[]>([])
  const [sel, setSel] = useState<string[]>([])
  const [format, setFormat] = useState<AvulsaFormat>('POST')
  const [items, setItems] = useState<Item[]>([])
  const [caption, setCaption] = useState('')
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const [when, setWhen] = useState('')
  const [tz, setTz] = useState('America/Sao_Paulo')
  const [contacts, setContacts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [posts, setPosts] = useState<any[] | null>(null)
  const [net, setNet] = useState<'INSTAGRAM' | 'FACEBOOK'>('INSTAGRAM')

  const loadPosts = useCallback(() => { api('/api/publications/avulsa').then((j) => setPosts(j.data)).catch(() => setPosts([])) }, [])
  useEffect(() => {
    api('/api/publications/connections').then((j) => {
      const list = (j.data.connections as Conn[]).filter((c) => (c.channel === 'INSTAGRAM' || c.channel === 'META_PAGE') && c.status === 'CONECTADO')
      setConns(list); setSel(list.map((c) => c.id))
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
      for (let i = 0; i < parts; i++) {
        await postRaw(`/api/publications/avulsa/upload?kind=video&uploadId=${uploadId}&index=${i}`, f.slice(i * PART_BYTES, (i + 1) * PART_BYTES))
        setItem(key, { progress: Math.round(((i + 1) / parts) * 100) })
      }
      setItem(key, { media: { type: 'video', uploadId, parts, size: f.size, name: f.name.slice(0, 120) } })
    } catch (e) { setItem(key, { error: `Envio interrompido: ${(e as Error).message}` }) }
  }

  const useLink = () => {
    const v = classifyVideo(link)
    if (!v?.downloadUrl) { setMsg({ ok: false, text: v ? `Link do ${v.label} não pode ser baixado. ${VIDEO_HINT}` : `Link não reconhecido. ${VIDEO_HINT}` }); return }
    setItems([{ key: crypto.randomUUID(), media: { type: 'video', link: v.url }, preview: v.siteUrl ?? '', kind: 'video', name: `Vídeo (${v.label})`, progress: 100 }])
    setLink('')
  }

  const media = items.flatMap((i) => (i.media ? [i.media] : []))
  const uploading = items.some((i) => !i.media && !i.error)
  const problem = validateAvulsa(format, media, caption)
  const selConns = conns.filter((c) => sel.includes(c.id))
  const previewNet = selConns.some((c) => (net === 'INSTAGRAM' ? c.channel === 'INSTAGRAM' : c.channel === 'META_PAGE')) ? net : selConns[0]?.channel === 'META_PAGE' ? 'FACEBOOK' : 'INSTAGRAM'
  const account = selConns.find((c) => (previewNet === 'INSTAGRAM' ? c.channel === 'INSTAGRAM' : c.channel === 'META_PAGE'))?.label ?? 'sua loja'
  const previewMedia: PreviewMedia[] = useMemo(() => items.filter((i) => i.preview).map((i) => ({ type: i.kind, url: i.preview })), [items])

  const insertContacts = () => {
    const lines = [contacts.whatsapp && `💬 WhatsApp: ${contacts.whatsapp}`, contacts.instagram && `📸 Instagram: ${contacts.instagram.startsWith('@') ? contacts.instagram : `@${contacts.instagram}`}`, contacts.site && `🌐 ${contacts.site}`].filter(Boolean)
    if (lines.length) setCaption((c) => `${c.trimEnd()}\n\n${lines.join('\n')}`.trimStart())
  }

  const submit = async (mode: 'AGORA' | 'AGENDAR' | 'RASCUNHO') => {
    setBusy(mode); setMsg(null)
    try {
      const j = await api('/api/publications/avulsa', { method: 'POST', json: { title, format, caption, media, connectionIds: sel, mode, scheduledLocal: mode === 'AGENDAR' ? when : undefined } })
      setMsg({ ok: true, text: j.message }); setItems([]); setCaption(''); setTitle(''); setWhen(''); loadPosts()
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(null) }
  }

  const cancel = async (id: string) => {
    if (!confirm('Cancelar este post?')) return
    try { await api(`/api/publications/avulsa/${id}`, { method: 'DELETE' }); loadPosts() } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Post avulso</h1>
        <p className="text-sm text-gray-500">Fotos e vídeos da loja (bastidores, entregas, eventos, promoções) no Instagram e no Facebook — publique agora ou agende.</p>
      </div>
      <PubTabs />
      {msg && <p role="status" className={cn('rounded-lg px-3 py-2 text-xs', msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700')}>{msg.text}</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr,320px]">
        <section className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-700">Contas</p>
            {conns.map((c) => <label key={c.id} className="mr-4 inline-flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} />{c.channel === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} · {c.label}</label>)}
            {!conns.length && <p className="text-xs text-gray-500">Conecte o Instagram ou a Página do Facebook em Canais conectados.</p>}
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Formato">
            {AVULSA_FORMATS.map((f) => <button key={f} type="button" aria-pressed={format === f} onClick={() => { setFormat(f); setItems([]) }} className={cn('rounded-full border px-3 py-1 text-xs', format === f ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 text-gray-600')}>{AVULSA_LABEL[f]}</button>)}
          </div>

          <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap gap-2">
              {(format === 'POST' || format === 'STORY') && (
                <label className="btn-secondary cursor-pointer px-3 py-1.5 text-xs"><ImagePlus size={14} />{format === 'POST' ? 'Adicionar fotos (até 10)' : 'Escolher foto'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple={format === 'POST'} className="hidden" onChange={(e) => { if (e.target.files?.length) { if (format === 'STORY') setItems([]); void addImages(e.target.files) } e.target.value = '' }} />
                </label>
              )}
              {(format === 'REELS' || format === 'STORY') && (
                <label className="btn-secondary cursor-pointer px-3 py-1.5 text-xs"><Upload size={14} />Escolher vídeo (até {Math.round(MAX_VIDEO_BYTES / 1048576)} MB)
                  <input type="file" accept="video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addVideo(f); e.target.value = '' }} />
                </label>
              )}
            </div>
            {(format === 'REELS' || format === 'STORY') && (
              <div className="flex gap-2">
                <input className={cn(inputCls, 'text-xs')} value={link} onChange={(e) => setLink(e.target.value)} placeholder="…ou cole o link do vídeo (Google Drive, Dropbox, .mp4)" />
                <button type="button" onClick={useLink} className="btn-secondary px-2 py-1 text-xs"><Link2 size={14} />Usar link</button>
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

          {format !== 'STORY' && (
            <label className="block text-xs font-medium text-gray-600">
              <span className="flex items-center justify-between">Legenda <span className="flex items-center gap-2"><button type="button" onClick={insertContacts} className="text-brand-700 hover:underline">Inserir contatos da loja</button><span className="text-gray-400">{caption.length}/2200</span></span></span>
              <textarea rows={8} className={inputCls} value={caption} maxLength={2200} onChange={(e) => setCaption(e.target.value)} placeholder="Escreva a legenda do post…" />
            </label>
          )}
          <label className="block max-w-sm text-xs font-medium text-gray-600">Nome interno (opcional)<input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Entrega da semana" /></label>

          {problem && media.length > 0 && <ErrorNote message={problem} />}
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3">
            <button type="button" onClick={() => submit('AGORA')} disabled={!!busy || uploading || !!problem || !sel.length} className="btn-primary px-4 py-2 text-sm">{busy === 'AGORA' ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}Publicar agora</button>
            <label className="text-xs text-gray-600">Agendar ({tz.replace('_', ' ')})<input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} /></label>
            <button type="button" onClick={() => submit('AGENDAR')} disabled={!!busy || uploading || !!problem || !when || !sel.length} className="btn-secondary px-3 py-2 text-sm"><CalendarClock size={15} />Agendar</button>
            <button type="button" onClick={() => submit('RASCUNHO')} disabled={!!busy || uploading || !media.length} className="btn-secondary ml-auto px-3 py-2 text-sm"><Save size={15} />Salvar rascunho</button>
            {uploading && <p className="w-full text-xs text-amber-700">Aguarde terminar o envio das mídias…</p>}
          </div>
        </section>

        <aside className="space-y-2">
          <div className="flex justify-center gap-1.5" role="tablist" aria-label="Rede">
            {(['INSTAGRAM', 'FACEBOOK'] as const).map((n) => <button key={n} role="tab" aria-selected={previewNet === n} onClick={() => setNet(n)} className={cn('rounded-full border px-3 py-0.5 text-xs', previewNet === n ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 text-gray-600')}>{n === 'INSTAGRAM' ? 'Instagram' : 'Facebook'}</button>)}
          </div>
          <PostPreview network={previewNet} format={format === 'POST' ? (previewMedia.length > 1 ? 'CARROSSEL' : 'POST') : format} account={account} media={previewMedia} caption={format === 'STORY' ? '' : caption} />
          <p className="text-center text-[11px] text-gray-500">Prévia de como aparece no celular. Vídeo é ajustado para 9:16 (vertical) sem cortar.</p>
        </aside>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">Posts avulsos</h2>
        {!posts ? <Loader2 className="animate-spin text-gray-400" /> : !posts.length ? <p className="text-xs text-gray-500">Nenhum post avulso ainda.</p> : (
          <ul className="space-y-2">
            {posts.map((p) => {
              const st = STATUS[p.status] ?? STATUS.RASCUNHO
              return (
                <li key={p.id} className="rounded-xl border border-gray-200 bg-white p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full px-2 py-0.5 font-medium', st.cls)}>{st.label}</span>
                    <b className="text-gray-800">{p.title || AVULSA_LABEL[p.format as AvulsaFormat] || p.format}</b>
                    <span className="text-gray-500">{p.scheduledAt && (p.status === 'AGENDADO') ? `agendado para ${new Date(p.scheduledAt).toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })}` : new Date(p.createdAt).toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' })}</span>
                    {(p.status === 'AGENDADO' || p.status === 'RASCUNHO') && <button type="button" onClick={() => cancel(p.id)} className="ml-auto inline-flex items-center gap-1 text-red-700 hover:underline"><Trash2 size={12} />Cancelar</button>}
                  </div>
                  {p.caption && <p className="mt-1 line-clamp-2 text-gray-600">{p.caption}</p>}
                  <ul className="mt-1 space-y-0.5">
                    {(p.connectionIds as string[]).map((id) => {
                      const c = conns.find((x) => x.id === id); const r = p.results?.[id]
                      return <li key={id} className="text-gray-600">{c ? `${c.channel === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} · ${c.label}` : 'Conta'}: {r ? (r.state === 'PUBLICADO' ? <>publicado {r.remoteUrl && <a href={r.remoteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand-700 underline">ver<ExternalLink size={10} /></a>}</> : r.state === 'EM_ANALISE' ? 'processando o vídeo…' : <span className="text-red-700">falhou — {r.error}</span>) : p.status === 'AGENDADO' || p.status === 'RASCUNHO' ? 'aguardando' : 'enviando…'}</li>
                    })}
                  </ul>
                  {p.lastError && <p className="mt-1 text-amber-700">{p.lastError}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
