// =============================================================================
// Marca canônica — o estoque chega com a marca escrita de vários jeitos
// ("VW - VolksWagen", "VOLKSWAGEN", "GM - Chevrolet", "CHERY"/"Caoa Chery",
// "Citroen"/"Citroën", "Kia Motors", "YAMANHA FAZER 250"…). Tudo vira uma
// marca só (slug + nome bonito + logo), para o carrossel de marcas, o filtro
// do estoque e as páginas por marca. PURO.
// Logos: /public/site/brands/<slug>.webp (car-logos-dataset, MIT; as marcas
// pertencem aos respectivos fabricantes).
// =============================================================================

export interface CanonicalBrand { slug: string; label: string }

const deburr = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const key = (s: string) => deburr(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** slug → nome exibido. */
const LABELS: Record<string, string> = {
  'alfa-romeo': 'Alfa Romeo', audi: 'Audi', bmw: 'BMW', byd: 'BYD', chery: 'Caoa Chery', chevrolet: 'Chevrolet',
  chrysler: 'Chrysler', citroen: 'Citroën', dodge: 'Dodge', ferrari: 'Ferrari', fiat: 'Fiat', ford: 'Ford',
  geely: 'Geely', gwm: 'GWM', haval: 'Haval', honda: 'Honda', hyundai: 'Hyundai', infiniti: 'Infiniti', iveco: 'Iveco',
  jac: 'JAC', jaguar: 'Jaguar', jeep: 'Jeep', jetour: 'Jetour', kia: 'Kia', lamborghini: 'Lamborghini',
  'land-rover': 'Land Rover', leapmotor: 'Leapmotor', lexus: 'Lexus', lifan: 'Lifan', maserati: 'Maserati',
  'mercedes-benz': 'Mercedes-Benz', mini: 'Mini', mitsubishi: 'Mitsubishi', nissan: 'Nissan', omoda: 'Omoda',
  peugeot: 'Peugeot', porsche: 'Porsche', ram: 'RAM', renault: 'Renault', seat: 'Seat', skoda: 'Skoda', smart: 'Smart',
  ssangyong: 'SsangYong', subaru: 'Subaru', suzuki: 'Suzuki', tesla: 'Tesla', toyota: 'Toyota', troller: 'Troller',
  volkswagen: 'Volkswagen', volvo: 'Volvo', zeekr: 'Zeekr',
  yamaha: 'Yamaha', 'royal-enfield': 'Royal Enfield', shineray: 'Shineray', kawasaki: 'Kawasaki',
  'harley-davidson': 'Harley-Davidson', ducati: 'Ducati', triumph: 'Triumph', dafra: 'Dafra', haojue: 'Haojue', bajaj: 'Bajaj',
}

/** Marcas com arquivo de logo em /public/site/brands. */
const LOGOS = new Set([
  'alfa-romeo', 'audi', 'bmw', 'byd', 'chery', 'chevrolet', 'chrysler', 'citroen', 'dodge', 'ferrari', 'fiat', 'ford',
  'geely', 'haval', 'honda', 'hyundai', 'infiniti', 'iveco', 'jac', 'jaguar', 'jeep', 'jetour', 'kia', 'lamborghini',
  'land-rover', 'leapmotor', 'lexus', 'lifan', 'maserati', 'mercedes-benz', 'mini', 'mitsubishi', 'nissan', 'omoda',
  'peugeot', 'porsche', 'ram', 'renault', 'seat', 'skoda', 'smart', 'ssangyong', 'subaru', 'suzuki', 'tesla', 'toyota',
  'troller', 'volkswagen', 'volvo', 'zeekr',
])

/** Apelidos/grafias (já em `key()`) → slug. Casados por palavra inteira. */
const ALIASES: [string, string][] = [
  ['vw', 'volkswagen'], ['volks', 'volkswagen'], ['volkswagen', 'volkswagen'],
  ['gm', 'chevrolet'], ['chevrolet', 'chevrolet'], ['chevy', 'chevrolet'],
  ['caoa chery', 'chery'], ['chery', 'chery'], ['citroen', 'citroen'],
  ['mercedes benz', 'mercedes-benz'], ['mercedes', 'mercedes-benz'], ['mb', 'mercedes-benz'],
  ['land rover', 'land-rover'], ['range rover', 'land-rover'], ['alfa romeo', 'alfa-romeo'],
  ['kia motors', 'kia'], ['kia', 'kia'], ['great wall', 'gwm'], ['gwm', 'gwm'], ['haval', 'gwm'],
  ['royal enfield', 'royal-enfield'], ['harley davidson', 'harley-davidson'], ['harley', 'harley-davidson'],
  ['yamanha', 'yamaha'], ['yamaha', 'yamaha'], ['ssang yong', 'ssangyong'],
]

/** Palavras que não são marca (vieram no campo errado da fonte). */
const NOT_A_BRAND = new Set(['moto', 'motos', 'carro', 'carros', 'outros', 'outro', 'diversos', 'na', 'nd'])

/** Marca canônica de um texto qualquer; null quando não dá para saber. */
export function canonicalBrand(raw: string | null | undefined): CanonicalBrand | null {
  const k = key(String(raw ?? ''))
  if (!k || NOT_A_BRAND.has(k)) return null
  const padded = ` ${k} `
  for (const [alias, slug] of ALIASES) if (padded.includes(` ${alias} `)) return { slug, label: LABELS[slug] ?? alias }
  const direct = k.replace(/ /g, '-')
  if (LABELS[direct]) return { slug: direct, label: LABELS[direct] }
  // Primeira palavra conhecida ("HONDA CG 160" → honda).
  const first = k.split(' ')[0]
  if (LABELS[first]) return { slug: first, label: LABELS[first] }
  // Desconhecida: mantém como veio, só arrumando a caixa.
  const label = deburr(String(raw)).trim().toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, s: string, l: string) => s + l.toUpperCase())
  return { slug: direct, label }
}

/** Caminho do logo (relativo à raiz do site) ou null. */
export function brandLogo(slug: string): string | null {
  // GWM vende a linha Haval no Brasil: usa o logo Haval.
  const file = slug === 'gwm' ? 'haval' : slug
  return LOGOS.has(file) ? `/site/brands/${file}.webp` : null
}

export interface BrandCount extends CanonicalBrand { total: number; logo: string | null }

/** Marcas presentes numa lista de marcas cruas, com a contagem — ordem alfabética. */
export function brandCounts(rawBrands: (string | null | undefined)[]): BrandCount[] {
  const map = new Map<string, BrandCount>()
  for (const r of rawBrands) {
    const c = canonicalBrand(r)
    if (!c) continue
    const cur = map.get(c.slug) ?? { ...c, total: 0, logo: brandLogo(c.slug) }
    cur.total++
    map.set(c.slug, cur)
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

/** Grafias cruas do estoque que pertencem à marca pedida (filtro do estoque). */
export function brandVariants(wanted: string, rawBrands: (string | null | undefined)[]): string[] {
  const target = canonicalBrand(wanted)?.slug
  if (!target) return []
  return [...new Set(rawBrands.filter((r): r is string => !!r && canonicalBrand(r)?.slug === target))]
}
