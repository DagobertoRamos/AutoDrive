'use client'
/* eslint-disable @next/next/no-img-element -- fotos/logos da loja vêm de URLs arbitrárias */

// Cabeçalho do site da loja (porta do Header do dagobertoeasycar, com dados da loja).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { Menu, MessageCircle, Phone } from 'lucide-react'

export interface SiteNavItem { label: string; href: string }

export function SiteHeader({ homeHref, name, logoUrl, nav, whatsappHref, phone }: {
  homeHref: string; name: string; logoUrl: string; nav: SiteNavItem[]; whatsappHref: string; phone: string
}) {
  const pathname = usePathname()
  const mobileMenu = useRef<HTMLDetailsElement>(null)
  useEffect(() => { if (mobileMenu.current) mobileMenu.current.open = false }, [pathname])

  const close = () => { if (mobileMenu.current) mobileMenu.current.open = false }
  const links = nav.map(({ label, href }) => (
    <Link key={href} href={href} onClick={close}
      aria-current={pathname === href || (href !== homeHref && pathname.startsWith(`${href}/`)) ? 'page' : undefined}>
      {label}
    </Link>
  ))

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link href={homeHref} className="brand" aria-label={`${name} — início`}>
          {logoUrl
            ? <img src={logoUrl} alt={name} width={202} height={32} />
            : <strong className="brand-text">{name}</strong>}
        </Link>
        <nav className="desktop-nav" aria-label="Navegação principal">{links}</nav>
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
