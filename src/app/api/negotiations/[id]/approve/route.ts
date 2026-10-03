// =============================================================================
// POST /api/negotiations/[id]/approve — Aprovar negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { requireModule }        from '@/lib/permissions'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { APPROVABLE_STATUSES }  from '@/lib/negotiation-permissions'
import { notifyDealApproved }   from '@/services/notification.service'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { generateCommissionsForDeal } from '@/lib/commission-generator'
import { syncTenantFinance } from '@/lib/finance/finance-sync'
import { syncDealFinanceSafe } from '@/lib/finance/deal-finance-sync'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { notifyStockChanged } from '@/lib/publications/service'
import { resolveNegotiationGate } from '@/lib/stock/intake'

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations.approve') }
  catch { return NextResponse.json({ error: 'Sem permissão para aprovar' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations.approve'); if (gate) return gate }

  try {
    const body  = await req.json().catch(() => ({}))
    const notes = body?.notes as string | undefined

    const deal = await prisma.deal.findFirst({
      where:   await buildNegotiationAccessWhere(session.user, { id: params.id }),
      include: {
        vehicles: { orderBy: { createdAt: 'asc' } },
        seller:   { select: { fullName: true, shortName: true } },
      },
    })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

    if (!APPROVABLE_STATUSES.has(deal.status)) {
      return NextResponse.json({ error: await alreadyApprovedMessage(params.id, deal.status) }, { status: 409 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Trava de dupla aprovação (dois aparelhos / clique duplo): só aprova quem
      // "pegar" a negociação ainda aguardando; o segundo recebe 409.
      const claimed = await tx.deal.updateMany({
        where: { id: params.id, status: { in: [...APPROVABLE_STATUSES] as never[] } },
        data:  { status: 'APROVADA' as never },
      })
      if (claimed.count === 0) throw new Error('ALREADY_APPROVED')
      const d = await tx.deal.update({
        where: { id: params.id },
        data: {
          status:       'APROVADA',
          approvedById: session.user.id,
          approvedAt:   new Date(),
          approvalNotes: notes ?? null,
          // legado
          releasedAt:       new Date(),
          releasedByUserId: session.user.id,
        } as object,
      })
      // Sem gerente responsável (loja sem gerente cadastrado p/ o vendedor): quem aprovou assume.
      await tx.deal.updateMany({ where: { id: params.id, managerId: null }, data: { managerId: session.user.id } })
      await tx.dealStatusHistory.create({
        data: {
          dealId:          params.id,
          previousStatus:  deal.status,
          newStatus:       'APROVADA',
          changedByUserId: session.user.id,
          reason:          notes ?? `Aprovado por ${session.user.name}`,
        },
      })
      await tx.auditLog.create({
        data: {
          userId:   session.user.id,
          tenantId: session.user.tenantId ?? null,
          action:   'APPROVE',
          entity:   'Deal',
          entityId: params.id,
          userName: session.user.name,
          userRole: session.user.role,
          status:   'SUCCESS',
          afterData: { status: 'APROVADA', notes } as never,
        },
      })

      // ── Bloqueia veículo(s) vendidos no estoque ──────────────────────────
      // Aprovação tira o veículo da lista de disponíveis IMEDIATAMENTE
      // (sem aguardar finalize). Status RESERVADO indica "reservado pra venda
      // já aprovada" — fica fora da busca de novas vendas mas histórico OK.
      // Só o carro que SAI (VENDIDO). CONSIGNADO/COMPRADO/TROCA são carros que
      // ENTRAM na loja — reservá-los travava a esteira e as publicações.
      for (const dv of deal.vehicles) {
        if (dv.vehicleId && dv.role === 'VENDIDO') {
          await tx.vehicle.update({
            where: { id: dv.vehicleId },
            data:  {
              stockStatus:        'RESERVADO' as never,
              isAvailableForSale: false,
            },
          }).catch((e: unknown) => console.error('[approve] vehicle lock failed', e))

          await tx.auditLog.create({
            data: {
              userId:   session.user.id,
              tenantId: session.user.tenantId ?? null,
              action:   'VEHICLE_BLOCKED_BY_APPROVED_SALE',
              entity:   'Vehicle',
              entityId: dv.vehicleId,
              userName: session.user.name,
              userRole: session.user.role,
              status:   'SUCCESS',
              afterData: { stockStatus: 'RESERVADO', dealId: params.id, dealNumber: deal.dealNumber } as never,
            },
          }).catch(() => {})
        }
      }

      return d
    })

    // Central de Publicações: venda aprovada → pausa os anúncios do veículo.
    notifyStockChanged(deal.tenantId, deal.vehicles.map((dv) => (dv.role === 'VENDIDO' ? dv.vehicleId : null)), { id: session.user.id, name: session.user.name ?? null })

    // Esteira de entrada: carro que ENTROU nesta negociação (troca/compra/
    // consignação) tem o portão "Negociação de entrada" resolvido.
    await resolveNegotiationGate(deal.id, { id: session.user.id, name: session.user.name ?? null, role: session.user.role })
      .catch((e) => console.error('[esteira] portão de negociação', e))

    // ── Notificação sistêmica (broadcast tenant) — best-effort, não bloqueia ──
    try {
      const v = deal.vehicles?.[0]
      const vehicleLabel = [v?.brand, v?.model, v?.year ? `(${v.year})` : null, v?.plate ? `· placa ${v.plate}` : null]
        .filter(Boolean).join(' ').trim() || 'veículo'
      await notifyDealApproved({
        dealId:       params.id,
        dealNumber:   deal.dealNumber,
        dealType:     deal.type,
        tenantId:     deal.tenantId,
        vehicleLabel,
        approverName: session.user.name ?? 'Gerente',
        sellerName:   deal.seller?.shortName ?? deal.seller?.fullName ?? deal.sellerNameFromSheet ?? 'vendedor',
      })
    } catch (e) {
      console.error('[approve] notifyDealApproved failed:', e instanceof Error ? e.message : e)
    }

    let commissionResult: Awaited<ReturnType<typeof generateCommissionsForDeal>> | null = null
    try {
      commissionResult = await generateCommissionsForDeal({
        dealId:      params.id,
        tenantId:    deal.tenantId ?? null,
        triggeredBy: session.user.id,
      })
    } catch (err) {
      console.error('[approve] commission generation failed', err)
    }

    // Financeiro acompanha a aprovação: pagamentos/débitos/troca da negociação e
    // as comissões recém-geradas viram lançamentos.
    await syncDealFinanceSafe(params.id)
    await syncTenantFinance(deal.tenantId ?? null).catch((e) => console.error('[approve] financeiro', e))

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
    if (err instanceof Error && err.message === 'ALREADY_APPROVED') {
      return NextResponse.json({ error: await alreadyApprovedMessage(params.id, 'APROVADA') }, { status: 409 })
    }
    return handlePrismaError(err)
  }
}

/** "Esta negociação já foi aprovada por Fulano em 27/09 14:32" — para quem tentar aprovar de novo. */
async function alreadyApprovedMessage(dealId: string, status: string): Promise<string> {
  if (status !== 'APROVADA') return 'Apenas negociações aguardando aprovação podem ser aprovadas.'
  const d = await prisma.deal.findUnique({ where: { id: dealId }, select: { dealNumber: true, approvedAt: true, approvedById: true } as never }) as { dealNumber: string | null; approvedAt: Date | null; approvedById: string | null } | null
  const who = d?.approvedById ? await prisma.user.findUnique({ where: { id: d.approvedById }, select: { name: true } }) : null
  const when = d?.approvedAt ? ` em ${d.approvedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}` : ''
  return `A negociação ${d?.dealNumber ?? ''} já foi aprovada${who?.name ? ` por ${who.name}` : ''}${when}. Não é possível aprovar duas vezes.`.replace('  ', ' ')
}
