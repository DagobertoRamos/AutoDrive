/* eslint-disable @next/next/no-img-element -- fotos/logos da loja vêm de URLs arbitrárias */
// Rodapé do site da loja (porta do Footer do dagobertoeasycar, com dados da loja).
import Link from 'next/link'
import type { SiteConfig } from '@/lib/site/config-core'
import type { SiteNavItem } from './SiteHeader'

export function SiteFooter({ config, nav, whatsappHref }: { config: SiteConfig; nav: SiteNavItem[]; whatsappHref: string }) {
  const { identity, contact } = config
  const address = [contact.addressLine1, contact.addressLine2].filter(Boolean)
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          {identity.footerLogoUrl || identity.logoUrl
            ? <img src={identity.footerLogoUrl || identity.logoUrl} alt={identity.name} className="footer-logo" />
            : <strong className="footer-brand-text">{identity.name}</strong>}
          {identity.tagline && <p>{identity.tagline}</p>}
        </div>
        <div>
          <strong>Navegação</strong>
          {nav.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
        </div>
        <div>
          <strong>Atendimento</strong>
          {whatsappHref && <a href={whatsappHref} target="_blank" rel="noreferrer" className="footer-phone">WhatsApp {contact.phone}</a>}
          {!whatsappHref && contact.phone && <a href={`tel:${contact.phone.replace(/\D/g, '')}`} className="footer-phone">{contact.phone}</a>}
          {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
          {address.length > 0 && (
            <a href={contact.mapsUrl || undefined} target="_blank" rel="noreferrer" className="footer-address">
              <span>{address.map((l, i) => <span key={i}>{l}<br /></span>)}</span>
            </a>
          )}
          {(contact.mapsUrl || contact.wazeUrl) && (
            <span className="footer-mapas">
              {contact.mapsUrl && <a href={contact.mapsUrl} target="_blank" rel="noreferrer">Google Maps</a>}
              {contact.wazeUrl && <a href={contact.wazeUrl} target="_blank" rel="noreferrer">Waze</a>}
            </span>
          )}
          {contact.hours && <p>{contact.hours}</p>}
        </div>
      </div>
      {config.legalNote && <div className="shell footer-legal"><p>{config.legalNote}</p></div>}
      <div className="shell footer-bottom">
        <span>&copy; {new Date().getFullYear()} {identity.name}. Todos os direitos reservados.</span>
        <span className="footer-powered">Site por AutoDrive</span>
      </div>
    </footer>
  )
}
