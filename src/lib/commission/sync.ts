import { prisma } from '@/lib/prisma'
import { generateCommissionsForDeal } from '@/lib/commission-generator'
import { COMMISSION_ELIGIBLE_DEAL_STATUSES } from '@/lib/commission/status'

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
}): Promise<{ canceled: number; paidPreserved: number }> {
  const whereBase = {
    tenantId: params.tenantId,
    ruleDetails: { path: ['dealId'], equals: params.dealId } as never,
  }

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

  return { canceled: update.count, paidPreserved }
}
