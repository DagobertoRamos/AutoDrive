'use client'

// Nova publicação: pré-visualiza cada formato em cada conta (Instagram/Facebook)
// com a legenda e as mídias reais que vão ser enviadas.
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, Drawer, ErrorNote } from '@/components/publications/ui'
import { FORMAT_INFO, type ArtTemplate, type SocialFormat } from '@/lib/publications/social/formats'
import type { MusicChoice } from '@/lib/publications/social/music-core'
import { PostPreview, type PreviewAudio, type PreviewMedia } from '@/components/publications/PostPreview'
import { socialName, type SocialNetwork } from '@/lib/publications/channels'

interface Target { id: string; channel: string; label: string }

export function SocialPreviewModal({ vehicleId, vehicleTitle, targets, formats, template, design, seconds, music, captions, onClose }: {
  vehicleId: string; vehicleTitle: string; targets: Target[]; formats: SocialFormat[]; template: ArtTemplate; design?: string; seconds?: number; music: MusicChoice | null; captions: Record<string, string>; onClose: () => void
}) {
  const [format, setFormat] = useState<SocialFormat>(formats[0])
  const [conn, setConn] = useState<string>(targets[0]?.id ?? '')
  type Data = { network: SocialNetwork; account: string; media: PreviewMedia[]; caption: string; music: string | null; audio: PreviewAudio | null; slides: number[] | null; musicNote?: string | null }
  const key = `${vehicleId}|${conn}|${format}`
  const [res, setRes] = useState<{ key: string; data?: Data; err?: string } | null>(null)
  const current = res?.key === key ? res : null
  const data = current?.data ?? null
  const err = current?.err ?? null

  useEffect(() => {
    if (!conn) return
    api('/api/publications/social/post-preview', { method: 'POST', json: { vehicleId, connectionId: conn, format, template, design, seconds, music, caption: captions[`${vehicleId}:${format}`] ?? '' } })
      .then((j) => setRes({ key, data: j })).catch((e) => setRes({ key, err: (e as Error).message }))
  }, [key, vehicleId, conn, format, template, design, seconds, music, captions])

  return (
    <Drawer open onClose={onClose} title="Pré-visualização" subtitle={`${vehicleTitle} · como vai aparecer no celular`}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Formato">
          {formats.map((f) => <button key={f} role="tab" aria-selected={format === f} onClick={() => setFormat(f)} className={cn('rounded-full border px-2.5 py-0.5 text-xs', format === f ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-200 text-gray-600')}>{FORMAT_INFO[f].label}</button>)}
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Conta">
          {targets.map((t) => <button key={t.id} role="tab" aria-selected={conn === t.id} onClick={() => setConn(t.id)} className={cn('rounded-lg border px-2 py-0.5 text-xs', conn === t.id ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-gray-200 text-gray-600')}>{socialName(t.channel)} · {t.label}</button>)}
        </div>
        {err && <ErrorNote message={err} />}
        {!data && !err ? <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
          : data && <>{data.musicNote && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">🎵 {data.musicNote}</p>}<PostPreview key={key} network={data.network} format={format} account={data.account} media={data.media} caption={data.caption} music={data.music} audio={data.audio} slides={data.slides} /></>}
        <p className="text-center text-[11px] text-gray-500">A legenda mostrada é a final (com contatos e hashtags). Aperte ▶ para ver como vídeo, com a música que vai no post. Reels: passa todas as fotos e termina com a chamada para o WhatsApp.</p>
      </div>
    </Drawer>
  )
}
