// Página de entrada do Google por marca (serviço "Páginas por marca e cidade"):
// só existe para marca com carro no site. Porta de /carros/[marca] do dagobertoeasycar.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSiteContext } from '@/lib/site/context'
import { listSiteVehicles, siteBrandLandings } from '@/lib/site/vehicles'
import { money } from '@/lib/site/listing-core'
import { SiteVehicleCard } from '@/components/site/SiteVehicleCard'

type Props = { params: Promise<{ site: string; marca: string }> }

async function load(site: string, marca: string) {
  const ctx = await getSiteContext(site)
  if (!ctx.on('seoLandings')) return null
  const brands = await siteBrandLandings(ctx.tenantId).catch(() => [])
  const brand = brands.find((b) => b.slug === marca)
  return brand ? { ctx, brand, brands } : null
}

function where(cities: { name: string }[]) {
  return cities.length ? ` em ${cities.slice(0, 2).map((c) => c.name).join(' e ')}` : ''
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site, marca } = await params
  const r = await load(site, marca)
  if (!r) return {}
  const { ctx, brand } = r
  const title = `${brand.name} seminovos${where(ctx.config.seoCities)}`
  const description = `${brand.total} ${brand.name} disponíveis na ${ctx.config.identity.name}${brand.minPrice ? ` a partir de ${money(brand.minPrice)}` : ''}. Financiamento, troca e atendimento pelo WhatsApp.`
  const url = ctx.href(`/carros/${brand.slug}`)
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url } }
}

export default async function SiteBrandLanding({ params }: Props) {
  const { site, marca } = await params
  const r = await load(site, marca)
  if (!r) notFound()
  const { ctx, brand, brands } = r
  const { items } = await listSiteVehicles(ctx.tenantId, { brand: brand.name, sort: 'price_asc' }).catch(() => ({ items: [] }))
  const name = ctx.config.identity.name
  return (
    <>
      <section className="page-hero"><div className="shell">
        <p className="eyebrow">Estoque {name}</p>
        <h1>{brand.name} seminovos</h1>
        <p>{brand.total} {brand.name} disponíveis hoje{brand.minPrice && brand.maxPrice ? `, de ${money(brand.minPrice)} a ${money(brand.maxPrice)}` : ''}. Financiamento, avaliação do seu usado na troca e atendimento rápido pelo WhatsApp.</p>
      </div></section>
      <section className="shell section">
        <div className="vehicle-grid">{items.map((v, i) => <SiteVehicleCard key={v.id} vehicle={v} base={ctx.base} index={i} />)}</div>
        <p className="mapa-acoes">
          <Link className="button" href={ctx.href(`/veiculos?brand=${encodeURIComponent(brand.name)}`)}>Ver com filtros</Link>
          {ctx.on('encontreSeuCarro') && <Link className="button button-outline" href={ctx.href('/encontre-seu-carro')}>Não achei o que queria</Link>}
        </p>
      </section>
      <section className="shell section"><div className="prose">
        <h2>Comprar {brand.name} na {name}</h2>
        <p>Todos os {brand.name} anunciados estão disponíveis para visita e negociação{where(ctx.config.seoCities)}. Aceitamos seu carro como parte do pagamento e fazemos a simulação de financiamento com as financeiras parceiras.</p>
        {brands.length > 1 && <><h3>Outras marcas no estoque</h3><p className="mapa-acoes">{brands.filter((b) => b.slug !== brand.slug).slice(0, 12).map((b) => <Link key={b.slug} className="button button-outline" href={ctx.href(`/carros/${b.slug}`)}>{b.name} ({b.total})</Link>)}</p></>}
      </div></section>
    </>
  )
}
