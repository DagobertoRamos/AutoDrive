// =============================================================================
// Processamento assíncrono das operações (cron /api/internal/ops/run):
//   1) eventos internos pendentes (outbox);
//   2) chamadas externas sem resposta final — CONSULTA o provedor (nunca
//      reenvia às cegas);
//   3) indicadores e reconciliação estoque × RENAVE × fiscal;
//   4) alertas — poucos e úteis, um por assunto por dia.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { notifyMany } from '@/services/notification.service'
import { opsContext } from './config'
import { nextCheckDelayMs } from './external-core'
import { fiscalProvider, renaveProvider, transferProvider } from './gateways/registry'
import { processPendingOpsEvents } from './events'
import { providerContext } from './connections'
import { refreshPendingFiscal } from './fiscal-emission'
import { pollVehicleQueries } from './vehicle-data'
import { applyToOperation, recordEvent, SYSTEM_ACTOR } from './operations'
import { syncConsignmentPayouts } from './vehicle-registry'
import { fiscalEntryState, renaveStockState } from './orchestrator-core'
import { classify, isInInternalStock, stockIndicators, type ReconcileIssue, type ReconcileRow } from './reconcile-core'

const SALE_GRACE_MS = 7 * 86_400_000

/** Linhas de reconciliação da loja (uma consulta por tabela). */
export async function reconcileRows(tenantId: string): Promise<(ReconcileRow & { plate: string | null; brand: string | null; model: string | null })[]> {
  const vehicles = await prisma.vehicle.findMany({
    where: { tenantId, OR: [{ stockStatus: { notIn: ['VENDIDO', 'CANCELADO', 'DEVOLVIDO'] as never[] } }, { exitDate: { gte: new Date(Date.now() - 90 * 86_400_000) } }, { updatedAt: { gte: new Date(Date.now() - 90 * 86_400_000) } }] },
    select: { id: true, stockStatus: true, plate: true, brand: true, model: true, exitDate: true, updatedAt: true },
  })
  const ops = vehicles.length ? await prisma.vehicleOperation.findMany({ where: { tenantId, vehicleId: { in: vehicles.map((v) => v.id) } }, select: { vehicleId: true, kind: true, renaveStatus: true, fiscalStatus: true, createdAt: true, cancelledAt: true, commercialStatus: true, updatedAt: true } }) : []
  const byVehicle = new Map<string, typeof ops>()
  for (const o of ops) byVehicle.set(o.vehicleId, [...(byVehicle.get(o.vehicleId) ?? []), o])
  return vehicles.map((v) => {
    const list = byVehicle.get(v.id) ?? []
    const lastSale = list.filter((o) => o.kind === 'SALE' && o.commercialStatus === 'SOLD').sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
    const soldAt = v.exitDate ?? lastSale?.updatedAt ?? v.updatedAt
    return {
      vehicleId: v.id, stockStatus: v.stockStatus as string | null, plate: v.plate, brand: v.brand, model: v.model,
      renave: renaveStockState(list), fiscalEntry: fiscalEntryState(list),
      soldWithinGrace: Date.now() - soldAt.getTime() < SALE_GRACE_MS,
    }
  })
}

export async function stockSummary(tenantId: string) {
  const { cfg } = await opsContext(tenantId)
  const opts = { renaveTracked: cfg.tracking.renave, fiscalTracked: cfg.tracking.fiscalPurchase }
  const rows = await reconcileRows(tenantId)
  const indicators = stockIndicators(rows, opts)
  const issues = rows.map((r) => ({ ...r, issues: classify(r, opts) })).filter((r) => r.issues.length)
  return { indicators, issues, tracking: opts }
}

/** Consulta o provedor das chamadas sem resposta final (UNKNOWN/SUBMITTED/PROCESSING). */
export async function pollExternalOperations(limit = 50): Promise<number> {
  // Notas fiscais têm a própria rotina (refreshPendingFiscal), que também baixa e confere o XML.
  const due = await prisma.externalOperation.findMany({ where: { state: { in: ['SUBMITTED', 'PROCESSING', 'UNKNOWN'] }, domain: { not: 'FISCAL' }, nextCheckAt: { lte: new Date() } }, orderBy: { nextCheckAt: 'asc' }, take: limit })
  let changed = 0
  for (const e of due) {
    const op = e.operationId ? await prisma.vehicleOperation.findUnique({ where: { id: e.operationId }, select: { unitId: true } }) : null
    const { ctx } = await providerContext(e.tenantId, e.domain as 'RENAVE' | 'TRANSFER', op?.unitId ?? null, e.providerId)
    let r = null
    try {
      if (e.externalId) {
        r = e.domain === 'RENAVE' ? await renaveProvider(e.providerId).getStatus(ctx, e.externalId)
          : e.domain === 'FISCAL' ? await fiscalProvider(e.providerId).status(ctx, e.externalId)
          : e.domain === 'TRANSFER' ? await transferProvider(e.providerId).getStatus(ctx, e.externalId)
          : null
      }
    } catch { r = null }
    if (!r || r.state === e.state) {
      await prisma.externalOperation.update({ where: { id: e.id }, data: { attempts: { increment: 1 }, lastCheckedAt: new Date(), nextCheckAt: new Date(Date.now() + nextCheckDelayMs(e.attempts + 1)) } })
      continue
    }
    await prisma.externalOperation.update({ where: { id: e.id }, data: { state: r.state, protocol: r.protocol ?? undefined, lastCheckedAt: new Date(), nextCheckAt: null, confirmedAt: r.state === 'CONFIRMED' ? new Date() : undefined, errorCode: r.errorCode ?? null, errorDetail: r.errorMessage ?? null } })
    changed++
    if (e.operationId && e.domain === 'RENAVE') {
      const op = await prisma.vehicleOperation.findUnique({ where: { id: e.operationId }, select: { id: true, kind: true } })
      if (op) {
        const sale = op.kind === 'SALE'
        const renaveStatus = r.state === 'CONFIRMED' ? (sale ? 'EXIT_CONFIRMED' : 'ENTRY_CONFIRMED') : r.state === 'REJECTED' ? 'REJECTED' : undefined
        if (renaveStatus) await applyToOperation(op.id, { renaveStatus }, { actor: SYSTEM_ACTOR, origin: 'JOB', providerId: e.providerId, externalOperationId: e.id, title: renaveStatus === 'REJECTED' ? 'O RENAVE recusou o registro.' : `${sale ? 'Saída' : 'Entrada'} confirmada no RENAVE.` })
      }
    }
  }
  return changed
}

const ALERT_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE'] as const

/** Envia um alerta no máximo uma vez por dia por assunto (outbox serve de registro). */
async function alertOnce(tenantId: string, key: string, title: string, message: string, actionUrl: string) {
  const day = new Date().toISOString().slice(0, 10)
  const dedupKey = `alert:${tenantId}:${key}:${day}`
  const r = await prisma.opsOutbox.createMany({ data: [{ tenantId, type: 'alert.sent', dedupKey, payload: { title }, status: 'DONE', processedAt: new Date() }], skipDuplicates: true })
  if (!r.count) return
  const users = await prisma.user.findMany({ where: { tenantId, status: 'ATIVO', role: { in: [...ALERT_ROLES] } }, select: { id: true } })
  if (users.length) await notifyMany({ userIds: users.map((u) => u.id), tenantId, type: 'SISTEMA', title, message, actionUrl, metadata: { kind: 'operations', key }, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'] }).catch(() => {})
}

export async function runTenantAlerts(tenantId: string): Promise<number> {
  let sent = 0
  const in30 = new Date(Date.now() + 30 * 86_400_000)
  const certs = await prisma.tenantCertificate.findMany({ where: { tenantId, active: true, validUntil: { lte: in30 } }, select: { id: true, validUntil: true } })
  for (const c of certs) {
    const days = Math.ceil(((c.validUntil?.getTime() ?? 0) - Date.now()) / 86_400_000)
    // 30 dias: um aviso; 7 dias ou menos: todo dia.
    if (days <= 7 || days === 30 || days === 15) {
      await alertOnce(tenantId, `cert:${c.id}`, days <= 0 ? 'Certificado digital vencido' : `Certificado digital vence em ${days} dia(s)`, 'Envie o certificado novo para não parar notas e integrações.', '/configuracoes/operacoes')
      sent++
    }
  }
  const rejected = await prisma.vehicleOperation.count({ where: { tenantId, cancelledAt: null, OR: [{ fiscalStatus: 'REJECTED' }, { renaveStatus: 'REJECTED' }] } })
  if (rejected) { await alertOnce(tenantId, 'rejected', 'Operações com rejeição', `${rejected} operação(ões) com NF-e ou RENAVE rejeitado.`, '/estoque/conformidade'); sent++ }
  const unknown = await prisma.externalOperation.count({ where: { tenantId, state: 'UNKNOWN', createdAt: { lte: new Date(Date.now() - 6 * 3_600_000) } } })
  if (unknown) { await alertOnce(tenantId, 'unknown', 'Operações sem confirmação', `${unknown} solicitação(ões) sem confirmação do provedor há mais de 6 horas.`, '/estoque/conformidade'); sent++ }
  await syncConsignmentPayouts(tenantId).catch((e) => console.error('[operacoes] repasses', tenantId, e))
  const overduePayouts = await prisma.consignmentContract.count({ where: { tenantId, status: 'SOLD', payoutStatus: { in: ['PENDING', 'PARTIAL'] }, payoutDueAt: { lt: new Date() } } })
  if (overduePayouts) { await alertOnce(tenantId, 'payout-overdue', 'Repasse de consignado vencido', `${overduePayouts} repasse(s) ao proprietário com vencimento passado.`, '/financeiro'); sent++ }
  const expiring = await prisma.consignmentContract.count({ where: { tenantId, status: 'ACTIVE', endsAt: { lte: new Date(Date.now() + 7 * 86_400_000) } } })
  if (expiring) { await alertOnce(tenantId, 'consign-expiring', 'Consignação vencendo', `${expiring} contrato(s) de consignação vencem em até 7 dias ou já venceram.`, '/estoque'); sent++ }
  const { indicators, tracking } = await stockSummary(tenantId)
  if (tracking.renaveTracked && indicators.divergent) { await alertOnce(tenantId, 'divergence', 'Divergência com o RENAVE', `${indicators.divergent} veículo(s) com estoque diferente do RENAVE.`, '/estoque/conformidade'); sent++ }
  return sent
}

/** Registra no veículo uma divergência nova (uma vez por dia) para a revisão. */
export async function recordDivergences(tenantId: string): Promise<number> {
  const { issues } = await stockSummary(tenantId)
  const divergent = issues.filter((r) => r.issues.some((i: ReconcileIssue) => i === 'RENAVE_EXIT_WITHOUT_SALE' || i === 'RENAVE_STILL_IN_STOCK'))
  const day = new Date().toISOString().slice(0, 10)
  let n = 0
  for (const r of divergent) {
    const k = await prisma.opsOutbox.createMany({ data: [{ tenantId, type: 'review.divergence', dedupKey: `review:${r.vehicleId}:${day}`, payload: { issues: r.issues }, status: 'DONE', processedAt: new Date() }], skipDuplicates: true })
    if (!k.count) continue
    await recordEvent({ tenantId, vehicleId: r.vehicleId, type: 'RECONCILE_DIVERGENCE', title: isInInternalStock(r.stockStatus) ? 'Revisão: o RENAVE indica saída, mas o carro está no estoque.' : 'Revisão: vendido no sistema, mas ainda no estoque do RENAVE.', origin: 'JOB', actor: SYSTEM_ACTOR })
    n++
  }
  return n
}

export async function runOpsJob(): Promise<Record<string, number>> {
  const events = await processPendingOpsEvents()
  const polled = await pollExternalOperations()
  const fiscal = await refreshPendingFiscal().catch((e) => { console.error('[operacoes] notas pendentes', e); return 0 })
  const queries = await pollVehicleQueries().catch((e) => { console.error('[operacoes] consultas veiculares', e); return 0 })
  const tenants = await prisma.tenant.findMany({ where: { status: { not: 'BANIDO' } as never }, select: { id: true } }).catch(async () => prisma.tenant.findMany({ select: { id: true } }))
  let alerts = 0, divergences = 0
  for (const t of tenants) {
    try {
      divergences += await recordDivergences(t.id)
      alerts += await runTenantAlerts(t.id)
    } catch (e) { console.error('[operacoes] job da loja', t.id, e) }
  }
  return { events: events.processed, eventsFailed: events.failed, polled, fiscal, queries, alerts, divergences, tenants: tenants.length }
}
