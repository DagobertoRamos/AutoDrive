// =============================================================================
// CRM — identifica o veículo INTERNO de um lead externo.
// Ordem: id interno → id do anúncio no portal (Publication.remoteId/externalRef,
// a projeção do nosso estoque no portal) → placa citada. Nunca cria veículo.
// Lead de carro vendido NÃO é descartado: devolve sugestões semelhantes.
// =============================================================================

import { prisma } from '@/lib/prisma'

/** Origem do CRM → canal de publicação (para casar o id do anúncio no portal certo). */
const SOURCE_TO_CHANNEL: Record<string, string> = {
  WEBMOTORS: 'WEBMOTORS', OLX: 'OLX', MERCADO_LIVRE: 'MERCADO_LIVRE', MOBIAUTO: 'MOBIAUTO',
  CHAVES_NA_MAO: 'CHAVES_NA_MAO', FACEBOOK: 'META_PAGE', INSTAGRAM: 'INSTAGRAM', TIKTOK: 'TIKTOK',
}

const AVAILABLE = ['DISPONIVEL', 'EM_PROMOCAO'] as const

const PLATE_RE = /\b([A-Z]{3})-?(\d[A-Z0-9]\d{2})\b/

/** Placa brasileira (antiga ou Mercosul) citada num texto — ou ''. */
export function plateFromText(text: string | null | undefined): string {
  const m = (text ?? '').toUpperCase().match(PLATE_RE)
  return m ? `${m[1]}${m[2]}` : ''
}

export interface MatchedVehicle {
  vehicleId: string
  title: string
  stockStatus: string | null
  sold: boolean
  /** Como foi achado: id interno, anúncio do portal ou placa. */
  via: 'ID' | 'LISTING' | 'PLATE'
}

const SELECT = { id: true, brand: true, model: true, version: true, modelYear: true, year: true, stockStatus: true, active: true, salePrice: true, bodyType: true } as const
type Row = { id: string; brand: string | null; model: string | null; version: string | null; modelYear: number | null; year: number | null; stockStatus: string | null; active: boolean; salePrice: unknown; bodyType: string | null }

export const vehicleTitle = (v: Pick<Row, 'brand' | 'model' | 'version' | 'modelYear' | 'year'>) =>
  [v.brand, v.model, v.version, v.modelYear ?? v.year].filter(Boolean).join(' ').trim() || 'Veículo'

const toMatch = (v: Row, via: MatchedVehicle['via']): MatchedVehicle => ({
  vehicleId: v.id, title: vehicleTitle(v), stockStatus: v.stockStatus,
  sold: v.stockStatus === 'VENDIDO' || !v.active, via,
})

export async function matchLeadVehicle(tenantId: string, q: { vehicleId?: string | null; externalListingId?: string | null; source?: string | null; text?: string | null }): Promise<MatchedVehicle | null> {
  if (q.vehicleId) {
    const v = await prisma.vehicle.findFirst({ where: { id: q.vehicleId, tenantId }, select: SELECT })
    if (v) return toMatch(v as Row, 'ID')
  }
  const listing = (q.externalListingId ?? '').trim()
  if (listing) {
    const channel = q.source ? SOURCE_TO_CHANNEL[q.source] : undefined
    const pub = await prisma.publication.findFirst({
      where: { tenantId, ...(channel ? { channel } : {}), OR: [{ remoteId: listing }, { externalRef: listing }] },
      orderBy: { updatedAt: 'desc' },
      select: { vehicleId: true },
    })
    if (pub) {
      const v = await prisma.vehicle.findFirst({ where: { id: pub.vehicleId, tenantId }, select: SELECT })
      if (v) return toMatch(v as Row, 'LISTING')
    }
  }
  const plate = plateFromText(q.text)
  if (plate) {
    const dashed = `${plate.slice(0, 3)}-${plate.slice(3)}`
    const v = await prisma.vehicle.findFirst({
      where: { tenantId, OR: [{ plate: { equals: plate, mode: 'insensitive' } }, { plate: { equals: dashed, mode: 'insensitive' } }] },
      orderBy: { updatedAt: 'desc' },
      select: SELECT,
    })
    if (v) return toMatch(v as Row, 'PLATE')
  }
  return null
}

/** Até `limit` carros disponíveis parecidos (mesma marca/carroceria, preço ±25%). */
export async function similarVehicles(tenantId: string, vehicleId: string, limit = 3): Promise<{ id: string; title: string; price: number | null }[]> {
  const base = await prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId }, select: SELECT })
  if (!base) return []
  const price = base.salePrice ? Number(base.salePrice) : null
  const rows = await prisma.vehicle.findMany({
    where: {
      tenantId, active: true, id: { not: vehicleId }, stockStatus: { in: [...AVAILABLE] },
      OR: [
        ...(base.brand ? [{ brand: { equals: base.brand, mode: 'insensitive' as const } }] : []),
        ...(base.bodyType ? [{ bodyType: { equals: base.bodyType, mode: 'insensitive' as const } }] : []),
      ],
      ...(price ? { salePrice: { gte: price * 0.75, lte: price * 1.25 } } : {}),
    },
    select: SELECT,
    take: 30,
  }).catch(() => [])
  // Mesmo modelo primeiro, depois mesma marca, depois preço mais próximo.
  const score = (v: Row) => (v.model && base.model && v.model.toLowerCase() === base.model.toLowerCase() ? 0 : 10)
    + (v.brand && base.brand && v.brand.toLowerCase() === base.brand.toLowerCase() ? 0 : 5)
    + (price && v.salePrice ? Math.abs(Number(v.salePrice) - price) / price : 1)
  return (rows as Row[]).sort((a, b) => score(a) - score(b)).slice(0, limit)
    .map((v) => ({ id: v.id, title: vehicleTitle(v), price: v.salePrice ? Number(v.salePrice) : null }))
}
