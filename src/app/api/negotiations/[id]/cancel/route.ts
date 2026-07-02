// =============================================================================
// POST /api/negotiations/[id]/cancel — Cancelar negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canCancelDeal } from '@/lib/negotiation-permissions'
import { createDealAudit, createStatusHistory, updateVehicleStock } from '@/lib/negotiation-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { cancelCommissionsForDeal } from '@/lib/commission/sync'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations')
    { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: { reason?: string } = {}
  try {
    body = await req.json()
  } catch { /* ignore */ }

  if (!body.reason?.trim()) {
    return NextResponse.json({ error: 'Motivo de cancelamento é obrigatório' }, { status: 400 })
  }

  const deal = await prisma.deal.findFirst({
    where: await buildNegotiationAccessWhere(session.user, { id: params.id }),
    include: { vehicles: { select: { id: true, vehicleId: true, role: true } } },
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  if (!canCancelDeal(session.user.role, deal.status)) {
    return NextResponse.json({ error: 'Sem permissão para cancelar esta negociação no status atual' }, { status: 403 })
  }

  // Vendedor só pode cancelar a própria negociação
  if (session.user.role === 'VENDEDOR') {
    const seller = await prisma.seller.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!seller || deal.sellerId !== seller.id) {
      return NextResponse.json({ error: 'Você só pode cancelar suas próprias negociações' }, { status: 403 })
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.update({
        where: { id: params.id },
        data: {
          status:          'CANCELADA',
          cancelledAt:     new Date(),
          cancelledById:   session.user.id,
          cancelledReason: body.reason,
        },
      })

      // Liberar veículos vendidos/comprados de volta ao estoque
      for (const dv of deal.vehicles) {
        if (dv.vehicleId && (dv.role === 'VENDIDO' || dv.role === 'COMPRADO')) {
          await updateVehicleStock(tx as any, dv.vehicleId, 'DISPONIVEL')
        }
      }

      await createStatusHistory(tx as any, params.id, deal.status, 'CANCELADA', session.user.id, body.reason)

      await createDealAudit(tx as any, {
        dealId:   params.id,
        tenantId: deal.tenantId,
        unitId:   deal.unitId,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'CANCELAR',
        field:    'status',
        oldValue: deal.status,
        newValue: 'CANCELADA',
        reason:   body.reason,
      })

      await tx.auditLog.create({
        data: {
          userId:        session.user.id,
          tenantId:      session.user.tenantId ?? null,
          action:        'CANCEL',
          entity:        'Deal',
          entityId:      params.id,
          userName:      session.user.name,
          userRole:      session.user.role,
          status:        'SUCCESS',
          afterData:     { status: 'CANCELADA' } as never,
          beforeData:    { status: deal.status } as never,
        },
      })

      return d
    })

    let commissionCancelResult: Awaited<ReturnType<typeof cancelCommissionsForDeal>> | null = null
    try {
      commissionCancelResult = await cancelCommissionsForDeal({
        tenantId:     deal.tenantId ?? null,
        dealId:       params.id,
        actorUserId:  session.user.id,
        reason:       body.reason,
      })
    } catch (err) {
      console.error('[cancel] commission cancel failed', {
        tenantId: deal.tenantId,
        dealId: params.id,
        message: err instanceof Error ? err.message : 'Erro desconhecido',
      })
    }

    return NextResponse.json({ data: updated, commissionCancelResult })
  } catch (err) {
    return handlePrismaError(err)
  }
}
