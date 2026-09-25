// Página inicial do site da loja, montada pelos BLOCOS que o lojista organiza
// (Site → Configurações → Página inicial em blocos): ordem, liga/desliga e textos.
// Padrão = modelo do site da AutoDrive. Bloco que depende de serviço desligado
// (ou sem conteúdo, como banners e depoimentos) não aparece.
import Link from 'next/link'
import { ArrowRight, BadgeCheck, CarFront, CheckCircle2, CircleDollarSign, HandCoins, Handshake, HelpCircle, Info, Mail, MapPin, MessageCircle, Search, ShieldCheck, Star, Store } from 'lucide-react'
import { getSiteContext, type SiteContext } from '@/lib/site/context'
import { listSiteVehicles, type SiteVehicle } from '@/lib/site/vehicles'
import { SiteVehicleCard } from '@/components/site/SiteVehicleCard'
import { SiteBannerCarousel } from '@/components/site/SiteBannerCarousel'
import { activeBanners } from '@/lib/site/config-core'
import { ACTION_DEFS, type ActionKind, type HomeBlock } from '@/lib/site/layout-core'

const BENEFIT_ICONS = [ShieldCheck, CircleDollarSign, CarFront, BadgeCheck]
const ACTION_ICONS: Record<ActionKind, typeof CarFront> = { comprar: CarFront, vender: HandCoins, buscar: Search, parceiro: Handshake, financiaFacil: CircleDollarSign, financiamento: CircleDollarSign, sobre: Store }

interface Parts { ctx: SiteContext; items: SiteVehicle[]; wa: string; address: string[] }

function Hero({ ctx, wa, withBanners }: { ctx: SiteContext; wa: string; withBanners: boolean }) {
  const { home } = ctx.config
  const banners = withBanners ? activeBanners(ctx.config) : []
  return (
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
          {home.trust.length > 0 && <div className="hero-trust">{home.trust.map((t) => <span key={t}><CheckCircle2 size={16} aria-hidden="true" />{t}</span>)}</div>}
        </div>
        {banners.length > 0 && <div className="hero-banner-frame"><SiteBannerCarousel banners={banners} intervalSeconds={ctx.config.banners.intervalSeconds} /></div>}
      </div>
    </section>
  )
}

function Heading({ b }: { b: HomeBlock }) {
  if (!b.eyebrow && !b.title && !b.text) return null
  return <div className="section-heading"><div>{b.eyebrow && <p className="eyebrow dark">{b.eyebrow}</p>}{b.title && <h2>{b.title}</h2>}{b.text && <p className="section-intro">{b.text}</p>}</div></div>
}

function renderBlock(b: HomeBlock, i: number, blocks: HomeBlock[], p: Parts) {
  const { ctx, items, wa, address } = p
  const { home, contact, identity } = ctx.config
  switch (b.type) {
    case 'hero': {
      const next = blocks[i + 1]
      return <Hero key="hero" ctx={ctx} wa={wa} withBanners={!!next && next.type === 'banners' && ctx.on('banners')} />
    }
    case 'banners': {
      // Logo depois do topo, os banners já foram dentro dele.
      if (blocks[i - 1]?.type === 'hero' || !ctx.on('banners')) return null
      const banners = activeBanners(ctx.config)
      if (!banners.length) return null
      return <section key="banners" className="section"><div className="shell"><div className="hero-banner-frame" style={{ maxWidth: '100%' }}><SiteBannerCarousel banners={banners} intervalSeconds={ctx.config.banners.intervalSeconds} /></div></div></section>
    }
    case 'actions': {
      const cards = b.cards.flatMap((c) => {
        const def = ACTION_DEFS.find((d) => d.kind === c.kind)
        if (!c.visible || !def) return []
        if (def.service && !ctx.on(def.service)) return []
        if (def.needsBlock && !ctx.blockOn(def.needsBlock)) return []
        return [{ ...c, def }]
      })
      if (!cards.length) return null
      return (
        <section key="actions" className="section"><div className="shell">
          <Heading b={b} />
          <div className={`home-journeys jcols-${Math.min(cards.length, 5)}`} style={{ paddingBlock: 0 }}>
            {cards.map(({ kind, title, text, def }) => {
              const Icon = ACTION_ICONS[kind]
              return (
                <Link key={kind} className="journey-card" href={ctx.href(def.path)}>
                  <span className="journey-icon"><Icon size={20} aria-hidden="true" /></span>
                  <div><h2>{title}</h2><p>{text}</p></div>
                  <span className="journey-link">{def.cta}<ArrowRight size={15} aria-hidden="true" /></span>
                </Link>
              )
            })}
          </div>
        </div></section>
      )
    }
    case 'showcase':
      return (
        <section key="showcase" className="featured-showcase"><div className="shell">
          <div className="featured-heading">
            <div><p className="eyebrow dark">Estoque {identity.name}</p><h2>{home.showcaseTitle}</h2><p>{home.showcaseText}</p></div>
            <Link className="button button-dark" href={ctx.href('/veiculos')}>Ver todo o estoque<ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
          {items.length
            ? <div className="vehicle-grid">{items.slice(0, 8).map((v, k) => <SiteVehicleCard key={v.id} vehicle={v} base={ctx.base} index={k} />)}</div>
            : <div className="empty-state"><h3>Estoque em atualização</h3><p>Novos veículos chegam em breve.</p>{wa && <a className="button" href={wa} target="_blank" rel="noreferrer">Consultar pelo WhatsApp</a>}</div>}
        </div></section>
      )
    case 'benefits':
      if (!home.benefits.length) return null
      return (
        <section key="benefits" className="benefits"><div className="shell benefit-grid">
          {home.benefits.map((x, k) => { const Icon = BENEFIT_ICONS[k % BENEFIT_ICONS.length]; return <div key={x.title}><Icon size={28} aria-hidden="true" /><strong>{x.title}</strong><span>{x.text}</span></div> })}
        </div></section>
      )
    case 'partners': {
      const offer = ctx.whatsapp(`Olá! Sou lojista e quero cadastrar meu estoque como parceiro da ${identity.name}.`)
      const want = ctx.whatsapp('Olá! Sou lojista e procuro veículos para abastecer meu estoque.')
      return (
        <section key="partners" className="section home-partner-band" id="parceiros"><div className="shell home-partner-grid">
          <div>
            {b.eyebrow && <p className="eyebrow">{b.eyebrow}</p>}
            <h2>{b.title}</h2>
            {b.text && <p>{b.text}</p>}
            {b.bullets.length > 0 && <div className="partner-points">{b.bullets.map((t) => <span key={t}><CheckCircle2 size={17} aria-hidden="true" />{t}</span>)}</div>}
          </div>
          <div className="partner-actions">
            {offer && <a className="button button-light" href={offer} target="_blank" rel="noreferrer">Quero oferecer meu estoque</a>}
            {want && <a className="button partner-outline" href={want} target="_blank" rel="noreferrer">Procuro carros para estoque</a>}
            {ctx.on('atacado') && <Link className="button partner-outline" href={ctx.href('/atacado')}>Conhecer o atacado</Link>}
          </div>
        </div></section>
      )
    }
    case 'financeSell': {
      const fin = ctx.on('financiamento')
      const sell = ctx.on('vendaSeuCarro')
      if (!fin && !sell) return null
      return (
        <section key="financeSell" className="section"><div className={`shell service-panels${fin && sell ? '' : ' service-panels-single'}`}>
          {fin && (
            <article className="service-panel service-panel-accent">
              {b.eyebrow && <p className="eyebrow dark">{b.eyebrow}</p>}
              <h3>{b.title}</h3>
              {b.text && <p>{b.text}</p>}
              {ctx.config.legalNote && <div className="notice-box"><Info size={18} aria-hidden="true" /><p>{ctx.config.legalNote}</p></div>}
              <div className="hero-actions">
                <Link className="button" href={ctx.href('/financiamento')}>Fazer uma simulação<ArrowRight size={17} aria-hidden="true" /></Link>
                <Link className="button button-outline" href={ctx.href('/veiculos')}>Escolher um veículo</Link>
              </div>
            </article>
          )}
          {sell && (
            <article className="service-panel">
              {b.eyebrow2 && <p className="eyebrow dark">{b.eyebrow2}</p>}
              <h3>{b.title2}</h3>
              {b.text2 && <p>{b.text2}</p>}
              <div className="hero-actions"><Link className="button button-dark" href={ctx.href('/venda-seu-carro')}>Enviar dados do meu carro<ArrowRight size={17} aria-hidden="true" /></Link></div>
            </article>
          )}
        </div></section>
      )
    }
    case 'services': {
      const panels = [
        ctx.on('financiamento') && <article key="f" className="service-panel service-panel-accent"><p className="eyebrow dark">Para quem vai comprar</p><h3>Financiamento</h3><p>Escolha um veículo do nosso estoque e faça sua simulação com acompanhamento da equipe.</p><Link className="button" href={ctx.href('/financiamento')}>Simular financiamento<ArrowRight size={17} aria-hidden="true" /></Link></article>,
        ctx.on('financiaFacil') && <article key="ff" className="service-panel"><p className="eyebrow dark">Comprando de particular?</p><h3>Financia Fácil</h3><p>Financie o carro de um amigo ou conhecido. A equipe cuida da simulação com as financeiras.</p><Link className="button button-dark" href={ctx.href('/financia-facil')}>Conhecer o Financia Fácil<ArrowRight size={17} aria-hidden="true" /></Link></article>,
        ctx.on('vendaSeuCarro') && <article key="v" className="service-panel"><p className="eyebrow dark">Para quem vai vender ou trocar</p><h3>Venda seu carro</h3><p>Envie os dados do seu carro para uma pré-avaliação. Ele pode virar dinheiro ou entrada no próximo.</p><Link className="button button-dark" href={ctx.href('/venda-seu-carro')}>Fazer pré-avaliação<ArrowRight size={17} aria-hidden="true" /></Link></article>,
        ctx.on('encontreSeuCarro') && <article key="e" className="service-panel"><p className="eyebrow dark">Não achou no estoque?</p><h3>Encontre seu carro</h3><p>Conte qual carro você procura, com orçamento e preferências. A equipe busca e avisa você.</p><Link className="button button-dark" href={ctx.href('/encontre-seu-carro')}>Pedir uma busca<ArrowRight size={17} aria-hidden="true" /></Link></article>,
      ].filter(Boolean)
      if (!panels.length) return null
      return <section key="services" className="section home-services"><div className="shell"><div className="service-panels">{panels}</div></div></section>
    }
    case 'testimonials': {
      const list = ctx.on('depoimentos') ? ctx.config.testimonials : []
      if (!list.length) return null
      return (
        <section key="testimonials" className="section section-soft"><div className="shell">
          <Heading b={b} />
          <div className="testimonial-grid">{list.map((t) => <article className="testimonial-card" key={`${t.name}-${t.text}`}><Star size={20} aria-hidden="true" /><p>“{t.text}”</p><strong>{t.name}</strong>{t.vehicle && <span>{t.vehicle}</span>}</article>)}</div>
        </div></section>
      )
    }
    case 'faqLocation':
      if (!home.faq.length && !address.length) return null
      return (
        <section key="faqLocation" className="section"><div className="shell home-faq-location">
          {home.faq.length > 0 && (
            <div className="faq-block">
              <div className="section-heading"><div><p className="eyebrow dark"><HelpCircle size={15} aria-hidden="true" /> {b.eyebrow}</p><h2>{b.title}</h2></div></div>
              {home.faq.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
            </div>
          )}
          {address.length > 0 && (
            <div className="location-panel"><MapPin size={24} aria-hidden="true" /><p className="eyebrow dark">Onde estamos</p><h3>{identity.name}</h3><p>{address.map((l, k) => <span key={k}>{l}<br /></span>)}</p>{contact.hours && <p>{contact.hours}</p>}
              {contact.mapsUrl ? <a className="button button-outline" href={contact.mapsUrl} target="_blank" rel="noreferrer">Ver como chegar</a> : ctx.on('contato') && <Link className="button button-outline" href={ctx.href('/contato')}>Falar com a equipe</Link>}
            </div>
          )}
        </div></section>
      )
    case 'contactBand': {
      const cards = [
        wa && <a key="wa" className="contact-card contact-card-primary" href={wa} target="_blank" rel="noreferrer"><span className="contact-icon"><MessageCircle size={22} aria-hidden="true" /></span><span>WhatsApp<strong>{contact.phone || 'Falar agora'}</strong><small>Atendimento rápido e personalizado</small></span></a>,
        contact.email && <a key="mail" className="contact-card" href={`mailto:${contact.email}`}><span className="contact-icon"><Mail size={22} aria-hidden="true" /></span><span>E-mail<strong>{contact.email}</strong><small>Propostas e parcerias comerciais</small></span></a>,
        address.length > 0 && <a key="map" className="contact-card" href={contact.mapsUrl || '#'} target="_blank" rel="noreferrer"><span className="contact-icon"><MapPin size={22} aria-hidden="true" /></span><span>{identity.name}<strong>{address[0]}</strong>{address[1] && <small>{address[1]}</small>}</span></a>,
      ].filter(Boolean)
      if (!cards.length) return null
      return (
        <section key="contactBand" className="section"><div className="shell"><div className={`cband ccols-${cards.length}`}>
          <div className="contact-band-intro">{b.eyebrow && <span className="contact-kicker">{b.eyebrow}</span>}<h2>{b.title}</h2><p>Escolha o melhor canal para falar com a nossa equipe.</p></div>
          {cards}
        </div></div></section>
      )
    }
    default:
      return null
  }
}

export default async function SiteHome({ params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const ctx = await getSiteContext(site)
  const { contact } = ctx.config
  const { items } = await listSiteVehicles(ctx.tenantId, { page: 1 }).catch(() => ({ items: [] }))
  const parts: Parts = { ctx, items, wa: ctx.whatsapp(), address: [contact.addressLine1, contact.addressLine2].filter(Boolean) }
  const blocks = ctx.config.homeBlocks.filter((b) => b.visible)
  return <>{blocks.map((b, i) => renderBlock(b, i, blocks, parts))}</>
}
