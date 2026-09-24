'use client'
/* eslint-disable @next/next/no-img-element -- fotos/logos da loja vêm de URLs arbitrárias */

// Galeria do anúncio com lightbox e vídeo (porta do VehicleGallery do dagobertoeasycar).
import { useCallback, useEffect, useState } from 'react'
import { EM_BREVE_IMG } from './SiteVehicleImage'

type Media = { type: 'image' | 'video'; url: string }

function youtubeId(url: string): string | null {
  return url.match(/youtu\.be\/([^?&]+)/)?.[1] ?? url.match(/\/shorts\/([^?&/]+)/)?.[1] ?? url.match(/[?&]v=([^?&]+)/)?.[1] ?? null
}

function VideoPlayer({ url, autoplay = false }: { url: string; autoplay?: boolean }) {
  const yt = youtubeId(url)
  if (yt) {
    return (
      <iframe src={`https://www.youtube.com/embed/${yt}?rel=0${autoplay ? '&autoplay=1' : ''}`} title="Vídeo do veículo"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
    )
  }
  return <video className="vehicle-gallery-video" src={url} controls playsInline preload="metadata" autoPlay={autoplay} muted={autoplay} onClick={(e) => e.stopPropagation()} />
}

function Lightbox({ media, start, title, onClose }: { media: Media[]; start: number; title: string; onClose: () => void }) {
  const [idx, setIdx] = useState(start)
  const prev = useCallback(() => setIdx((i) => (i - 1 + media.length) % media.length), [media.length])
  const next = useCallback(() => setIdx((i) => (i + 1) % media.length), [media.length])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') prev(); if (e.key === 'ArrowRight') next() }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', h)
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', h) }
  }, [onClose, prev, next])
  const item = media[idx]
  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Fechar">&times;</button>
      <span className="lightbox-counter">{idx + 1} / {media.length}</span>
      <div className="lightbox-main" onClick={(e) => e.stopPropagation()}>
        {media.length > 1 && <button className="lightbox-nav prev" onClick={prev} aria-label="Anterior">&#8249;</button>}
        {item.type === 'video'
          ? <div style={{ position: 'relative', width: 'min(900px, 85vw)', aspectRatio: '16/9' }}><VideoPlayer url={item.url} autoplay /></div>
          : <img src={item.url} alt={`${title} - ${idx + 1}`} />}
        {media.length > 1 && <button className="lightbox-nav next" onClick={next} aria-label="Próxima">&#8250;</button>}
      </div>
    </div>
  )
}

export function SiteVehicleGallery({ photos, title, videoUrl }: { photos: string[]; title: string; videoUrl: string }) {
  const media: Media[] = [...photos.map((url) => ({ type: 'image' as const, url })), ...(videoUrl ? [{ type: 'video' as const, url: videoUrl }] : [])]
  if (!media.length) media.push({ type: 'image', url: EM_BREVE_IMG })
  const [current, setCurrent] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const item = media[current]
  const zoomable = item.type === 'image' && item.url !== EM_BREVE_IMG

  return (
    <>
      <div className="vehicle-gallery">
        <div className={`vehicle-gallery-main${item.type === 'video' ? ' has-video' : ''}`} onClick={() => { if (zoomable) setLightbox(current) }}>
          {item.type === 'video'
            ? <><VideoPlayer url={item.url} /><span className="gallery-video-label">Vídeo</span></>
            : <img src={item.url} alt={`${title} - foto ${current + 1}`} loading="eager" />}
          {media.length > 1 && (
            <>
              <button className="gallery-nav gallery-prev" aria-label="Foto anterior" onClick={(e) => { e.stopPropagation(); setCurrent((c) => (c - 1 + media.length) % media.length) }}>&#8249;</button>
              <button className="gallery-nav gallery-next" aria-label="Próxima foto" onClick={(e) => { e.stopPropagation(); setCurrent((c) => (c + 1) % media.length) }}>&#8250;</button>
              <span className="gallery-counter">{current + 1} / {media.length}</span>
            </>
          )}
        </div>
        {media.length > 1 && (
          <div className="vehicle-gallery-thumbs">
            {media.map((m, i) => (
              <button key={`${m.type}-${m.url}`} className={i === current ? 'active' : ''} onClick={() => setCurrent(i)}
                aria-label={m.type === 'video' ? 'Abrir vídeo do veículo' : `Abrir foto ${i + 1} do veículo`}>
                {m.type === 'video' ? <span className="thumb-video">&#9654;</span> : <img src={m.url} alt="" loading="lazy" />}
              </button>
            ))}
          </div>
        )}
      </div>
      {lightbox !== null && <Lightbox media={media} start={lightbox} title={title} onClose={() => setLightbox(null)} />}
    </>
  )
}
