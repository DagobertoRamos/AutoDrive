import { prisma } from '@/lib/prisma'
import { generateCommissionsForDeal } from '@/lib/commission-generator'
import { COMMISSION_ELIGIBLE_DEAL_STATUSES } from '@/lib/commission/status'
import { recalculateSellersMainForPeriods } from '@/lib/commission/retroactive'

export interface SyncMissingCommissionsOptions {
  tenantId: string
  triggeredBy: string
  dealId?: string | null
  limit?: number | null
  dryRun?: boolean
}

export interface SyncMissingCommissionsResult {
  tenantId: string
  analyzed: number
  generatedDeals: number
  commissionCreated: number
  skippedExisting: number
  skippedWithoutMatch: number
  errors: Array<{ dealId: string; status: string; message: string }>
}

export async function syncMissingCommissionsForTenant(
  opts: SyncMissingCommissionsOptions,
): Promise<SyncMissingCommissionsResult> {
  const limit = Math.max(1, Math.min(Number(opts.limit ?? 100), 500))
  const deals = await prisma.deal.findMany({
    where: {
      tenantId: opts.tenantId,
      status:   { in: COMMISSION_ELIGIBLE_DEAL_STATUSES },
      ...(opts.dealId ? { id: opts.dealId } : {}),
    },
    orderBy: [{ approvedAt: 'desc' }, { updatedAt: 'desc' }],
    take: limit,
    select: { id: true, status: true },
  })

  const result: SyncMissingCommissionsResult = {
    tenantId: opts.tenantId,
    analyzed: deals.length,
    generatedDeals: 0,
    commissionCreated: 0,
    skippedExisting: 0,
    skippedWithoutMatch: 0,
    errors: [],
  }

  for (const deal of deals) {
    try {
      const existingCount = await prisma.commissionCalculation.count({
        where: {
          tenantId: opts.tenantId,
          ruleDetails: { path: ['dealId'], equals: deal.id } as never,
        },
      }).catch(() => 0)

      if (existingCount > 0) {
        result.skippedExisting++
        continue
      }

      const generated = await generateCommissionsForDeal({
        dealId:      deal.id,
        tenantId:    opts.tenantId,
        triggeredBy: opts.triggeredBy,
        dryRun:      opts.dryRun === true,
      })

      if (generated.created > 0) {
        result.generatedDeals++
        result.commissionCreated += generated.created
      } else {
        result.skippedWithoutMatch++
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      result.errors.push({ dealId: deal.id, status: deal.status, message })
      console.error('[commission sync missing]', {
        tenantId: opts.tenantId,
        dealId: deal.id,
        status: deal.status,
        message,
      })
    }
  }

  if (!opts.dryRun) {
    await prisma.auditLog.create({
      data: {
        tenantId: opts.tenantId,
        userId:   opts.triggeredBy,
        action:   'COMMISSIONS_SYNC_MISSING',
        entity:   opts.dealId ? 'Deal' : 'CommissionCalculation',
        entityId: opts.dealId ?? null,
        status:   result.errors.length ? 'PARTIAL' : 'SUCCESS',
        afterData: result as never,
      },
    }).catch(() => {})
  }

  return result
}

export async function cancelCommissionsForDeal(params: {
  tenantId: string | null
  dealId: string
  actorUserId: string
  reason: string
}): Promise<{ canceled: number; paidPreserved: number; clawbacks: number }> {
  const whereBase = {
    tenantId: params.tenantId,
    ruleDetails: { path: ['dealId'], equals: params.dealId } as never,
  }

  // Captura os (vendedor, período) principais deste deal ANTES de cancelar, para
  // reprecificar o período depois (o vendedor pode cair de faixa — Parte 6).
  const affected = await prisma.commissionCalculation.findMany({
    where: { ...whereBase, sellerId: { not: null }, ruleType: 'VENDA', status: { notIn: ['PAGO', 'CANCELADO'] } },
    select: { sellerId: true, period: true },
  }).catch(() => [] as Array<{ sellerId: string | null; period: string }>)

  const [paidPreserved, update] = await Promise.all([
    prisma.commissionCalculation.count({
      where: {
        ...whereBase,
        status: 'PAGO',
      },
    }).catch(() => 0),
    prisma.commissionCalculation.updateMany({
      where: {
        ...whereBase,
        status: { notIn: ['PAGO', 'CANCELADO'] },
      },
      data: {
        status: 'CANCELADO',
        notes:  `Cancelada automaticamente pela negociação ${params.dealId}. Motivo: ${params.reason}`,
      },
    }).catch(() => ({ count: 0 })),
  ])

  // Reprecifica os períodos afetados: cancelar uma venda pode reduzir a contagem
  // e derrubar a faixa dos carros restantes (Parte 6). Best-effort.
  if (update.count > 0) {
    const pairs = affected
      .filter((a): a is { sellerId: string; period: string } => !!a.sellerId)
      .map((a) => ({ sellerId: a.sellerId, period: a.period }))
    if (pairs.length) await recalculateSellersMainForPeriods(params.tenantId, pairs).catch(() => {})
  }

  if (update.count > 0 || paidPreserved > 0) {
    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId:   params.actorUserId,
        action:   'COMMISSIONS_CANCEL_BY_DEAL',
        entity:   'Deal',
        entityId: params.dealId,
        status:   'SUCCESS',
        afterData: { canceled: update.count, paidPreserved, reason: params.reason } as never,
      },
    }).catch(() => {})
  }

  // Comissão já paga de venda cancelada: lança o desconto (valor negativo) no
  // mês atual — entra na folha como débito do colaborador. Uma vez por comissão.
  const clawbacks = paidPreserved > 0 ? await createClawbacks(params).catch((e) => { console.error('[commission] estorno de comissão', e); return 0 }) : 0

  return { canceled: update.count, paidPreserved, clawbacks }
}

async function createClawbacks(params: { tenantId: string | null; dealId: string; actorUserId: string; reason: string }): Promise<number> {
  const paid = await prisma.commissionCalculation.findMany({
    where: { tenantId: params.tenantId, status: 'PAGO', ruleDetails: { path: ['dealId'], equals: params.dealId } as never },
    select: { id: true, sellerId: true, managerId: true, unitId: true, contractId: true, description: true, commissionValue: true, ruleDetails: true },
  })
  const deal = await prisma.deal.findUnique({ where: { id: params.dealId }, select: { dealNumber: true } })
  const period = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7)
  let n = 0
  for (const c of paid) {
    const value = Number(c.commissionValue)
    if (!(value > 0)) continue
    const exists = await prisma.commissionCalculation.findFirst({ where: { tenantId: params.tenantId, ruleDetails: { path: ['clawbackOf'], equals: c.id } as never, status: { not: 'CANCELADO' } }, select: { id: true } })
    if (exists) continue
    const scope = (c.ruleDetails as { commissionScope?: string } | null)?.commissionScope
    await prisma.commissionCalculation.create({
      data: {
        tenantId: params.tenantId, sellerId: c.sellerId, managerId: c.managerId, unitId: c.unitId, contractId: c.contractId, period,
        ruleType: 'EXCECAO', description: `Estorno de comissão — venda ${deal?.dealNumber ?? params.dealId} cancelada (${c.description})`.slice(0, 250),
        baseValue: 0, commissionValue: -value, status: 'PREVISTO',
        ruleDetails: { clawbackOf: c.id, clawbackDealId: params.dealId, ...(scope ? { commissionScope: scope } : {}) } as never,
        notes: `Venda cancelada: ${params.reason}`.slice(0, 500),
      },
    })
    n++
  }
  if (n) {
    await prisma.auditLog.create({
      data: { tenantId: params.tenantId, userId: params.actorUserId, action: 'COMMISSIONS_CLAWBACK', entity: 'Deal', entityId: params.dealId, status: 'SUCCESS', afterData: { clawbacks: n } as never },
    }).catch(() => {})
  }
  return n
}

/** Negociação cancelada reaberta: desfaz os descontos de comissão ainda não pagos. */
export async function revertClawbacksForDeal(tenantId: string | null, dealId: string): Promise<number> {
  const r = await prisma.commissionCalculation.updateMany({
    where: { tenantId, status: { in: ['PREVISTO', 'APROVADO'] }, ruleDetails: { path: ['clawbackDealId'], equals: dealId } as never },
    data: { status: 'CANCELADO', notes: 'Venda reaberta: desconto de comissão cancelado.' },
  })
  return r.count
}
