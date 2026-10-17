'use client'
/* eslint-disable @next/next/no-img-element -- fotos/logos da loja vêm de URLs arbitrárias */

// Cabeçalho do site da loja (porta do Header do dagobertoeasycar, com dados da loja).
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { Menu, MessageCircle, Phone, Search } from 'lucide-react'

export interface SiteNavItem { label: string; href: string }

export function SiteHeader({ homeHref, stockHref, name, logoUrl, logoTone = '', nav, whatsappHref, phone }: {
  homeHref: string; stockHref: string; name: string; logoUrl: string; logoTone?: '' | 'light' | 'dark'; nav: SiteNavItem[]; whatsappHref: string; phone: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const mobileMenu = useRef<HTMLDetailsElement>(null)
  // Busca do estoque no topo: no estoque, mostra o termo que está na URL.
  const queryInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (mobileMenu.current) mobileMenu.current.open = false
    if (queryInput.current) queryInput.current.value = pathname === stockHref ? new URLSearchParams(window.location.search).get('q') ?? '' : ''
  }, [pathname, stockHref])

  const close = () => { if (mobileMenu.current) mobileMenu.current.open = false }
  const search = (e: React.FormEvent) => {
    e.preventDefault()
    const q = (queryInput.current?.value ?? '').trim()
    router.push(q ? `${stockHref}?q=${encodeURIComponent(q)}` : stockHref)
  }
  const toLinks = (items: SiteNavItem[]) => items.map(({ label, href }) => (
    <Link key={href} href={href} onClick={close}
      aria-current={pathname === href || (href !== homeHref && pathname.startsWith(`${href}/`)) ? 'page' : undefined}>
      {label}
    </Link>
  ))
  const links = toLinks(nav)

  return (
    // Logo clara (some no branco) → cabeçalho na cor escura da marca.
    // Topo: logo | busca (centralizada) | WhatsApp; o menu fica na linha de baixo.
    <header className={`site-header${logoTone === 'light' ? ' header-dark' : ''}${nav.length > 7 ? ' nav-dense' : ''}${nav.length > 9 ? ' nav-xdense' : ''}`}>
      <div className="shell header-inner" data-layout="stack">
        <Link href={homeHref} className="brand" aria-label={`${name} — início`}>
          {logoUrl
            ? <img src={logoUrl} alt={name} />
            : <strong className="brand-text">{name}</strong>}
        </Link>
        <form className="header-search" role="search" onSubmit={search}>
          <input type="search" ref={queryInput}
            placeholder="Buscar veículo: marca, modelo, ano..." aria-label="Buscar veículo no estoque" />
          <button type="submit" aria-label="Buscar"><Search size={18} aria-hidden="true" /></button>
        </form>
        {/* Todos os itens do menu do lojista ficam visíveis; com muitos itens a letra
            diminui e o menu do celular entra mais cedo (classe nav-dense). */}
        <nav className="desktop-nav" aria-label="Navegação principal">{links}</nav>
        <div className="header-actions">
          {whatsappHref && <a className="button header-whatsapp" href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden="true" /> WhatsApp</a>}
        </div>
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
