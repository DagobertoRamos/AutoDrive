// Página inicial do site da loja (porta da home do dagobertoeasycar, com textos
// da loja e só os serviços ligados).
import Link from 'next/link'
import { ArrowRight, BadgeCheck, CarFront, CheckCircle2, CircleDollarSign, HelpCircle, MapPin, MessageCircle, ShieldCheck, Star } from 'lucide-react'
import { getSiteContext } from '@/lib/site/context'
import { listSiteVehicles } from '@/lib/site/vehicles'
import { SiteVehicleCard } from '@/components/site/SiteVehicleCard'
import { SiteBannerCarousel } from '@/components/site/SiteBannerCarousel'
import { activeBanners } from '@/lib/site/config-core'

const BENEFIT_ICONS = [ShieldCheck, CircleDollarSign, CarFront, BadgeCheck]

export default async function SiteHome({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const ctx = await getSiteContext(site)
  const { home, contact, identity } = ctx.config
  const { items } = await listSiteVehicles(ctx.tenantId, { page: 1 }).catch(() => ({ items: [] }))
  const wa = ctx.whatsapp()
  const address = [contact.addressLine1, contact.addressLine2].filter(Boolean)
  const banners = activeBanners(ctx.config)
  const testimonials = ctx.on('depoimentos') ? ctx.config.testimonials : []

  return (
    <>
      <section className="hero home-hero">
        <div className={`shell hero-grid${banners.length ? '' : ' hero-grid-single'}`}>
          <div className="hero-content">
            <p className="eyebrow">{home.heroEyebrow}</p>
            <h1>{home.heroTitle}</h1>
            <p>{home.heroText}</p>
            <div className="hero-actions">
              <Link className="button" href={ctx.href('/veiculos')}><CarFront size={19} aria-hidden="true" />Ver carros disponíveis</Link>
              {wa && <a className="button button-outline hero-outline" href={wa} target="_blank" rel="noreferrer"><MessageCircle size={19} aria-hidden="true" />Falar com a equipe</a>}
            </div>
            {home.trust.length > 0 && (
              <div className="hero-trust">{home.trust.map((t) => <span key={t}><CheckCircle2 size={16} aria-hidden="true" />{t}</span>)}</div>
            )}
          </div>
          {banners.length > 0 && <div className="hero-banner-frame"><SiteBannerCarousel banners={banners} intervalSeconds={ctx.config.banners.intervalSeconds} /></div>}
        </div>
      </section>

      <section className="featured-showcase">
        <div className="shell">
          <div className="featured-heading">
            <div><p className="eyebrow dark">Estoque {identity.name}</p><h2>{home.showcaseTitle}</h2><p>{home.showcaseText}</p></div>
            <Link className="button button-dark" href={ctx.href('/veiculos')}>Ver todo o estoque<ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
          {items.length
            ? <div className="vehicle-grid">{items.slice(0, 8).map((v, i) => <SiteVehicleCard key={v.id} vehicle={v} base={ctx.base} index={i} />)}</div>
            : <div className="empty-state"><h3>Estoque em atualização</h3><p>Novos veículos chegam em breve.</p>{wa && <a className="button" href={wa} target="_blank" rel="noreferrer">Consultar pelo WhatsApp</a>}</div>}
        </div>
      </section>

      {home.benefits.length > 0 && (
        <section className="benefits"><div className="shell benefit-grid">
          {home.benefits.map((b, i) => { const Icon = BENEFIT_ICONS[i % BENEFIT_ICONS.length]; return <div key={b.title}><Icon size={28} aria-hidden="true" /><strong>{b.title}</strong><span>{b.text}</span></div> })}
        </div></section>
      )}

      {(ctx.on('financiamento') || ctx.on('vendaSeuCarro') || ctx.on('encontreSeuCarro') || ctx.on('financiaFacil')) && (
        <section className="section home-services"><div className="shell">
          <div className="service-panels">
            {ctx.on('financiamento') && <article className="service-panel service-panel-accent"><p className="eyebrow dark">Para quem vai comprar</p><h3>Financiamento</h3><p>Escolha um veículo do nosso estoque e faça sua simulação com acompanhamento da equipe.</p><Link className="button" href={ctx.href('/financiamento')}>Simular financiamento<ArrowRight size={17} aria-hidden="true" /></Link></article>}
            {ctx.on('financiaFacil') && <article className="service-panel"><p className="eyebrow dark">Comprando de particular?</p><h3>Financia Fácil</h3><p>Financie o carro de um amigo ou conhecido. A equipe cuida da simulação com as financeiras.</p><Link className="button button-dark" href={ctx.href('/financia-facil')}>Conhecer o Financia Fácil<ArrowRight size={17} aria-hidden="true" /></Link></article>}
            {ctx.on('vendaSeuCarro') && <article className="service-panel"><p className="eyebrow dark">Para quem vai vender ou trocar</p><h3>Venda seu carro</h3><p>Envie os dados do seu carro para uma pré-avaliação. Ele pode virar dinheiro ou entrada no próximo.</p><Link className="button button-dark" href={ctx.href('/venda-seu-carro')}>Fazer pré-avaliação<ArrowRight size={17} aria-hidden="true" /></Link></article>}
            {ctx.on('encontreSeuCarro') && <article className="service-panel"><p className="eyebrow dark">Não achou no estoque?</p><h3>Encontre seu carro</h3><p>Conte qual carro você procura, com orçamento e preferências. A equipe busca e avisa você.</p><Link className="button button-dark" href={ctx.href('/encontre-seu-carro')}>Pedir uma busca<ArrowRight size={17} aria-hidden="true" /></Link></article>}
            {ctx.on('sobre') && !(ctx.on('vendaSeuCarro') && ctx.on('encontreSeuCarro')) && <article className="service-panel"><p className="eyebrow dark">Conheça a loja</p><h3>{ctx.config.about.title}</h3><p>{ctx.config.about.intro}</p><Link className="button button-dark" href={ctx.href('/sobre')}>Quem somos<ArrowRight size={17} aria-hidden="true" /></Link></article>}
          </div>
        </div></section>
      )}

      {testimonials.length > 0 && (
        <section className="section section-soft"><div className="shell">
          <div className="section-heading"><div><p className="eyebrow dark">Experiências reais</p><h2>Quem negocia com a {identity.name} recomenda.</h2></div></div>
          <div className="testimonial-grid">{testimonials.map((t) => <article className="testimonial-card" key={`${t.name}-${t.text}`}><Star size={20} aria-hidden="true" /><p>“{t.text}”</p><strong>{t.name}</strong>{t.vehicle && <span>{t.vehicle}</span>}</article>)}</div>
        </div></section>
      )}

      {(home.faq.length > 0 || address.length > 0) && (
        <section className="section"><div className="shell home-faq-location">
          {home.faq.length > 0 && (
            <div className="faq-block">
              <div className="section-heading"><div><p className="eyebrow dark"><HelpCircle size={15} aria-hidden="true" /> Dúvidas frequentes</p><h2>Negocie com mais tranquilidade.</h2></div></div>
              {home.faq.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
            </div>
          )}
          {address.length > 0 && (
            <div className="location-panel"><MapPin size={24} aria-hidden="true" /><p className="eyebrow dark">Onde estamos</p><h3>{identity.name}</h3><p>{address.map((l, i) => <span key={i}>{l}<br /></span>)}</p>{contact.hours && <p>{contact.hours}</p>}{ctx.on('contato') && <Link className="button button-outline" href={ctx.href('/contato')}>Falar com a equipe</Link>}</div>
          )}
        </div></section>
      )}

      {(contact.phone || wa) && (
        <section className="contact-band"><div className="shell"><div><p className="eyebrow">Fale com a gente</p><h2>Nossa equipe está pronta para atender.</h2></div><div className="contact-links">
          {contact.phone && <a href={`tel:${contact.phone.replace(/\D/g, '')}`}><span>Telefone</span><strong>{contact.phone}</strong></a>}
          {wa && <a href={wa} target="_blank" rel="noreferrer"><span>Atendimento rápido</span><strong>Falar pelo WhatsApp</strong></a>}
        </div></div></section>
      )}
    </>
  )
}
