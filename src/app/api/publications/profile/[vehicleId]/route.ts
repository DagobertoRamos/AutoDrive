// =============================================================================
// /api/publications/profile/[vehicleId] — ficha do anúncio em Publicações:
// origem do carro (próprio / loja parceira / particular → tag do site) e
// opcionais (SiteListing.options, lidos pelo site, catálogo e portais).
//   GET  → { originType, partnerStoreId, options, suggested, partners }
//   PUT  { originType, partnerStoreId?, options[] }
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { audit, bad, pubAuth } from '@/lib/publications/api'
import { effectiveOrigin, stockTypeForOrigin, validateOriginInput } from '@/lib/stock/origin-core'
import { cleanOptions, inferOptions } from '@/lib/stock/options-catalog'
import { parseOpcionais } from '@/lib/evaluation/rules'
import { notifyStockChanged } from '@/lib/publications/service'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ vehicleId: string }> }

export async function GET(req: Request, ctx: Ctx) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  try {
    const { vehicleId } = await ctx.params
    const v = await prisma.vehicle.findFirst({
      where:  { id: vehicleId, tenantId: a.tenantId },
      select: { id: true, originType: true, partnerStoreId: true, stockType: true, originEvaluationId: true, version: true, notes: true, siteListing: { select: { options: true, description: true } } },
    })
    if (!v) return bad('Veículo não encontrado nesta loja.', 404)
    const evalRow = v.originEvaluationId
      ? await prisma.vehicleEvaluation.findUnique({ where: { id: v.originEvaluationId }, select: { evaluationNotes: true } })
      : null
    const partners = await prisma.partnerStore.findMany({
      where: { tenantId: a.tenantId, OR: [{ active: true }, ...(v.partnerStoreId ? [{ id: v.partnerStoreId }] : [])] },
      orderBy: { name: 'asc' }, select: { id: true, name: true, city: true, active: true },
    })
    // Sem opcionais marcados: já vêm do cadastro (avaliação + o que está escrito
    // na versão/descrição/observações). A loja confere e ajusta.
    const saved = cleanOptions(v.siteListing?.options ?? [])
    const fromRecord = saved.length ? [] : cleanOptions([...parseOpcionais(evalRow?.evaluationNotes), ...inferOptions([v.version, v.siteListing?.description, v.notes, evalRow?.evaluationNotes])])
    return NextResponse.json({
      success: true,
      data: {
        originType:     effectiveOrigin(v),
        originDefined:  !!v.originType,
        partnerStoreId: v.partnerStoreId,
        options:        saved.length ? saved : fromRecord,
        prefilled:      !saved.length && fromRecord.length > 0,
        suggested:      cleanOptions(parseOpcionais(evalRow?.evaluationNotes)),
        partners,
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  try {
    const { vehicleId } = await ctx.params
    const body = await req.json().catch(() => ({})) as { originType?: unknown; partnerStoreId?: unknown; options?: unknown }
    const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId: a.tenantId }, select: { id: true, originType: true, partnerStoreId: true, stockType: true } })
    if (!v) return bad('Veículo não encontrado nesta loja.', 404)

    const origin = validateOriginInput(body)
    if (!origin.ok) return bad(origin.error)
    if (origin.partnerStoreId) {
      const ok = await prisma.partnerStore.findFirst({ where: { id: origin.partnerStoreId, tenantId: a.tenantId }, select: { id: true } })
      if (!ok) return bad('Loja parceira não encontrada.')
    }
    const options = cleanOptions(body.options)

    await prisma.$transaction([
      prisma.vehicle.update({
        where: { id: v.id },
        data:  { originType: origin.originType, partnerStoreId: origin.partnerStoreId, stockType: stockTypeForOrigin(origin.originType) },
      }),
      prisma.siteListing.upsert({
        where:  { vehicleId: v.id },
        create: { tenantId: a.tenantId, vehicleId: v.id, options },
        update: { options },
      }),
    ])
    audit(a, 'LISTING_PROFILE_UPDATED', 'Vehicle', v.id, { originType: origin.originType, partnerStoreId: origin.partnerStoreId, options: options.length }, { originType: v.originType, partnerStoreId: v.partnerStoreId })
    // Anúncios publicados acompanham a ficha (tag/opcionais).
    notifyStockChanged(a.tenantId, [v.id], a.actor)
    return NextResponse.json({ success: true, data: { originType: origin.originType, partnerStoreId: origin.partnerStoreId, options } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
