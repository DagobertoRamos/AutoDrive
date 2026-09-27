'use client'
/* eslint-disable @next/next/no-img-element -- fotos/logos da loja vêm de URLs arbitrárias */

// Cabeçalho do site da loja (porta do Header do dagobertoeasycar, com dados da loja).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Menu, MessageCircle, Phone } from 'lucide-react'

export interface SiteNavItem { label: string; href: string }

export function SiteHeader({ homeHref, name, logoUrl, nav, whatsappHref, phone }: {
  homeHref: string; name: string; logoUrl: string; nav: SiteNavItem[]; whatsappHref: string; phone: string
}) {
  const pathname = usePathname()
  const mobileMenu = useRef<HTMLDetailsElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  // Cabe tudo numa linha (logo + menu + WhatsApp)? Senão o menu desce para uma
  // segunda linha inteira, quebrando em quantas linhas precisar — nunca some
  // link nem empurra o WhatsApp para fora da moldura. A medida é do próprio
  // cabeçalho (a moldura tem largura máxima), não da janela.
  const [layout, setLayout] = useState<'row' | 'stack'>('row')
  useLayoutEffect(() => {
    const box = inner.current, nav = navRef.current
    if (!box || !nav) return
    const px = (v: string) => parseFloat(v) || 0
    const fit = () => {
      const ns = getComputedStyle(nav)
      if (ns.display === 'none') return // celular: menu ☰
      // Largura do menu numa linha só = soma dos links (não muda ao quebrar).
      const links = Array.from(nav.children) as HTMLElement[]
      const navW = links.reduce((sum, a) => sum + a.offsetWidth, 0) + px(ns.columnGap) * Math.max(0, links.length - 1)
        + px(ns.paddingLeft) + px(ns.paddingRight) + px(ns.borderLeftWidth) + px(ns.borderRightWidth)
      const gap = px(getComputedStyle(box).columnGap)
      const others = (Array.from(box.children) as HTMLElement[]).filter((el) => el !== nav && getComputedStyle(el).display !== 'none')
      const need = navW + others.reduce((sum, el) => sum + el.offsetWidth + gap, 0) + 4
      setLayout(need <= box.clientWidth ? 'row' : 'stack')
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    document.fonts?.ready.then(fit)
    return () => ro.disconnect()
  }, [nav])
  useEffect(() => { if (mobileMenu.current) mobileMenu.current.open = false }, [pathname])

  const close = () => { if (mobileMenu.current) mobileMenu.current.open = false }
  const toLinks = (items: SiteNavItem[]) => items.map(({ label, href }) => (
    <Link key={href} href={href} onClick={close}
      aria-current={pathname === href || (href !== homeHref && pathname.startsWith(`${href}/`)) ? 'page' : undefined}>
      {label}
    </Link>
  ))
  const links = toLinks(nav)

  return (
    <header className={`site-header${nav.length > 7 ? ' nav-dense' : ''}${nav.length > 9 ? ' nav-xdense' : ''}`}>
      <div className="shell header-inner" ref={inner} data-layout={layout}>
        <Link href={homeHref} className="brand" aria-label={`${name} — início`}>
          {logoUrl
            ? <img src={logoUrl} alt={name} width={202} height={32} />
            : <strong className="brand-text">{name}</strong>}
        </Link>
        {/* Todos os itens do menu do lojista ficam visíveis; com muitos itens a letra
            diminui e o menu do celular entra mais cedo (classe nav-dense). */}
        <nav className="desktop-nav" ref={navRef} aria-label="Navegação principal">{links}</nav>
        {whatsappHref && (
          <div className="header-actions">
            <a className="button header-whatsapp" href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden="true" /> WhatsApp</a>
          </div>
        )}
        <details className="mobile-menu" ref={mobileMenu}>
          <summary aria-label="Abrir menu" title="Menu"><Menu size={22} aria-hidden="true" /></summary>
          <nav aria-label="Navegação móvel">
            {links}
            {phone && <a href={`tel:${phone.replace(/\D/g, '')}`}><Phone size={16} aria-hidden="true" /> {phone}</a>}
            {whatsappHref && <a className="button" href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden="true" /> WhatsApp</a>}
          </nav>
        </details>
      </div>
    </header>
  )
}
