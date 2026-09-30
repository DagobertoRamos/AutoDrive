'use client'

// =============================================================================
// PhotoLightbox — visualizador de fotos da avaliação (tela cheia).
// Setas/teclado navegam, Esc ou clique fora fecha. Usado no ícone da câmera
// dos itens, no resumo por seção e nas miniaturas.
// =============================================================================

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

export interface LightboxPhoto {
  id:        string
  fileName?: string | null
  publicUrl: string | null
}

export function PhotoLightbox({
  photos, startIndex = 0, title, onClose,
}: {
  photos:      LightboxPhoto[]
  startIndex?: number
  title?:      string
  onClose:     () => void
}) {
  const list = photos.filter((p) => !!p.publicUrl)
  const [i, setI] = useState(Math.min(Math.max(startIndex, 0), Math.max(list.length - 1, 0)))
  const n = list.length

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setI((v) => (v + 1) % Math.max(n, 1))
      else if (e.key === 'ArrowLeft')  setI((v) => (v - 1 + Math.max(n, 1)) % Math.max(n, 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [n, onClose])

  if (n === 0) return null
  const cur = list[i]

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex flex-col bg-black/90"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="truncate text-sm">
          {title ? <span className="font-semibold">{title}</span> : null}
          {title ? ' · ' : ''}{i + 1} de {n}
        </p>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-2 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cur.publicUrl!}
          alt={cur.fileName ?? 'Foto'}
          className="max-h-full max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        {n > 1 && (
          <>
            <button
              type="button"
              aria-label="Foto anterior"
              onClick={(e) => { e.stopPropagation(); setI((v) => (v - 1 + n) % n) }}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              aria-label="Próxima foto"
              onClick={(e) => { e.stopPropagation(); setI((v) => (v + 1) % n) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
