// Card do veículo na vitrine (porta do VehicleCard do dagobertoeasycar).
import Link from 'next/link'
import { CalendarDays, Gauge, ShieldCheck } from 'lucide-react'
import { money } from '@/lib/site/listing-core'
import type { SiteVehicle } from '@/lib/site/vehicles'
import { SiteVehicleImage } from './SiteVehicleImage'

const BRAND_MARKS: Record<string, string> = {
  volkswagen: 'VW', chevrolet: 'GM', 'mercedes-benz': 'MB', mercedes: 'MB', 'land rover': 'LR', 'alfa romeo': 'AR',
  bmw: 'BMW', audi: 'AUDI', fiat: 'FIAT', ford: 'FORD', jeep: 'JEEP', kia: 'KIA', ram: 'RAM', byd: 'BYD', gwm: 'GWM',
  mini: 'MINI', volvo: 'VOLVO', honda: 'H', hyundai: 'H', toyota: 'T', nissan: 'N', renault: 'R', peugeot: 'P',
  citroen: 'C', 'citroën': 'C', mitsubishi: 'M', suzuki: 'S', chery: 'C', 'caoa chery': 'C', jac: 'JAC', porsche: 'P', yamaha: 'Y',
}

function titleCase(v: string) { return v.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, l: string) => sep + l.toUpperCase()) }
/** Marca/modelo em CAIXA ALTA vira título. */
function tidy(v: string) {
  const c = v.trim()
  return c.length > 3 && c === c.toUpperCase() && /\p{L}{4,}/u.test(c) ? titleCase(c) : c
}
function brandMark(brand: string) {
  const k = brand.trim().toLowerCase()
  return BRAND_MARKS[k] ?? k.replace(/[^\p{L}]/gu, '').slice(0, 2).toUpperCase()
}
function badge(v: SiteVehicle) {
  if (v.state === 'EM_BREVE') return { label: 'Em breve', tone: 'dark' }
  if (v.promo) return { label: 'Oportunidade', tone: 'hot' }
  if (v.featured) return { label: 'Destaque', tone: 'brand' }
  const y = v.modelYear || v.year
  if (y && y >= new Date().getFullYear() - 1) return { label: 'Seminovo', tone: 'brand' }
  return null
}

export function SiteVehicleCard({ vehicle, base, index = 0 }: { vehicle: SiteVehicle; base: string; index?: number }) {
  const href = `${base}/veiculos/${vehicle.slug}`
  const heading = [tidy(vehicle.brand), tidy(vehicle.model)].filter(Boolean).join(' ') || vehicle.title
  const version = vehicle.version.trim() || vehicle.title
  const b = badge(vehicle)
  return (
    <article className="vehicle-card vcard">
      <Link href={href} className="vehicle-image vcard-image" aria-label={`Ver ${vehicle.title}`}>
        <SiteVehicleImage src={vehicle.cover} alt={vehicle.title} loading={index < 6 ? 'eager' : 'lazy'} />
        {b && <span className={`vcard-badge ${b.tone}`}>{b.label}</span>}
      </Link>
      <div className="vcard-body">
        <div className="vcard-head">
          <span className="vcard-logo" aria-hidden="true">{brandMark(vehicle.brand || heading)}</span>
          <h2><Link href={href} title={vehicle.title}>{heading}</Link></h2>
        </div>
        <p className="vcard-version" title={version}>{version}</p>
        <div className="vcard-meta">
          {(vehicle.year || vehicle.modelYear) && <span><CalendarDays size={14} aria-hidden="true" />{vehicle.year ?? '—'}/{vehicle.modelYear ?? '—'}</span>}
          {vehicle.km != null && <span><Gauge size={14} aria-hidden="true" />{vehicle.km.toLocaleString('pt-BR')} km</span>}
          {vehicle.inspected && <span className="vcard-inspected"><ShieldCheck size={14} aria-hidden="true" />Periciado</span>}
        </div>
        <div className="vcard-foot">
          <div className="vcard-price">
            {vehicle.oldPrice != null && <span className="vcard-old">de {money(vehicle.oldPrice)}</span>}
            <strong>{vehicle.oldPrice != null && <small>por</small>}{money(vehicle.price)}</strong>
          </div>
          <Link href={href} className="vcard-more">Ver mais</Link>
        </div>
      </div>
    </article>
  )
}
