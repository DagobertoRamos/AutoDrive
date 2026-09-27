/* eslint-disable @next/next/no-img-element -- fotos/logos da loja vêm de URLs arbitrárias */
// Rodapé do site da loja — padrão único (o mesmo do site modelo dagobertoeasycar):
// faixa de chamada com WhatsApp, 4 colunas (marca, navegação, atendimento,
// "procure por" em etiquetas), aviso legal e barra final. Fundo sempre escuro,
// tingido pela cor escura da loja. Sem logo clara, a logo vai num selo branco
// (qualquer logo fica legível, sem sobrar só o contorno no fundo escuro).
import Link from 'next/link'
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import type { SiteConfig } from '@/lib/site/config-core'
import type { SiteNavItem } from './SiteHeader'

export function SiteFooter({ config, nav, whatsappHref, seoLinks = [], legalLinks = [] }: { config: SiteConfig; nav: SiteNavItem[]; whatsappHref: string; seoLinks?: SiteNavItem[]; legalLinks?: SiteNavItem[] }) {
  const { identity, contact } = config
  const address = [contact.addressLine1, contact.addressLine2].filter(Boolean)
  const phoneDigits = contact.phone.replace(/\D/g, '')
  const logo = identity.footerLogoUrl || identity.logoUrl
  const hasContact = !!(whatsappHref || phoneDigits || contact.email || address.length || contact.hours || contact.mapsUrl || contact.wazeUrl)
  return (
    <footer className="site-footer">
      {whatsappHref && (
        <div className="shell footer-cta">
          <div><strong>Vamos conversar?</strong><p>Tire dúvidas, consulte condições e agende sua visita com a equipe da {identity.name}.</p></div>
          <a className="button" href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden="true" />Falar pelo WhatsApp</a>
        </div>
      )}
      <div className="shell footer-grid">
        <div className="footer-brand">
          {logo
            ? <span className={identity.footerLogoUrl ? 'footer-logo-plain' : 'footer-logo-badge'}><img src={logo} alt={identity.name} className="footer-logo" /></span>
            : <strong className="footer-brand-text">{identity.name}</strong>}
          {identity.tagline && <p>{identity.tagline}</p>}
        </div>
        {nav.length > 0 && (
          <nav className="footer-col" aria-label="Rodapé">
            <strong>Navegação</strong>
            <div className={`footer-links${nav.length > 6 ? ' two-cols' : ''}`}>{nav.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}</div>
          </nav>
        )}
        {hasContact && <div className="footer-col">
          <strong>Atendimento</strong>
          <ul className="footer-contact">
            {whatsappHref && <li><MessageCircle size={16} aria-hidden="true" /><a href={whatsappHref} target="_blank" rel="noreferrer">{contact.phone || 'WhatsApp'}</a></li>}
            {!whatsappHref && phoneDigits && <li><Phone size={16} aria-hidden="true" /><a href={`tel:${phoneDigits}`}>{contact.phone}</a></li>}
            {contact.email && <li><Mail size={16} aria-hidden="true" /><a href={`mailto:${contact.email}`}>{contact.email}</a></li>}
            {address.length > 0 && <li><MapPin size={16} aria-hidden="true" /><span>{address.map((l, i) => <span key={i}>{l}<br /></span>)}</span></li>}
            {contact.hours && <li><Clock size={16} aria-hidden="true" /><span>{contact.hours}</span></li>}
          </ul>
          {(contact.mapsUrl || contact.wazeUrl) && (
            <div className="footer-mapas">
              {contact.mapsUrl && <a href={contact.mapsUrl} target="_blank" rel="noreferrer">Google Maps</a>}
              {contact.wazeUrl && <a href={contact.wazeUrl} target="_blank" rel="noreferrer">Waze</a>}
            </div>
          )}
        </div>}
        {seoLinks.length > 0 && (
          <div className="footer-col">
            <strong>Procure por</strong>
            <div className="footer-tags">{seoLinks.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}</div>
          </div>
        )}
      </div>
      {config.legalNote && <div className="shell footer-legal"><p>{config.legalNote}</p></div>}
      <div className="shell footer-bottom">
        <span>&copy; {new Date().getFullYear()} {identity.name}. Todos os direitos reservados.</span>
        {legalLinks.length > 0 && <span className="footer-legal-links">{legalLinks.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}</span>}
        <span className="footer-powered">Site por AutoDrive</span>
      </div>
    </footer>
  )
}
