// =============================================================================
// POST /api/evaluations/[id]/release
//
// Gerente+ precifica e libera o resultado da avaliação ao vendedor.
// Aceita body opcional com:
//   - evaluatedValue, desiredValue, minimumValue, suggestedSalePrice (R$)
//   - evaluatorFeedback (texto)
//   - availableFor (CSV/array — COMPRA/TROCA/CONSIGNACAO)
//   - proposalValidUntil (Date)
//
// Define status='LIBERADA' + releasedAt + releasedByUserId.
// Cria (ou atualiza) Vehicle no estoque com:
//   • stockStatus = EM_PRECIFICACAO (gerente liberou, aguardando compra/aceite)
//   • active = true (visível na listagem)
//   • isAvailableForSale = false (não vai pra prateleira de venda ainda)
//   • salePrice = suggestedSalePrice
// Quando uma COMPRA referenciando essa avaliação for finalizada, o vehicle
// muda pra DISPONIVEL via updateVehicleStock no /finalize.
//
// Notifica o vendedor (approvalRequestedById ou evaluatedById) via
// in-app/email/whatsapp.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { loadEvaluationContext } from '@/lib/evaluation/service'
import { canApproveServices }   from '@/lib/evaluation/permissions'
import { recordHistory }        from '@/lib/evaluation/history'
import { notify }               from '@/services/notification.service'

function safeNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    const ctx = await loadEvaluationContext(params.id)
    if (!ctx) return NextResponse.json({ error: 'Avaliação não encontrada' }, { status: 404 })

    const user = { id: session.user.id, role: session.user.role, tenantId: session.user.tenantId }
    if (!canApproveServices(user)) {
      return NextResponse.json({ error: 'Apenas gerência pode liberar o resultado.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {
      status: 'LIBERADA',
      releasedAt:       new Date(),
      releasedByUserId: session.user.id,
    }
    const evaluatedValue   = safeNumber(body?.evaluatedValue)
    const desiredValue     = safeNumber(body?.desiredValue)
    const minimumValue     = safeNumber(body?.minimumValue)
    const suggestedPrice   = safeNumber(body?.suggestedSalePrice)
    if (evaluatedValue   != null) data.evaluatedValue   = evaluatedValue
    if (desiredValue     != null) data.desiredValue     = desiredValue
    if (minimumValue     != null) data.minimumValue     = minimumValue
    if (suggestedPrice   != null) data.suggestedSalePrice = suggestedPrice
    if (typeof body?.evaluatorFeedback === 'string') data.evaluatorFeedback = body.evaluatorFeedback

    // availableFor: gerente+ define em quais operações o veículo poderá entrar.
    // Aceita array (['COMPRA','TROCA']) ou CSV ('COMPRA,TROCA'). Default null =
    // todas (compat com avaliações antigas).
    if (body?.availableFor) {
      const raw = Array.isArray(body.availableFor)
        ? body.availableFor
        : String(body.availableFor).split(',')
      const filtered = raw
        .map((s: unknown) => String(s).trim().toUpperCase())
        .filter((s: string) => ['COMPRA', 'TROCA', 'CONSIGNACAO'].includes(s))
      if (filtered.length > 0) data.availableFor = filtered.join(',')
    }

    // Validade da proposta (opcional). Aceita ISO ou Date.
    if (body?.proposalValidUntil) {
      const d = new Date(body.proposalValidUntil)
      if (!Number.isNaN(d.getTime())) data.proposalValidUntil = d
    }

    const updated = await prisma.vehicleEvaluation.update({
      where: { id: params.id },
      data,
    })

    // ── Cria / atualiza Vehicle no estoque (status EM_PRECIFICACAO) ──────────
    // Idempotente: se já existe vehicleId, só atualiza dados+preço.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ev: any = await prisma.vehicleEvaluation.findUnique({
        where:  { id: params.id },
        select: {
          id: true, vehicleId: true, tenantId: true, unitId: true,
          plate: true, brand: true, model: true, version: true,
          modelYear: true, manufactureYear: true, color: true, km: true,
          fuel: true, transmission: true, chassi: true, renavam: true,
          vehicleType: true, conditionType: true,
          evaluatedValue: true, suggestedSalePrice: true, fipeValue: true, fipeCode: true,
        },
      })

      // Payload SEM tenantId/unitId direto (Prisma exige connect na relação)
      const baseData = {
        plate:              ev.plate?.toUpperCase() ?? null,
        brand:              ev.brand ?? null,
        model:              ev.model ?? null,
        version:            ev.version ?? null,
        modelYear:          ev.modelYear ?? null,
        year:               ev.manufactureYear ?? ev.modelYear ?? null,
        color:              ev.color ?? null,
        km:                 ev.km ?? null,
        fuel:               ev.fuel ?? null,
        transmission:       ev.transmission ?? null,
        chassi:             ev.chassi ?? null,
        renavam:            ev.renavam ?? null,
        vehicleType:        ev.vehicleType ?? null,
        conditionType:      ev.conditionType ?? null,
        fipeCode:           ev.fipeCode ?? null,
        fipeValue:          ev.fipeValue ?? null,
        purchasePrice:      ev.evaluatedValue ?? null,
        salePrice:          ev.suggestedSalePrice ?? ev.evaluatedValue ?? null,
        stockStatus:        'EM_PRECIFICACAO' as never,
        active:             true,
        isAvailableForSale: false,
        entryDate:          new Date(),
        pricedById:         session.user.id,
        pricedAt:           new Date(),
      } as never

      let vehicleId = ev.vehicleId
      if (vehicleId) {
        await prisma.vehicle.update({ where: { id: vehicleId }, data: baseData })
      } else {
        // Tenta achar por placa+tenant (evita duplicação)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing: any = ev.plate
          ? await prisma.vehicle.findFirst({
              where:  { tenantId: ev.tenantId ?? undefined, plate: ev.plate.toUpperCase() },
              select: { id: true },
            })
          : null
        if (existing) {
          await prisma.vehicle.update({ where: { id: existing.id }, data: baseData })
          vehicleId = existing.id
        } else {
          // Connect explícito pra tenant/unit (Prisma 6 não aceita FK direto em create)
          const createData = {
            ...(baseData as object),
            ...(ev.tenantId ? { tenant: { connect: { id: ev.tenantId } } } : {}),
            ...(ev.unitId   ? { unit:   { connect: { id: ev.unitId } } }   : {}),
          } as never
          const created = await prisma.vehicle.create({ data: createData })
          vehicleId = created.id
        }
        await prisma.vehicleEvaluation.update({
          where: { id: params.id },
          data:  { vehicleId },
        })
      }
    } catch (e) {
      console.error('[release] failed to upsert Vehicle in stock:', e instanceof Error ? e.message : e)
      // Não bloqueia o release — avaliação fica LIBERADA mesmo se o estoque falhar.
    }

    await recordHistory({
      tenantId: ctx.tenantId ?? '',
      evaluationId: params.id,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: 'RELEASE',
      oldValue: { status: ctx.status },
      newValue: { status: 'LIBERADA', evaluatedValue, desiredValue, minimumValue, suggestedSalePrice: suggestedPrice },
    }).catch(() => {})

    // ── Notifica vendedor (in-app obrigatório; email/whatsapp best-effort) ─
    try {
      const ev = await prisma.vehicleEvaluation.findUnique({
        where: { id: params.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        select: { plate: true, brand: true, model: true, evaluatedById: true, approvalRequestedById: true } as any,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sellerId: string | null = (ev as any)?.approvalRequestedById ?? ev?.evaluatedById ?? null
      if (sellerId) {
        const desc = [ev?.plate, ev?.brand, ev?.model].filter(Boolean).join(' • ') || 'Avaliação'
        await notify({
          userId:   sellerId,
          tenantId: ctx.tenantId ?? null,
          type:     'NEGOCIACAO_LIBERADA',
          title:    'Avaliação liberada pelo gerente',
          message:  `${desc} foi precificada e liberada. Confira os valores.`,
          actionUrl: `/estoque/avaliacao/${params.id}/inspecao`,
          metadata:  { evaluationId: params.id },
          channels:  ['APP_WEB', 'APP_MOBILE', 'PUSH', 'EMAIL', 'WHATSAPP'],
        })
      }
    } catch (e) {
      console.error('[release] notify seller failed', e)
    }

    return NextResponse.json({ data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
