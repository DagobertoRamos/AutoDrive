'use client'
 

// Prévia de um post avulso guardado: publicado → o post REAL da rede (vídeo
// tocando, carrossel); ainda não publicado → as mídias guardadas (o vídeo
// enviado em pedaços toca direto do servidor).
import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, Drawer } from '@/components/publications/ui'
import { PostPreview, type PreviewFormat, type PreviewMedia } from '@/components/publications/PostPreview'
import { AVULSA_LABEL, type AvulsaFormat, type AvulsaMedia } from '@/lib/publications/social/avulsa-core'
import { classifyVideo } from '@/lib/publications/social/video-core'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Conn { id: string; channel: string; label: string }

/** Vídeo enviado em pedaços, tocado direto do servidor (por faixas). */
export const partsUrl = (m: { uploadId: string; parts: number; size: number }) => `/api/publications/avulsa/video?${new URLSearchParams({ u: m.uploadId, n: String(m.parts), s: String(m.size) })}`

export function storedPreview(media: AvulsaMedia[]): { items: PreviewMedia[]; link?: string } {
  const items: PreviewMedia[] = []
  let link: string | undefined
  for (const m of media) {
    if (m.type === 'image') items.push({ type: 'image', url: `/api/site/assets/${m.assetId}` })
    else if (m.type === 'link') link = m.url
    else if ('uploadId' in m) items.push({ type: 'video', url: partsUrl(m) })
    else items.push({ type: 'image', url: '', note: 'link' in m ? `Vídeo por link (${classifyVideo(m.link)?.label ?? 'link'})` : 'Vídeo' })
  }
  return { items: items.filter((i) => i.url), link }
}

export function StoredPreview({ post, conns, onClose }: { post: any; conns: Conn[]; onClose: () => void }) {
  const targets = conns.filter((c) => (post.connectionIds as string[]).includes(c.id))
  const [cid, setCid] = useState<string>(targets[0]?.id ?? '')
  const c = targets.find((t) => t.id === cid)
  const { items, link } = storedPreview(post.media as AvulsaMedia[])
  const format: PreviewFormat = post.format === 'POST' ? (items.length > 1 ? 'CARROSSEL' : 'POST') : post.format
  const r = post.results?.[cid]
  // Publicado: mostra o post REAL da rede (vídeo tocando, carrossel, legenda).
  const [real, setReal] = useState<{ key: string; data: any } | null>(null)
  const realKey = `${post.id}:${cid}`
  useEffect(() => {
    if (r?.state !== 'PUBLICADO' || !r?.remoteId) return
    let live = true
    api('/api/publications/remote-media', { method: 'POST', json: { socialPostId: post.id, connectionId: cid } }).then((j) => { if (live) setReal({ key: realKey, data: j.data ? { ...j, ...j.data } : null }) }).catch(() => undefined)
    return () => { live = false }
  }, [post.id, cid, r?.state, r?.remoteId, realKey])
  const shown = real?.key === realKey ? real.data : null
  return (
    <Drawer open onClose={onClose} title="Como ficou o post" subtitle={post.title || AVULSA_LABEL[post.format as AvulsaFormat]}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">{targets.map((t) => <button key={t.id} onClick={() => setCid(t.id)} className={cn('rounded-lg border px-2 py-0.5 text-xs', cid === t.id ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-gray-200 text-gray-600')}>{t.channel === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} · {t.label}</button>)}</div>
        {r?.remoteUrl && <a href={r.remoteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 underline">Abrir o post na rede<ExternalLink size={11} /></a>}
        {shown ? (
          <>
            <p className="text-center text-[11px] font-medium text-green-700">Como está na rede agora (mídia real publicada)</p>
            <PostPreview key={realKey} network={shown.network} format={format === 'POST' && shown.media.length > 1 ? 'CARROSSEL' : format} account={shown.account} media={shown.media} caption={post.format === 'STORY' ? '' : shown.caption} link={link} />
          </>
        ) : <PostPreview key={realKey} network={c?.channel === 'INSTAGRAM' ? 'INSTAGRAM' : 'FACEBOOK'} format={format} account={c?.label ?? ''} media={items} caption={post.format === 'STORY' ? '' : post.caption ?? ''} link={link} />}
        {!shown && !items.length && post.format !== 'LINK' && <p className="text-center text-[11px] text-gray-500">As mídias deste post já foram limpas do servidor para economizar espaço. Abra o post na rede para ver.</p>}
      </div>
    </Drawer>
  )
}
