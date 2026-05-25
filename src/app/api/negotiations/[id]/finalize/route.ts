// =============================================================================
// POST /api/negotiations/[id]/finalize — Finalizar negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canFinalizeDeal, FINALIZABLE_STATUSES } from '@/lib/negotiation-permissions'
import { createDealAudit, createStatusHistory, updateVehicleStock } from '@/lib/negotiation-service'
import { generateCommissionsForDeal } from '@/lib/commission-generator'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations.manage')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  if (!canFinalizeDeal(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão para finalizar negociações' }, { status: 403 })
  }

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: { vehicles: { select: { id: true, vehicleId: true, role: true } } },
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  if (!FINALIZABLE_STATUSES.has(deal.status)) {
    return NextResponse.json(
      { error: `Apenas negociações nos status ${Array.from(FINALIZABLE_STATUSES).join(', ')} podem ser finalizadas` },
      { status: 409 },
    )
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.deal.update({
        where: { id: params.id },
        data: {
          status:      'FINALIZADA',
          finalizedAt: new Date(),
        },
      })

      // Marcar veículo vendido como VENDIDO no estoque
      for (const dv of deal.vehicles) {
        if (dv.vehicleId && dv.role === 'VENDIDO') {
          await updateVehicleStock(tx as any, dv.vehicleId, 'VENDIDO')
        }
      }

      await createStatusHistory(tx as any, params.id, deal.status, 'FINALIZADA', session.user.id, `Finalizado por ${session.user.name}`)

      await createDealAudit(tx as any, {
        dealId:   params.id,
        tenantId: deal.tenantId,
        unitId:   deal.unitId,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'FINALIZAR',
        field:    'status',
        oldValue: deal.status,
        newValue: 'FINALIZADA',
      })

      await tx.auditLog.create({
        data: {
          userId:        session.user.id,
          tenantId:      session.user.tenantId ?? null,
          action:        'FINALIZE',
          entity:        'Deal',
          entityId:      params.id,
          userName:      session.user.name,
          userRole:      session.user.role,
          status:        'SUCCESS',
          afterData:     { status: 'FINALIZADA' } as never,
          beforeData:    { status: deal.status } as never,
        },
      })

      return d
    })

    // Gera comissões automaticamente (não bloqueia o close em caso de falha)
    let commissionResult: Awaited<ReturnType<typeof generateCommissionsForDeal>> | null = null
    try {
      commissionResult = await generateCommissionsForDeal({
        dealId:      params.id,
        tenantId:    deal.tenantId ?? null,
        triggeredBy: session.user.id,
      })
    } catch (err) {
      console.error('[finalize] commission generation failed', err)
    }

    return NextResponse.json({
      data: updated,
      commissionResult: commissionResult
        ? {
            created:   commissionResult.created,
            matched:   commissionResult.matched,
            unmatched: commissionResult.unmatched,
          }
        : null,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
