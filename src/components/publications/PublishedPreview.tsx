'use client'

// Detalhe da publicação (Instagram/Facebook do Estúdio): "Ver como ficou" —
// a prévia no celular com a legenda e as mídias desta publicação.
import { useState } from 'react'
import { Eye, Loader2 } from 'lucide-react'
import { api, ErrorNote } from '@/components/publications/ui'
import { PostPreview, type PreviewMedia } from '@/components/publications/PostPreview'
import type { SocialFormat } from '@/lib/publications/social/formats'

/* eslint-disable @typescript-eslint/no-explicit-any */
export function PublishedPreview({ vehicleId, connectionId, overrides, published }: { vehicleId: string; connectionId: string; overrides: any; published: boolean }) {
  const [data, setData] = useState<{ network: 'INSTAGRAM' | 'FACEBOOK'; account: string; media: PreviewMedia[]; caption: string; music: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const s = overrides?.social
  if (!s?.format) return null
  const open = async () => {
    setBusy(true); setErr(null)
    try { setData(await api('/api/publications/social/post-preview', { method: 'POST', json: { vehicleId, connectionId, format: s.format, template: s.template, music: s.music ?? null, caption: overrides?.caption ?? '' } })) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <section className="space-y-2">
      {!data && <button type="button" onClick={open} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs">{busy ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}Ver como {published ? 'ficou' : 'vai ficar'} no celular</button>}
      {err && <ErrorNote message={err} />}
      {data && <PostPreview network={data.network} format={s.format as SocialFormat} account={data.account} media={data.media} caption={data.caption} music={data.music} />}
      {data && published && <p className="text-center text-[11px] text-gray-500">Remontado com os dados atuais do carro. O post publicado é o do link “Abrir anúncio”.</p>}
    </section>
  )
}
