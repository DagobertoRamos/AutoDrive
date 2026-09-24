// Página de entrada do Google por cidade atendida (serviço "Páginas por marca
// e cidade"): a loja escolhe as cidades no painel. Porta de /carros-em/[cidade].
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSiteContext } from '@/lib/site/context'
import { listSiteVehicles, siteBrandLandings } from '@/lib/site/vehicles'
import { SiteVehicleCard } from '@/components/site/SiteVehicleCard'

type Props = { params: Promise<{ site: string; cidade: string }> }

async function load(site: string, cidade: string) {
  const ctx = await getSiteContext(site)
  if (!ctx.on('seoLandings')) return null
  const city = ctx.config.seoCities.find((c) => c.slug === cidade)
  return city ? { ctx, city } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site, cidade } = await params
  const r = await load(site, cidade)
  if (!r) return {}
  const title = `Carros seminovos em ${r.city.name}`
  const description = `Seminovos com financiamento e troca para quem está em ${r.city.name}. Estoque da ${r.ctx.config.identity.name} com atendimento pelo WhatsApp.`
  const url = r.ctx.href(`/carros-em/${r.city.slug}`)
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url } }
}

export default async function SiteCityLanding({ params }: Props) {
  const { site, cidade } = await params
  const r = await load(site, cidade)
  if (!r) notFound()
  const { ctx, city } = r
  const [{ items }, brands] = await Promise.all([
    listSiteVehicles(ctx.tenantId, { page: 1 }).catch(() => ({ items: [] })),
    siteBrandLandings(ctx.tenantId).catch(() => []),
  ])
  const name = ctx.config.identity.name
  const address = [ctx.config.contact.addressLine1, ctx.config.contact.addressLine2].filter(Boolean).join(' · ')
  return (
    <>
      <section className="page-hero"><div className="shell">
        <p className="eyebrow">{name} · {city.name}</p>
        <h1>Carros seminovos em {city.name}</h1>
        <p>{city.text || `Atendemos ${city.name} com o mesmo cuidado de sempre: visita combinada pelo WhatsApp, financiamento e avaliação do seu usado na troca.`}</p>
      </div></section>
      <section className="shell section">
        <div className="vehicle-grid">{items.slice(0, 12).map((v, i) => <SiteVehicleCard key={v.id} vehicle={v} base={ctx.base} index={i} />)}</div>
        <p className="mapa-acoes"><Link className="button" href={ctx.href('/veiculos')}>Ver todo o estoque</Link></p>
      </section>
      <section className="shell section"><div className="prose">
        <h2>Atendimento para {city.name}</h2>
        <p>{address ? `Nossa loja fica em ${address}. ` : ''}Quem está em {city.name} pode agendar a visita, fazer a simulação de financiamento e avaliar o carro na troca antes de sair de casa.</p>
        {brands.length > 0 && <><h3>Marcas no estoque</h3><p className="mapa-acoes">{brands.slice(0, 12).map((b) => <Link key={b.slug} className="button button-outline" href={ctx.href(`/carros/${b.slug}`)}>{b.name} ({b.total})</Link>)}</p></>}
        {ctx.config.seoCities.length > 1 && <><h3>Outras cidades atendidas</h3><p className="mapa-acoes">{ctx.config.seoCities.filter((c) => c.slug !== city.slug).map((c) => <Link key={c.slug} className="button button-outline" href={ctx.href(`/carros-em/${c.slug}`)}>{c.name}</Link>)}</p></>}
      </div></section>
    </>
  )
}
