// Contato (serviço padrão): formulário → CRM, WhatsApp, endereço e mapa.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getSiteContext } from '@/lib/site/context'
import { SiteLeadForm } from '@/components/site/SiteLeadForm'

export const metadata: Metadata = { title: 'Contato' }

export default async function SiteContact({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const ctx = await getSiteContext(site)
  if (!ctx.on('contato')) notFound()
  const { contact, identity } = ctx.config
  const wa = ctx.whatsapp()
  const address = [contact.addressLine1, contact.addressLine2].filter(Boolean)
  return (
    <>
      <section className="page-hero"><div className="shell"><p className="eyebrow">Atendimento</p><h1>Fale com a {identity.name}.</h1>{contact.phone && <p>Telefone e WhatsApp: {contact.phone}.</p>}</div></section>
      <section className="shell section content-grid">
        <div className="prose">
          <h2>Como podemos ajudar?</h2>
          <p>Conte se você quer comprar, financiar ou avaliar seu carro na troca. A equipe retorna com os próximos passos.</p>
          {(contact.phone || wa || contact.email) && (
            <>
              <h2>Canais oficiais</h2>
              <p>
                {contact.phone && <><a href={`tel:${contact.phone.replace(/\D/g, '')}`}>{contact.phone}</a><br /></>}
                {wa && <><a href={wa} target="_blank" rel="noreferrer">Falar pelo WhatsApp</a><br /></>}
                {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
              </p>
            </>
          )}
          {address.length > 0 && (
            <>
              <h2>Endereço</h2>
              <p>{address.map((l, i) => <span key={i}>{l}<br /></span>)}</p>
              {contact.hours && <p>{contact.hours}</p>}
              {(contact.mapsUrl || contact.wazeUrl) && (
                <p className="mapa-acoes">
                  {contact.mapsUrl && <a className="button button-small" href={contact.mapsUrl} target="_blank" rel="noreferrer">Como chegar (Google Maps)</a>}
                  {contact.wazeUrl && <a className="button button-small button-outline" href={contact.wazeUrl} target="_blank" rel="noreferrer">Abrir no Waze</a>}
                </p>
              )}
              {contact.mapsEmbedUrl && <iframe className="mapa-embutido" title={`Mapa da ${identity.name}`} src={contact.mapsEmbedUrl} width="100%" height="300" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />}
            </>
          )}
        </div>
        <SiteLeadForm apiUrl={ctx.apiUrl} title="Enviar mensagem" privacyHref={ctx.href('/privacidade')} />
      </section>
    </>
  )
}
