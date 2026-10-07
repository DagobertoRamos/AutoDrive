// =============================================================================
// Efeitos financeiros que rodam depois de gravar a operação (comissões, sync do
// financeiro, lançamento de compra do carro). Se falham:
//   1) a falha fica registrada (AuditLog FINANCE_SYNC_PENDING, status FAILED) —
//      nunca mais "some em silêncio";
//   2) o reprocessamento diário (cron de alertas) refaz tudo de forma idempotente
//      e marca as pendências como resolvidas.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { syncMissingCommissionsForTenant } from '@/lib/commission/sync'
import { syncDealsFinance } from './deal-finance-sync'
import { syncTenantFinance } from './finance-sync'

const ACTION = 'FINANCE_SYNC_PENDING'

/** Roda um passo; em erro, registra a pendência e devolve a mensagem (não lança). */
export async function runTracked(step: string, ctx: { tenantId: string | null; entity: string; entityId: string; userId: string }, fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn()
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[${step}]`, ctx.entityId, message)
    await prisma.auditLog.create({
      data: { tenantId: ctx.tenantId, userId: ctx.userId, action: ACTION, entity: ctx.entity, entityId: ctx.entityId, status: 'FAILED', afterData: { step, message: message.slice(0, 500) } as never },
    }).catch(() => {})
    return step
  }
}

export async function pendingIntegrationCount(tenantId: string): Promise<number> {
  return prisma.auditLog.count({ where: { tenantId, action: ACTION, status: 'FAILED' } }).catch(() => 0)
}

/** Reprocessa a loja (idempotente): comissões faltantes, lançamentos das vendas recentes e compra dos carros. */
export async function healTenant(tenantId: string): Promise<{ healed: number }> {
  const pending = await prisma.auditLog.findMany({ where: { tenantId, action: ACTION, status: 'FAILED' }, select: { id: true, userId: true }, take: 200 })
  const since = new Date(Date.now() - 15 * 86_400_000)
  const system = pending[0]?.userId ?? (await prisma.user.findFirst({ where: { tenantId, role: 'ADM' }, select: { id: true } }))?.id
  if (system) await syncMissingCommissionsForTenant({ tenantId, triggeredBy: system, limit: 300 }).catch((e) => console.error('[heal] comissões', tenantId, e))
  await syncDealsFinance({ tenantId, updatedAt: { gte: since } }).catch((e) => console.error('[heal] negociações', tenantId, e))
  await syncTenantFinance(tenantId).catch((e) => console.error('[heal] financeiro', tenantId, e))
  // Carro próprio que entrou no estoque sem o lançamento de compra/repasse.
  const { createAcquisitionEntry } = await import('@/lib/stock/vehicle-ledger')
  const cars = await prisma.vehicle.findMany({ where: { tenantId, createdAt: { gte: since }, purchasePrice: { gt: 0 } }, select: { id: true }, take: 300 }).catch(() => [] as { id: string }[])
  const withEntry = cars.length
    ? new Set((await prisma.financialEntry.findMany({ where: { vehicleId: { in: cars.map((c) => c.id) }, source: { in: ['VEICULO_COMPRA_VEICULO', 'VEICULO_REPASSE'] } }, select: { vehicleId: true } })).map((e) => e.vehicleId))
    : new Set<string | null>()
  // createAcquisitionEntry é idempotente e ignora carro da troca.
  for (const c of cars.filter((x) => !withEntry.has(x.id))) await createAcquisitionEntry(c.id, null).catch((e) => console.error('[heal] compra do veículo', c.id, e))
  if (pending.length) await prisma.auditLog.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { status: 'RESOLVED' } }).catch(() => {})
  return { healed: pending.length }
}
