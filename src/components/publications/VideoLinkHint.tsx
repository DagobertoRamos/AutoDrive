'use client'

// Explica o que acontece com o link do vídeo do carro (site, posts, Reels).
import { classifyVideo, VIDEO_HINT } from '@/lib/publications/social/video-core'

export function VideoLinkHint({ url }: { url: string }) {
  const u = url.trim()
  if (!u) return <span className="text-[11px] text-gray-400">{VIDEO_HINT}</span>
  const v = classifyVideo(u)
  if (!v) return <span className="text-[11px] text-red-700">Link não reconhecido. {VIDEO_HINT}</span>
  return (
    <span className="text-[11px] text-gray-500">
      {v.label}: {[v.siteUrl ? 'aparece no site' : 'no site vira link', 'vai clicável nos posts do Facebook', v.downloadUrl ? 'pode ser publicado como Reels (formato "Vídeo do carro")' : 'não pode virar Reels (os termos do serviço proíbem baixar)'].join(' · ')}.
    </span>
  )
}
