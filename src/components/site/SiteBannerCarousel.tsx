'use client'
/* eslint-disable @next/next/no-img-element -- artes da loja servidas pelo próprio site */

// Carrossel de banners da home (porta do BannerCarousel do dagobertoeasycar).
// Por padrão o título não aparece (as artes já trazem o texto; ele vira texto
// alternativo). Com "Mostrar texto" ligado no painel, a etiqueta, o título, o
// texto e o botão vão na faixa ABAIXO da arte (junto das setas) — nunca por
// cima do texto dela.
// A arte fica numa moldura de proporção fixa, inteira (contain) sobre um fundo
// desfocado da própria arte. Pausa com o mouse em cima. Troca com fade; setas e
// bolinhas ficam numa faixa abaixo.
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
  const cur = banners[Math.min(current, count - 1)]
  const hasCaption = (b: SiteBanner) => b.showText && !!(b.title || b.text || b.eyebrow || b.buttonLabel)
  const anyCaption = banners.some(hasCaption)
  const curLink = { href: cur.linkUrl, target: cur.newTab ? '_blank' : undefined, rel: cur.newTab ? 'noreferrer' : undefined }

  return (
    <div className="banner-carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="banner-track">
        {banners.map((b, i) => {
          const active = i === Math.min(current, count - 1)
          const cls = `banner-slide${active ? ' is-active' : ''}`
          const media = (
            <span className="banner-media">
              <img className="banner-backdrop" src={b.imageUrl} alt="" aria-hidden="true" loading={i === 0 ? 'eager' : 'lazy'} />
              <img className="banner-art" src={b.imageUrl} alt={b.title || 'Banner'} loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : 'auto'} />
            </span>
          )
          const linkProps = { href: b.linkUrl, target: b.newTab ? '_blank' : undefined, rel: b.newTab ? 'noreferrer' : undefined }
          const common = { className: cls, 'aria-hidden': !active, inert: !active }
          return b.linkUrl ? <a key={b.id} {...common} {...linkProps}>{media}</a> : <div key={b.id} {...common}>{media}</div>
        })}
      </div>
      {(count > 1 || anyCaption) && (
        // Faixa abaixo da arte: legenda do slide (se houver) e controles; nada
        // cobre o texto do banner. Altura estável quando algum slide tem legenda.
        <div className={`banner-controls${anyCaption ? ' has-caption' : ''}`}>
          {anyCaption && (
            <div className="banner-caption" key={cur.id}>
              {hasCaption(cur) && <>
                <div className="banner-caption-text">
                  {cur.eyebrow && <span className="banner-eyebrow">{cur.eyebrow}</span>}
                  {cur.title && <h2>{cur.title}</h2>}
                  {cur.text && <p>{cur.text}</p>}
                </div>
                {cur.buttonLabel && cur.linkUrl && <a className="button" {...curLink}>{cur.buttonLabel}</a>}
              </>}
            </div>
          )}
          {count > 1 && (
            <div className="banner-pager">
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
      )}
    </div>
  )
}
