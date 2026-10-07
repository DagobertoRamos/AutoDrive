// =============================================================================
// POST /api/negotiations/[id]/cancel — Cancelar negociação
//   body: { reason, returnEntering? }
//   • Carro vendido volta ao estoque (Disponível) e aos anúncios: site e portais
//     em que estava (pausados pela venda ou arquivados como Vendido).
//   • Carro de entrada (troca/compra/consignação): returnEntering=true → devolvido
//     ao proprietário (sai do estoque e dos anúncios); senão volta a pedir a
//     negociação de entrada na esteira.
//   • Dinheiro: o que já entrou continua na conta (RECEBIDO); o que estava
//     previsto é cancelado. O estorno é marcado depois (deal-refunds).
//   • Finalizada: só ADM/MASTER cancelam (desfaz a venda).
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canCancelDeal, canReopenDeal } from '@/lib/negotiation-permissions'
import { createDealAudit, createStatusHistory } from '@/lib/negotiation-service'
import { OPEN_DEAL_STATUSES, releaseStock } from '@/lib/negotiation/deal-children'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { cancelCommissionsForDeal } from '@/lib/commission/sync'
import { reopenNegotiationGate } from '@/lib/stock/intake'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { notifySaleCancelled, notifyStockChanged } from '@/lib/publications/service'
import { syncDealFinanceSafe } from '@/lib/finance/deal-finance-sync'
import { syncTenantFinance } from '@/lib/finance/finance-sync'
import { notifyDealCancelled } from '@/services/notification.service'
import { publishOpsEvent } from '@/lib/automotive/events'

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

  let body: { reason?: string; returnEntering?: boolean } = {}
  try {
    body = await req.json()
  } catch { /* ignore */ }

  if (!body.reason?.trim()) {
    return NextResponse.json({ error: 'Motivo de cancelamento é obrigatório' }, { status: 400 })
  }

  const deal = await prisma.deal.findFirst({
    where: await buildNegotiationAccessWhere(session.user, { id: params.id }),
    include: {
      vehicles: { select: { id: true, vehicleId: true, role: true, brand: true, model: true, year: true, plate: true } },
      seller:   { select: { shortName: true, fullName: true } },
    },
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  if (deal.status === 'CANCELADA') return NextResponse.json({ error: 'Negociação já está cancelada.' }, { status: 409 })
  // Finalizada: desfazer a venda é decisão da administração.
  if (deal.status === 'FINALIZADA' && !canReopenDeal(session.user.role)) {
    return NextResponse.json({ error: 'Negociação finalizada: só ADM/MASTER podem cancelar.' }, { status: 403 })
  }

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

  const returnEntering = body.returnEntering === true
  const returned: string[] = []
  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Trava: só cancela se o status ainda é o validado (dois cliques/abas não
      // devolvem estoque nem estornam comissão duas vezes).
      const locked = await tx.deal.updateMany({
        where: { id: params.id, status: deal.status },
        data: {
          status:          'CANCELADA',
          cancelledAt:     new Date(),
          cancelledById:   session.user.id,
          cancelledReason: body.reason,
        },
      })
      if (locked.count !== 1) throw new Error('DEAL_STATUS_CHANGED')
      const d = await tx.deal.findUniqueOrThrow({ where: { id: params.id } })

      // Devolve ao estoque o carro que esta venda segurava (em negociação/reservado
      // ou já vendido, se finalizada) e que nenhuma outra venda segura.
      for (const dv of deal.vehicles) {
        if (!dv.vehicleId) continue
        if (dv.role === 'VENDIDO') {
          if (await releaseStock(tx, dv.vehicleId, params.id)) continue
          const other = await tx.dealVehicle.findFirst({
            where: { vehicleId: dv.vehicleId, role: 'VENDIDO', deal: { id: { not: params.id }, status: { in: [...OPEN_DEAL_STATUSES, 'FINALIZADA'] as never[] } } },
            select: { id: true },
          })
          if (!other) {
            await tx.vehicle.updateMany({
              where: { id: dv.vehicleId, stockStatus: 'VENDIDO' as never },
              data:  { stockStatus: 'DISPONIVEL' as never, active: true, isAvailableForSale: true, exitDate: null },
            })
          }
        } else if (returnEntering && ['TROCA', 'COMPRADO', 'CONSIGNADO'].includes(dv.role)) {
          // Carro de entrada devolvido ao proprietário — se ainda não foi vendido
          // e nenhuma outra negociação ativa o trouxe.
          const other = await tx.dealVehicle.findFirst({
            where: { vehicleId: dv.vehicleId, role: { in: ['TROCA', 'COMPRADO', 'CONSIGNADO'] }, deal: { id: { not: params.id }, status: { notIn: ['CANCELADA', 'RECUSADA', 'DESAPROVADA'] as never[] } } },
            select: { id: true },
          })
          if (other) continue
          const r = await tx.vehicle.updateMany({
            where: { id: dv.vehicleId, stockStatus: { notIn: ['VENDIDO', 'RESERVADO', 'EM_NEGOCIACAO'] as never[] } },
            data:  { stockStatus: 'DEVOLVIDO' as never, active: false, isAvailableForSale: false, exitDate: new Date() },
          })
          if (r.count) returned.push(dv.vehicleId)
          // Compra/repasse ainda não pago ao proprietário: não é mais devido.
          await tx.financialEntry.updateMany({
            where: { vehicleId: dv.vehicleId, status: 'PREVISTO', source: { in: ['VEICULO_COMPRA_VEICULO', 'VEICULO_REPASSE'] } },
            data:  { status: 'CANCELADO', notes: `Cancelado com a negociação ${deal.dealNumber ?? params.id}.` },
          })
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

    // Central de Publicações: venda cancelada → o carro volta ao site e aos portais;
    // carro de entrada devolvido → sai dos anúncios.
    const actor = { id: session.user.id, name: session.user.name ?? null }
    notifySaleCancelled(deal.tenantId, deal.vehicles.map((dv) => (dv.role === 'VENDIDO' ? dv.vehicleId : null)), actor)
    notifyStockChanged(deal.tenantId, returned, actor)
    // Operações veiculares: marca canceladas; o que já foi feito fora (NF-e, RENAVE)
    // vira pendência de cancelamento — nunca é apagado.
    await publishOpsEvent('deal.cancelled', `${params.id}:${updated.cancelledAt?.toISOString() ?? Date.now()}`, { dealId: params.id, actor: { id: session.user.id, name: session.user.name ?? null, role: session.user.role } }, deal.tenantId ?? null)

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

    // Esteira de entrada: carro que entraria por esta negociação (e não foi devolvido)
    // volta a pedir a negociação de entrada.
    if (!returnEntering) await reopenNegotiationGate(params.id, { id: session.user.id, name: session.user.name ?? null, role: session.user.role })
      .catch((e) => console.error('[esteira] reabrir portão de negociação', e))

    // Mesmo aviso da venda aprovada, para todos da loja.
    try {
      const v = deal.vehicles.find((x) => x.role === 'VENDIDO') ?? deal.vehicles[0]
      const vehicleLabel = [v?.brand, v?.model, v?.year ? `(${v.year})` : null, v?.plate ? `· placa ${v.plate}` : null]
        .filter(Boolean).join(' ').trim() || 'veículo'
      await notifyDealCancelled({
        dealId: params.id, dealNumber: deal.dealNumber, dealType: deal.type, tenantId: deal.tenantId, vehicleLabel,
        approverName: session.user.name ?? 'Gerente',
        sellerName:   deal.seller?.shortName ?? deal.seller?.fullName ?? deal.sellerNameFromSheet ?? 'vendedor',
        reason:       body.reason!.trim(),
      })
    } catch (e) {
      console.error('[cancel] notifyDealCancelled', e instanceof Error ? e.message : e)
    }

    await syncDealFinanceSafe(params.id)
    // Comissões canceladas → lançamentos previstos delas cancelados no Financeiro.
    await syncTenantFinance(deal.tenantId ?? null).catch((e) => console.error('[cancel] financeiro', e))
    return NextResponse.json({ data: updated, commissionCancelResult })
  } catch (err) {
    if (err instanceof Error && err.message === 'DEAL_STATUS_CHANGED') return NextResponse.json({ error: 'A negociação mudou enquanto cancelava. Atualize a tela.' }, { status: 409 })
    return handlePrismaError(err)
  }
}
