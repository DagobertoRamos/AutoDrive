'use client'

// =============================================================================
// HelpHint — "?" num círculo ao lado de um termo; passar o mouse (ou tocar,
// ou focar com o teclado) mostra a explicação. Padrão do sistema todo:
//   <HelpHint term="AV" />            → texto do glossário (src/lib/glossary.ts)
//   <HelpHint text="Explicação..." /> → texto livre
// O balão é posicionado na tela (portal), então não é cortado por tabelas,
// cards com overflow ou janelas.
// =============================================================================

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'
import { GLOSSARY, type GlossaryTerm } from '@/lib/glossary'

interface Props {
  term?: GlossaryTerm
  text?: string
  /** Título opcional em negrito no balão (padrão: o próprio termo). */
  title?: string
  size?: number
  className?: string
}

export function HelpHint({ term, text, title, size = 13, className = '' }: Props) {
  const entry = term ? GLOSSARY[term] : undefined
  const body = text ?? entry?.text
  const heading = title ?? entry?.title
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null)
  const ref = useRef<HTMLButtonElement>(null)
  const pinned = useRef(false)
  const id = useId()

  const place = useCallback(() => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const width = 280
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8)
    const above = r.top > window.innerHeight * 0.55
    setPos({ top: above ? r.top - 8 : r.bottom + 8, left, above })
  }, [])

  const show = () => { place(); setOpen(true) }
  const hide = () => { if (!pinned.current) setOpen(false) }

  useEffect(() => {
    if (!open) return
    const close = (ev: Event) => {
      if (ev instanceof KeyboardEvent && ev.key !== 'Escape') return
      if (ev.type === 'pointerdown' && ref.current?.contains(ev.target as Node)) return
      pinned.current = false
      setOpen(false)
    }
    const reposition = () => place()
    window.addEventListener('keydown', close)
    window.addEventListener('pointerdown', close)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('keydown', close)
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, place])

  if (!body) return null
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={heading ? `O que é ${heading}?` : 'Ajuda'}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); pinned.current = !pinned.current || !open; if (pinned.current) show(); else setOpen(false) }}
        className={`inline-flex shrink-0 cursor-help items-center justify-center rounded-full align-middle text-gray-400 transition-colors hover:text-brand-600 focus:text-brand-600 focus:outline-none print:hidden ${className}`}
      >
        <HelpCircle size={size} strokeWidth={2} />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          id={id}
          role="tooltip"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 280, transform: pos.above ? 'translateY(-100%)' : undefined, zIndex: 1000 }}
          className="pointer-events-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-gray-700 shadow-lg"
        >
          {heading && <p className="mb-0.5 font-semibold text-gray-900">{heading}</p>}
          <p className="whitespace-pre-line">{body}</p>
        </div>,
        document.body,
      )}
    </>
  )
}

/** Rótulo + "?" lado a lado (para cabeçalhos de tabela, KPIs e títulos). */
export function WithHint({ children, term, text, className = '' }: { children: React.ReactNode; term?: GlossaryTerm; text?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {children}
      <HelpHint term={term} text={text} />
    </span>
  )
}
