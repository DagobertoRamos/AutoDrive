// =============================================================================
// POST /api/negotiations/[id]/finalize — Finalizar negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canFinalizeDeal, FINALIZABLE_STATUSES } from '@/lib/negotiation-permissions'
import { createDealAudit, createStatusHistory, updateVehicleStock, computeDealBalance } from '@/lib/negotiation-service'
import { generateCommissionsForDeal } from '@/lib/commission-generator'
import { canForceFinalize } from '@/lib/negotiation-rbac'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
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

  let body: any = {}
  try { body = await req.json() } catch { /* sem body */ }
  const force = body?.force === true && canForceFinalize({ id: session.user.id, role: session.user.role } as any)

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      vehicles: { select: { id: true, vehicleId: true, role: true } },
      debts:    true,
      services: true,
      payments: true,
      discountRequests: true,
      changes:  true,
    },
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

  // Bloqueio de saldo em aberto
  if (!force) {
    const balance = computeDealBalance({
      vehicleValue:     deal.vehicleValue != null ? Number(deal.vehicleValue) : Number(deal.saleAmount ?? 0),
      debts:            deal.debts,
      services:         deal.services,
      payments:         deal.payments,
      discountRequests: deal.discountRequests,
      changes:          deal.changes,
    })
    if (balance.saldo > 0.009) {
      return NextResponse.json(
        { error: 'Saldo da negociação está em aberto. Não é possível finalizar.', balance },
        { status: 422 },
      )
    }
    // saldo negativo (excedente) precisa ser coberto por troco cadastrado
    if (balance.saldo < -0.009) {
      const excedente = -balance.saldo
      if (balance.totalTroco + 0.009 < excedente) {
        return NextResponse.json(
          { error: 'Existe valor excedente sem troco cadastrado. Cadastre o troco antes de finalizar.', balance },
          { status: 422 },
        )
      }
    }
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

      // ── COMPRA finalizada → veículo entra no estoque em precificação ─────
      // Hoje é o momento em que a loja efetivamente "comprou" o carro do
      // cliente. Marca o Vehicle (criado pela negociação) como
      // EM_PRECIFICACAO + active=false; gerente define preço de venda em
      // /estoque/[id] aba Precificação para publicar no estoque.
      if (deal.type === 'COMPRA') {
        for (const dv of deal.vehicles) {
          if (dv.vehicleId && dv.role === 'COMPRADO') {
            await (tx as any).vehicle.update({
              where: { id: dv.vehicleId },
              data:  {
                stockStatus:        'EM_PRECIFICACAO' as any,
                active:             false,
                isAvailableForSale: false,
                entryDate:          new Date(),
              },
            }).catch((e: unknown) => {
              console.error('[finalize] failed to mark COMPRA vehicle for pricing', e)
            })
          }
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
