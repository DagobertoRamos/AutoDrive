// =============================================================================
// GET /api/site-admin/listings — todos os carros do estoque com a situação no
// site (Publicado / Em breve / Fora do site e por quê). Gate: site.
// Query: q, state (PUBLICADO|EM_BREVE|HIDDEN)
// =============================================================================

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { realPhotoUrls } from '@/lib/vehicle-placeholder'
import { prisma } from '@/lib/prisma'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { effectivePrice, promoState, siteVehicleState, SITE_VISIBLE_STOCK, vehicleSlug, vehicleTitle } from '@/lib/site/listing-core'

export const dynamic = 'force-dynamic'

const STOCK_LABEL: Record<string, string> = {
  VENDIDO: 'vendido', RESERVADO: 'reservado', BLOQUEADO: 'bloqueado', EM_NEGOCIACAO: 'em negociação', EM_SERVICO: 'em serviço',
  EM_ATACADO: 'no atacado', COMPRADO: 'comprado (ainda não disponível)', CANCELADO: 'cancelado', DEVOLVIDO: 'devolvido', PENDENTE_DOCUMENTACAO: 'pendente de documentação',
}

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site')) return forbiddenResponse('Sem acesso ao site da loja.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()
  const wanted = sp.get('state')

  try {
    const base: Prisma.VehicleWhereInput = {
      tenantId,
      ...(q ? { OR: [{ brand: { contains: q, mode: 'insensitive' } }, { model: { contains: q, mode: 'insensitive' } }, { plate: { contains: q.replace(/[^a-z0-9]/gi, ''), mode: 'insensitive' } }] } : {}),
    }
    // Estoque visível (ou escondido à mão) vem sempre, mesmo o antigo; o resto
    // do histórico (vendidos etc.) só os mais recentes.
    const relevant: Prisma.VehicleWhereInput = { OR: [{ active: true, stockStatus: { in: [...SITE_VISIBLE_STOCK] } }, { siteListing: { is: { hidden: true } } }] }
    const select = {
      id: true, brand: true, model: true, version: true, year: true, modelYear: true, plate: true, km: true, active: true, stockStatus: true,
      salePrice: true, promoPrice: true, isPromo: true, promoStartsAt: true, promoEndsAt: true, mainPhotoUrl: true, createdAt: true, notes: true,
      photos: { select: { url: true }, orderBy: [{ isMain: 'desc' as const }, { order: 'asc' as const }] },
      siteListing: { select: { featured: true, hidden: true, title: true, description: true, options: true, videoUrl: true, seoTitle: true, seoDescription: true } },
    } satisfies Prisma.VehicleSelect
    const [main, rest] = await Promise.all([
      prisma.vehicle.findMany({ where: { AND: [base, relevant] }, select, orderBy: { createdAt: 'desc' }, take: 2000 }),
      prisma.vehicle.findMany({ where: { AND: [base, { NOT: relevant }] }, select, orderBy: { createdAt: 'desc' }, take: 500 }),
    ])
    const rows = [...main, ...rest]
    const data = rows.map((r) => {
      const real = realPhotoUrls(r.photos.map((p) => p.url))
      const state = siteVehicleState({ active: r.active, stockStatus: r.stockStatus }, r.siteListing ? { photosStatus: 'ORIGEM', hidden: r.siteListing.hidden } : null, real.length)
      const why = state !== 'HIDDEN' ? null
        // A situação do estoque vem antes: a retirada automática também marca "escondido".
        : !r.active ? (r.notes?.startsWith('Importado do site antigo') ? 'veículo inativo (saiu do feed do site antigo)' : 'veículo inativo')
        : !r.stockStatus || !(SITE_VISIBLE_STOCK as readonly string[]).includes(r.stockStatus) ? `estoque: ${STOCK_LABEL[r.stockStatus ?? ''] ?? 'sem status'}`
        : r.siteListing?.hidden ? 'escondido do site' : null
      const t = { id: r.id, brand: r.brand, model: r.model, version: r.version, modelYear: r.modelYear, year: r.year }
      const pl = { salePrice: r.salePrice == null ? null : Number(r.salePrice), promoPrice: r.promoPrice == null ? null : Number(r.promoPrice), isPromo: r.isPromo, promoStartsAt: r.promoStartsAt, promoEndsAt: r.promoEndsAt }
      const price = effectivePrice(pl)
      return {
        id: r.id, title: vehicleTitle(t), slug: vehicleSlug(t), plate: r.plate, year: r.year, modelYear: r.modelYear, km: r.km,
        cover: (r.mainPhotoUrl && real.includes(r.mainPhotoUrl) ? r.mainPhotoUrl : real[0]) || null, photos: real.length, state, why, ...price,
        promo: { state: promoState(pl), salePrice: pl.salePrice, promoPrice: pl.promoPrice, startsAt: r.promoStartsAt, endsAt: r.promoEndsAt },
        listing: {
          featured: r.siteListing?.featured ?? false, hidden: r.siteListing?.hidden ?? false,
          title: r.siteListing?.title ?? '', description: r.siteListing?.description ?? '',
          options: Array.isArray(r.siteListing?.options) ? r.siteListing!.options as string[] : [],
          videoUrl: r.siteListing?.videoUrl ?? '', seoTitle: r.siteListing?.seoTitle ?? '', seoDescription: r.siteListing?.seoDescription ?? '',
        },
      }
    })
    const counts = { PUBLICADO: 0, EM_BREVE: 0, HIDDEN: 0 }
    for (const d of data) counts[d.state]++
    return NextResponse.json({ success: true, data: wanted ? data.filter((d) => d.state === wanted) : data, counts })
  } catch (err) {
    return handlePrismaError(err)
  }
}
