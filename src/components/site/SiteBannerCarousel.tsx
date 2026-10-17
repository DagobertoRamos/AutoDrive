'use client'
/* eslint-disable @next/next/no-img-element -- artes da loja servidas pelo próprio site */

// Carrossel de banners da home (porta do BannerCarousel do dagobertoeasycar).
// Por padrão o título não vai por cima da arte (as artes já trazem o texto; ele
// vira texto alternativo). Com "Mostrar texto" ligado no painel, a etiqueta, o
// título, o texto e o botão aparecem sobre a imagem, como no site modelo.
// Pausa com o mouse em cima. Troca com fade; setas e bolinhas ficam numa
// faixa abaixo da arte para não cobrir o texto do banner.
import { useCallback, useEffect, useState } from 'react'
import type { SiteBanner } from '@/lib/site/config-core'

export function SiteBannerCarousel({ banners, intervalSeconds }: { banners: SiteBanner[]; intervalSeconds: number }) {
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = banners.length
  const next = useCallback(() => setCurrent((c) => (c + 1) % count), [count])
  const prev = useCallback(() => setCurrent((c) => (c - 1 + count) % count), [count])

  useEffect(() => {
    if (paused || count <= 1) return
    const t = setInterval(next, intervalSeconds * 1000)
    return () => clearInterval(t)
  }, [paused, count, next, intervalSeconds])

  if (!count) return null

  return (
    <div className="banner-carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="banner-track">
        {banners.map((b, i) => {
          const active = i === Math.min(current, count - 1)
          const cls = `banner-slide${active ? ' is-active' : ''}`
          const img = <img src={b.imageUrl} alt={b.title || 'Banner'} loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : 'auto'} />
          const linkProps = { href: b.linkUrl, target: b.newTab ? '_blank' : undefined, rel: b.newTab ? 'noreferrer' : undefined }
          const caption = b.showText && (b.title || b.text || b.eyebrow || b.buttonLabel)
          const common = { className: caption ? `${cls} banner-slide-caption` : cls, 'aria-hidden': !active, inert: !active }
          if (caption) return (
            <div key={b.id} {...common}>
              {img}
              <div className="banner-caption">
                {b.eyebrow && <span className="banner-eyebrow">{b.eyebrow}</span>}
                {b.title && <h2>{b.title}</h2>}
                {b.text && <p>{b.text}</p>}
                {b.buttonLabel && b.linkUrl && <a className="button" {...linkProps}>{b.buttonLabel}</a>}
              </div>
            </div>
          )
          return b.linkUrl ? <a key={b.id} {...common} {...linkProps}>{img}</a> : <div key={b.id} {...common}>{img}</div>
        })}
      </div>
      {count > 1 && (
        // Controles numa faixa abaixo da arte: nunca cobrem o texto do banner.
        <div className="banner-controls">
          <button type="button" className="banner-nav" onClick={prev} aria-label="Banner anterior">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div className="banner-dots">
            {banners.map((x, i) => <button type="button" key={x.id} className={`banner-dot${i === current ? ' active' : ''}`} onClick={() => setCurrent(i)} aria-label={`Banner ${i + 1}`} aria-current={i === current} />)}
          </div>
          <button type="button" className="banner-nav" onClick={next} aria-label="Próximo banner">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}
