'use client'
/* eslint-disable @next/next/no-img-element -- artes da loja servidas pelo próprio site */

// Carrossel de banners da home (porta do BannerCarousel do dagobertoeasycar).
// Por padrão o título não vai por cima da arte (as artes já trazem o texto; ele
// vira texto alternativo). Com "Mostrar texto" ligado no painel, a etiqueta, o
// título, o texto e o botão aparecem sobre a imagem, como no site modelo.
// Pausa com o mouse em cima.
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
  const b = banners[Math.min(current, count - 1)]
  const img = <img src={b.imageUrl} alt={b.title || 'Banner'} fetchPriority={current === 0 ? 'high' : 'auto'} />
  const linkProps = { href: b.linkUrl, target: b.newTab ? '_blank' : undefined, rel: b.newTab ? 'noreferrer' : undefined }
  const caption = b.showText && (b.title || b.text || b.eyebrow || b.buttonLabel)

  return (
    <div className="banner-carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {caption ? (
        <div className="banner-slide banner-slide-caption">
          {img}
          <div className="banner-caption">
            {b.eyebrow && <span className="banner-eyebrow">{b.eyebrow}</span>}
            {b.title && <h2>{b.title}</h2>}
            {b.text && <p>{b.text}</p>}
            {b.buttonLabel && b.linkUrl && <a className="button" {...linkProps}>{b.buttonLabel}</a>}
          </div>
        </div>
      ) : b.linkUrl
        ? <a {...linkProps} className="banner-slide">{img}</a>
        : <div className="banner-slide">{img}</div>}
      {count > 1 && (
        <>
          <button type="button" className="banner-nav banner-prev" onClick={prev} aria-label="Anterior">&#8249;</button>
          <button type="button" className="banner-nav banner-next" onClick={next} aria-label="Próximo">&#8250;</button>
          <div className="banner-dots">
            {banners.map((x, i) => <button type="button" key={x.id} className={`banner-dot${i === current ? ' active' : ''}`} onClick={() => setCurrent(i)} aria-label={`Banner ${i + 1}`} />)}
          </div>
        </>
      )}
    </div>
  )
}
