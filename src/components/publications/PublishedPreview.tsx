'use client'

// Detalhe da publicação (Instagram/Facebook): "Ver como ficou".
//   Publicado → busca na rede o post REAL (vídeo tocando, carrossel, legenda).
//   Ainda não publicado, ou Story vencido → remonta a prévia (tocável, com a
//   mesma música) com os dados atuais do carro.
import { useState } from 'react'
import { ExternalLink, Eye, Loader2 } from 'lucide-react'
import { api, ErrorNote } from '@/components/publications/ui'
import { PostPreview, type PreviewAudio, type PreviewFormat, type PreviewMedia } from '@/components/publications/PostPreview'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Data = { network: 'INSTAGRAM' | 'FACEBOOK'; account: string; media: PreviewMedia[]; caption: string; music: string | null; audio?: PreviewAudio | null; slides?: number[] | null; real?: boolean; permalink?: string | null; note?: string | null }

/** Busca a mídia real (se publicada) e, sem ela, a prévia remontada. */
export async function loadPreview(opts: { publicationId?: string; socialPostId?: string; connectionId: string; vehicleId?: string; overrides?: any; published: boolean }): Promise<Data> {
  let note: string | null = null
  if (opts.published) {
    const r = await api('/api/publications/remote-media', { method: 'POST', json: opts.publicationId ? { publicationId: opts.publicationId } : { socialPostId: opts.socialPostId, connectionId: opts.connectionId } }).catch(() => null)
    if (r?.data) return { network: r.network, account: r.account, media: r.data.media, caption: r.data.caption, music: null, real: true, permalink: r.data.permalink }
    note = r?.reason ?? null
  }
  if (!opts.vehicleId) throw new Error(note ?? 'Prévia indisponível.')
  const s = opts.overrides?.social
  const j = await api('/api/publications/social/post-preview', { method: 'POST', json: { vehicleId: opts.vehicleId, connectionId: opts.connectionId, format: s.format, template: s.template, music: s.music ?? null, caption: opts.overrides?.caption ?? '' } })
  return { ...j, note }
}

export function PreviewView({ data, format }: { data: Data; format: PreviewFormat }) {
  const realFormat: PreviewFormat = data.real && format === 'POST' && data.media.length > 1 ? 'CARROSSEL' : format
  return (
    <div className="space-y-2">
      {data.real && <p className="text-center text-[11px] font-medium text-green-700">Como está na rede agora (mídia real publicada)</p>}
      <PostPreview network={data.network} format={realFormat} account={data.account} media={data.media} caption={data.caption} music={data.music} audio={data.audio} slides={data.slides} />
      {data.permalink && <p className="text-center text-[11px]"><a href={data.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 underline">Abrir na rede<ExternalLink size={11} /></a></p>}
      {!data.real && <p className="text-center text-[11px] text-gray-500">{data.note ? `${data.note} ` : ''}Prévia montada com os dados atuais do carro — aperte ▶ para tocar.</p>}
    </div>
  )
}

export function PublishedPreview({ publicationId, vehicleId, connectionId, overrides, published }: { publicationId?: string; vehicleId: string; connectionId: string; overrides: any; published: boolean }) {
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const s = overrides?.social
  if (!s?.format) return null
  const open = async () => {
    setBusy(true); setErr(null)
    try { setData(await loadPreview({ publicationId, connectionId, vehicleId, overrides, published })) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <section className="space-y-2">
      {!data && <button type="button" onClick={open} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs">{busy ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}Ver como {published ? 'ficou' : 'vai ficar'} no celular</button>}
      {err && <ErrorNote message={err} />}
      {data && <PreviewView data={data} format={s.format as PreviewFormat} />}
    </section>
  )
}
