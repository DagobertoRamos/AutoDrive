// Anúncio do veículo (porta de /veiculos/[slug] do dagobertoeasycar).
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSiteContext } from '@/lib/site/context'
import { findSiteVehicle, listSiteVehicles } from '@/lib/site/vehicles'
import { fuelLabel, money, transmissionLabel } from '@/lib/site/listing-core'
import { SiteVehicleGallery } from '@/components/site/SiteVehicleGallery'
import { SiteVehicleCard } from '@/components/site/SiteVehicleCard'
import { SiteVehicleLeadActions } from '@/components/site/SiteVehicleLeadActions'

type Props = { params: Promise<{ site: string; slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site, slug } = await params
  const ctx = await getSiteContext(site)
  const v = await findSiteVehicle(ctx.tenantId, slug).catch(() => null)
  if (!v) return {}
  const auto = [v.title, v.modelYear ? `ano ${v.year ?? v.modelYear}/${v.modelYear}` : '', v.km != null ? `${v.km.toLocaleString('pt-BR')} km` : '', money(v.price)].filter(Boolean).join(', ')
  const title = v.seoTitle || v.title
  const description = v.seoDescription || `${auto}. Financiamento e atendimento pela ${ctx.config.identity.name}.`
  const url = ctx.href(`/veiculos/${v.slug}`)
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, images: v.cover ? [v.cover] : undefined } }
}

export default async function SiteVehiclePage({ params }: Props) {
  const { site, slug } = await params
  const ctx = await getSiteContext(site)
  const v = await findSiteVehicle(ctx.tenantId, slug).catch(() => null)
  if (!v) notFound()
  const suggestions = (await listSiteVehicles(ctx.tenantId, { brand: v.brand }).catch(() => ({ items: [] }))).items.filter((x) => x.id !== v.id).slice(0, 3)
  const specs = [
    ['⚙️', transmissionLabel(v.transmission) || 'Consulte'],
    ['📅', v.year || v.modelYear ? `${v.year ?? '—'}/${v.modelYear ?? '—'}` : ''],
    ['🛣️', v.km != null ? `${v.km.toLocaleString('pt-BR')} km` : ''],
    ['🎨', v.color], ['🚪', v.doors ? `${v.doors} portas` : ''], ['🚗', v.bodyType || fuelLabel(v.fuel)], ['⛽', v.bodyType ? fuelLabel(v.fuel) : ''],
  ].filter(([, t]) => t)
  const paragraphs = v.description.split(/\n+/).filter((p) => p.trim())

  return (
    <>
      <section className="shell section">
        <SiteVehicleGallery photos={v.photos} title={v.title} videoUrl={v.videoUrl} />
        <div className="detail-badges">
          {v.state === 'EM_BREVE' && <div className="detail-badge"><span className="detail-badge-icon">⏳</span><span>Fotos em breve</span></div>}
          {v.featured && <div className="detail-badge"><span className="detail-badge-icon">⭐</span><span>Destaque</span></div>}
          {v.promo && <div className="detail-badge"><span className="detail-badge-icon">🏷️</span><span>Promoção</span></div>}
          <div className="detail-badge"><span className="detail-badge-icon">🔄</span><span>Aceita troca</span></div>
        </div>
        <div className="detail-layout">
          <div className="detail-main">
            <div className="detail-header">
              <div><h1 className="detail-title">{v.brand} <span>{v.model}</span></h1><p className="detail-version">{v.version}</p></div>
              <div className="detail-price-box">
                {v.oldPrice != null && <span className="detail-old-price">de {money(v.oldPrice)}</span>}
                <strong className="detail-price">{money(v.price)}</strong>
              </div>
            </div>
            <div className="detail-section">
              <h2 className="detail-section-title">Ficha técnica</h2>
              <div className="detail-specs">{specs.map(([icon, text]) => <div key={text} className="detail-spec"><span className="detail-spec-icon">{icon}</span><span>{text}</span></div>)}</div>
            </div>
            {v.options.length > 0 && (
              <div className="detail-section"><h2 className="detail-section-title">Opcionais</h2><div className="detail-options">{v.options.map((o) => <span key={o} className="detail-option">{o}</span>)}</div></div>
            )}
            {paragraphs.length > 0 && (
              <div className="detail-section"><h2 className="detail-section-title">+ Informações</h2><div className="detail-description">{paragraphs.map((p, i) => <p key={i}>{p}</p>)}</div></div>
            )}
          </div>
          <aside className="detail-sidebar">
            <SiteVehicleLeadActions
              vehicle={{ id: v.id, title: v.title, version: v.version, price: money(v.price), image: v.cover }}
              apiUrl={ctx.apiUrl} storeName={ctx.config.identity.name}
              whatsappHref={ctx.whatsapp(`Olá! Vi o ${v.title} no site da ${ctx.config.identity.name} e gostaria de mais informações.`)}
              phone={ctx.config.contact.phone} privacyHref={ctx.href('/privacidade')} showFinancing={ctx.on('financiamento')}
            />
          </aside>
        </div>
      </section>
      {suggestions.length > 0 && (
        <section className="shell section">
          <div className="section-heading"><h2>Sugestões para você</h2><Link href={ctx.href('/veiculos')}>Ver todos</Link></div>
          <div className="vehicle-grid" style={{ gridTemplateColumns: `repeat(${Math.min(suggestions.length, 3)}, minmax(0, 1fr))` }}>
            {suggestions.map((s, i) => <SiteVehicleCard key={s.id} vehicle={s} base={ctx.base} index={i} />)}
          </div>
        </section>
      )}
    </>
  )
}
