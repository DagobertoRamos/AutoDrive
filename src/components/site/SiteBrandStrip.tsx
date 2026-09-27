'use client'

// Carrossel de marcas do estoque: só aparecem marcas com carro no site, cada
// uma é um atalho para o estoque filtrado. Setas quando não cabe na tela;
// no celular, arrasta com o dedo.
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface BrandStripItem { slug: string; label: string; total: number; logo: string | null; href: string; active?: boolean }

export function SiteBrandStrip({ items, title }: { items: BrandStripItem[]; title?: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  useEffect(() => {
    const el = track.current
    if (!el) return
    const update = () => setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    // Leva a marca escolhida para a vista.
    el.querySelector<HTMLElement>('.brand-chip.active')?.scrollIntoView({ block: 'nearest', inline: 'center' })
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [])

  if (items.length < 2) return null
  const move = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: 'smooth' })

  return (
    <div className="brand-strip">
      {title && <h2 className="brand-strip-title">{title}</h2>}
      <div className="brand-strip-frame">
        {!edges.start && <button type="button" className="brand-strip-arrow prev" onClick={() => move(-1)} aria-label="Marcas anteriores"><ChevronLeft size={18} /></button>}
        <div className="brand-strip-track" ref={track}>
          {items.map((b) => (
            <Link key={b.slug} href={b.href} className={`brand-chip${b.active ? ' active' : ''}`} title={`${b.label} — ${b.total} ${b.total === 1 ? 'veículo' : 'veículos'}`} aria-current={b.active ? 'true' : undefined}>
              <span className="brand-chip-logo">
                {b.logo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={b.logo} alt="" loading="lazy" width={64} height={36} />
                  : <span className="brand-chip-mark" aria-hidden="true">{b.label.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()}</span>}
              </span>
              <span className="brand-chip-name">{b.label}</span>
            </Link>
          ))}
        </div>
        {!edges.end && <button type="button" className="brand-strip-arrow next" onClick={() => move(1)} aria-label="Próximas marcas"><ChevronRight size={18} /></button>}
      </div>
    </div>
  )
}
