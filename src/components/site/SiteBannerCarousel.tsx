'use client'
/* eslint-disable @next/next/no-img-element -- artes da loja servidas pelo próprio site */

// Carrossel de banners da home (porta do BannerCarousel do dagobertoeasycar).
// As artes já trazem o próprio texto, então nada de legenda por cima nem faixa
// de anotação: etiqueta, título e texto do painel viram texto alternativo, e
// com "Mostrar texto" + botão configurado aparece só um botão discreto no canto
// da arte. A arte fica numa moldura de proporção fixa, inteira (contain) sobre
// um fundo desfocado dela mesma. Pausa com o mouse em cima. Troca com fade;
// setas e bolinhas ficam numa faixa abaixo.
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
  const altOf = (b: SiteBanner) => [b.eyebrow, b.title, b.text].filter(Boolean).join(' — ') || 'Banner'

  return (
    <div className="banner-carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="banner-track">
        {banners.map((b, i) => {
          const active = i === Math.min(current, count - 1)
          const cls = `banner-slide${active ? ' is-active' : ''}`
          const media = (
            <span className="banner-media">
              <img className="banner-backdrop" src={b.imageUrl} alt="" aria-hidden="true" loading={i === 0 ? 'eager' : 'lazy'} />
              <img className="banner-art" src={b.imageUrl} alt={altOf(b)} loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : 'auto'} />
            </span>
          )
          const linkProps = { href: b.linkUrl, target: b.newTab ? '_blank' : undefined, rel: b.newTab ? 'noreferrer' : undefined }
          const common = { className: cls, 'aria-hidden': !active, inert: !active }
          if (b.showText && b.buttonLabel && b.linkUrl) return (
            <div key={b.id} {...common}>
              <a className="banner-media-link" {...linkProps} tabIndex={-1}>{media}</a>
              <a className="button banner-cta" {...linkProps}>{b.buttonLabel}</a>
            </div>
          )
          return b.linkUrl ? <a key={b.id} {...common} {...linkProps}>{media}</a> : <div key={b.id} {...common}>{media}</div>
        })}
      </div>
      {count > 1 && (
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
