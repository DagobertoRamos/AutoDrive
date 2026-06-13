'use client'

// =============================================================================
// PhotoGalleryModal — galeria full-screen estilo Autoconf / OLX.
//
// • Foto grande no centro
// • Setas ◀ ▶ pra navegar (mouse, touch swipe e teclado)
// • Strip de thumbs no rodapé (clica pra ir direto)
// • Contador "3 / 12" no header
// • Esc fecha
// =============================================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react'

export interface GalleryPhoto {
  id:        string
  url:       string | null
  fileName?: string
  section?:  string | null
  category?: string | null
}

interface Props {
  photos:      GalleryPhoto[]
  initialIndex?: number
  title?:      string
  onClose:     () => void
}

export function PhotoGalleryModal({ photos, initialIndex = 0, title, onClose }: Props) {
  const [idx, setIdx] = useState(Math.max(0, Math.min(initialIndex, photos.length - 1)))
  const touchStartX = useRef<number | null>(null)

  const go = useCallback((delta: number) => {
    setIdx((i) => {
      const next = i + delta
      if (next < 0) return photos.length - 1
      if (next >= photos.length) return 0
      return next
    })
  }, [photos.length])

  // Atalhos de teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  if (photos.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
        <div className="flex flex-col items-center gap-3 text-white">
          <ImageIcon size={40} className="opacity-50" />
          <p>Sem fotos para exibir</p>
          <button onClick={onClose} className="rounded-lg border border-white/30 px-4 py-2 text-sm hover:bg-white/10">
            Fechar
          </button>
        </div>
      </div>
    )
  }

  const current = photos[idx]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <ImageIcon size={16} className="opacity-70" />
          <div>
            {title && <p className="text-sm font-semibold">{title}</p>}
            <p className="text-xs text-white/60">
              Foto {idx + 1} de {photos.length}
              {current.section && <span className="ml-2 text-white/40">· {current.section}</span>}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Fechar galeria"
        >
          <X size={18} />
        </button>
      </div>

      {/* Foto principal + setas */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (touchStartX.current == null) return
          const delta = e.changedTouches[0].clientX - touchStartX.current
          if (Math.abs(delta) > 50) go(delta < 0 ? 1 : -1)
          touchStartX.current = null
        }}
      >
        {photos.length > 1 && (
          <button
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/20"
            aria-label="Foto anterior"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        {current.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.url}
            alt={current.fileName ?? `Foto ${idx + 1}`}
            className="max-h-full max-w-full select-none object-contain"
            draggable={false}
          />
        ) : (
          <div className="text-center text-white/50">
            <ImageIcon size={48} className="mx-auto opacity-40" />
            <p className="mt-2 text-sm">URL indisponível</p>
          </div>
        )}

        {photos.length > 1 && (
          <button
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur hover:bg-white/20"
            aria-label="Próxima foto"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {/* Thumbs strip */}
      {photos.length > 1 && (
        <div className="border-t border-white/10 bg-black/50 p-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setIdx(i)}
                className={`shrink-0 overflow-hidden rounded-md border-2 transition-opacity ${
                  i === idx ? 'border-brand-500 opacity-100' : 'border-transparent opacity-60 hover:opacity-100'
                }`}
                aria-label={`Ir para foto ${i + 1}`}
              >
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt="" className="h-14 w-20 object-cover" />
                ) : (
                  <div className="flex h-14 w-20 items-center justify-center bg-white/5">
                    <ImageIcon size={16} className="text-white/40" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
