// GET /api/publications/vehicles?q=&ids=a,b — estoque para a Central:
// veículos anunciáveis (Disponível/Em promoção) com capa, fotos, preço,
// situação das fotos (tratadas/aprovadas) e canais onde já estão.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { effectivePrice, vehicleTitle } from '@/lib/site/listing-core'
import { PUBLISHABLE_STOCK } from '@/lib/publications/sale-rules-core'
import { pubAuth } from '@/lib/publications/api'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()
  const ids = (sp.get('ids') ?? '').split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9]{10,40}$/i.test(s)).slice(0, 100)
  try {
    const rows = await prisma.vehicle.findMany({
      where: {
        tenantId: a.tenantId,
        ...(ids.length ? { id: { in: ids } } : { active: true, stockStatus: { in: [...PUBLISHABLE_STOCK] } }),
        ...(q ? { OR: [{ brand: { contains: q, mode: 'insensitive' } }, { model: { contains: q, mode: 'insensitive' } }, { version: { contains: q, mode: 'insensitive' } }, { plate: { contains: q.replace(/[^a-z0-9]/gi, ''), mode: 'insensitive' } }] } : {}),
      },
      orderBy: { updatedAt: 'desc' }, take: ids.length ? 100 : 60,
      select: {
        id: true, brand: true, model: true, version: true, year: true, modelYear: true, plate: true, km: true, active: true, stockStatus: true,
        salePrice: true, promoPrice: true, isPromo: true, promoStartsAt: true, promoEndsAt: true, mainPhotoUrl: true,
        unit: { select: { name: true } }, _count: { select: { photos: true } },
        siteListing: { select: { photosStatus: true } },
        publications: { where: { archivedAt: null }, select: { channel: true, status: true } },
      },
    })
    const drafts = new Map((await prisma.publicationDraft.findMany({ where: { tenantId: a.tenantId, vehicleId: { in: rows.map((r) => r.id) } }, select: { vehicleId: true, approvedAt: true, mediaRevisionId: true } })).map((d) => [d.vehicleId, d]))
    const pending = new Set((await prisma.publicationRevision.findMany({ where: { tenantId: a.tenantId, vehicleId: { in: rows.map((r) => r.id) }, kind: 'MEDIA', status: 'PENDENTE' }, select: { vehicleId: true } })).map((r) => r.vehicleId))
    return NextResponse.json({
      success: true,
      data: rows.map((v) => {
        const p = effectivePrice({ salePrice: v.salePrice == null ? null : Number(v.salePrice), promoPrice: v.promoPrice == null ? null : Number(v.promoPrice), isPromo: v.isPromo, promoStartsAt: v.promoStartsAt, promoEndsAt: v.promoEndsAt })
        return {
          id: v.id, title: vehicleTitle(v), plate: v.plate, year: v.year, modelYear: v.modelYear, km: v.km, stockStatus: v.stockStatus, unit: v.unit?.name ?? null,
          cover: v.mainPhotoUrl, photos: v._count.photos, price: p.price, publishable: v.active && (PUBLISHABLE_STOCK as readonly string[]).includes(String(v.stockStatus)),
          photosStatus: v.siteListing?.photosStatus ?? 'ORIGEM', mediaApproved: !!drafts.get(v.id)?.mediaRevisionId, mediaPending: pending.has(v.id),
          channels: v.publications.map((x) => ({ channel: x.channel, status: x.status })),
        }
      }),
    })
  } catch (e) {
    return handlePrismaError(e)
  }
}
