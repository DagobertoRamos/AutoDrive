// =============================================================================
// Listas do menu Operações (RENAVE, notas, transferências, consultas) e o
// painel com os números críticos. Uma consulta por fonte; tudo por loja.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { activeConnection } from './connections'
import { stockSummary } from './jobs'
import { providerEntry } from './providers-catalog'
import { overallStatus, dimensionText } from './status-core'
import { transferStageMessage } from './transfer-core'

export type ListView = 'renave' | 'fiscal' | 'transfer' | 'queries'

const PAGE = 50

async function vehiclesMap(ids: string[]) {
  const rows = ids.length ? await prisma.vehicle.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, brand: true, model: true, plate: true } }) : []
  return new Map(rows.map((v) => [v.id, v]))
}
async function dealsMap(ids: (string | null)[]) {
  const list = [...new Set(ids.filter(Boolean) as string[])]
  const rows = list.length ? await prisma.deal.findMany({ where: { id: { in: list } }, select: { id: true, dealNumber: true, customer: { select: { name: true } }, person: { select: { nomeCompleto: true } } } }) : []
  return new Map(rows.map((d) => [d.id, d]))
}

function vehicleLabel(v?: { brand: string | null; model: string | null; plate: string | null } | null) {
  return { name: [v?.brand, v?.model].filter(Boolean).join(' ') || 'Veículo', plate: v?.plate ?? null }
}

export interface OpsRow {
  key: string
  vehicleId: string | null
  operationId: string | null
  dealId: string | null
  vehicle: { name: string; plate: string | null }
  title: string
  detail: string | null
  tone: 'ok' | 'progress' | 'attention' | 'critical' | 'neutral'
  date: Date | string
  action: { key: string; label: string } | null
  extra?: Record<string, unknown>
}

// ── RENAVE ──────────────────────────────────────────────────────────────────

async function renaveList(tenantId: string, filter: string, q: string): Promise<OpsRow[]> {
  if (filter === 'divergent' || filter === 'pending') {
    const { issues } = await stockSummary(tenantId)
    const wanted = filter === 'divergent' ? ['RENAVE_EXIT_WITHOUT_SALE', 'RENAVE_STILL_IN_STOCK'] : ['RENAVE_MISSING_ENTRY']
    const rows: OpsRow[] = issues.filter((r) => r.issues.some((i) => wanted.includes(i))).map((r) => ({
      key: `v:${r.vehicleId}`, vehicleId: r.vehicleId, operationId: null, dealId: null,
      vehicle: vehicleLabel(r), title: filter === 'divergent' ? (r.issues.includes('RENAVE_EXIT_WITHOUT_SALE') ? 'RENAVE indica saída; carro no estoque' : 'Vendido; ainda no estoque do RENAVE') : 'Entrada pendente',
      detail: null, tone: filter === 'divergent' ? 'critical' : 'attention', date: new Date(), action: filter === 'pending' ? { key: 'renave.entry', label: 'Registrar entrada' } : null,
    }))
    if (filter === 'pending') {
      // Saídas pendentes: venda com ATPV-e assinada e saída ainda não registrada.
      const exits = await prisma.vehicleOperation.findMany({ where: { tenantId, kind: 'SALE', cancelledAt: null, commercialStatus: 'SOLD', renaveStatus: { in: ['PENDING', 'EXIT_SUBMITTED', 'UNKNOWN', 'REJECTED'] } }, orderBy: { updatedAt: 'desc' }, take: 200 })
      const vm = await vehiclesMap(exits.map((o) => o.vehicleId))
      for (const o of exits) {
        const ov = overallStatus(o as never)
        rows.push({ key: `o:${o.id}`, vehicleId: o.vehicleId, operationId: o.id, dealId: o.dealId, vehicle: vehicleLabel(vm.get(o.vehicleId)), title: 'Saída: ' + dimensionText('renaveStatus', o.renaveStatus).toLowerCase(), detail: ov.nextAction?.key === 'renave.exit' ? null : ov.message, tone: o.renaveStatus === 'REJECTED' ? 'critical' : 'attention', date: o.updatedAt, action: ov.nextAction?.key === 'renave.exit' ? ov.nextAction : null })
      }
    }
    return filterRows(rows, q)
  }
  const where: Prisma.VehicleOperationWhereInput = filter === 'confirmed'
    ? { tenantId, renaveStatus: { in: ['ENTRY_CONFIRMED', 'EXIT_CONFIRMED'] } }
    : { tenantId, renaveStatus: { in: ['REJECTED', 'UNKNOWN'] } }
  const ops = await prisma.vehicleOperation.findMany({ where, orderBy: { updatedAt: 'desc' }, take: PAGE * 4 })
  const vm = await vehiclesMap(ops.map((o) => o.vehicleId))
  return filterRows(ops.map((o) => ({
    key: `o:${o.id}`, vehicleId: o.vehicleId, operationId: o.id, dealId: o.dealId, vehicle: vehicleLabel(vm.get(o.vehicleId)),
    title: `${o.kind === 'SALE' ? 'Saída' : 'Entrada'}: ${dimensionText('renaveStatus', o.renaveStatus).toLowerCase()}`, detail: o.code,
    tone: o.renaveStatus === 'REJECTED' ? 'critical' : o.renaveStatus === 'UNKNOWN' ? 'attention' : 'ok', date: o.updatedAt, action: null,
  })), q)
}

// ── Notas fiscais ───────────────────────────────────────────────────────────

async function fiscalList(tenantId: string, filter: string, q: string): Promise<OpsRow[]> {
  if (filter === 'pending' || filter === 'rejected') {
    const ops = await prisma.vehicleOperation.findMany({
      where: { tenantId, cancelledAt: null, commercialStatus: { in: ['SOLD', 'ACQUIRED', 'CLOSED'] }, fiscalStatus: filter === 'pending' ? { in: ['PENDING', 'PROCESSING', 'UNKNOWN'] } : 'REJECTED' },
      orderBy: { updatedAt: 'desc' }, take: 300,
    })
    const [vm, dm] = await Promise.all([vehiclesMap(ops.map((o) => o.vehicleId)), dealsMap(ops.map((o) => o.dealId))])
    const docs = filter === 'rejected' ? await prisma.fiscalDocument.findMany({ where: { operationId: { in: ops.map((o) => o.id) }, status: 'REJECTED' }, orderBy: { createdAt: 'desc' }, select: { operationId: true, rejectionMessage: true } }) : []
    return filterRows(ops.map((o) => {
      const d = o.dealId ? dm.get(o.dealId) : null
      const who = d?.person?.nomeCompleto ?? d?.customer?.name ?? null
      return {
        key: `o:${o.id}`, vehicleId: o.vehicleId, operationId: o.id, dealId: o.dealId, vehicle: vehicleLabel(vm.get(o.vehicleId)),
        title: `${o.kind === 'SALE' ? 'NF-e de saída' : 'NF-e de entrada'}: ${dimensionText('fiscalStatus', o.fiscalStatus).toLowerCase()}`,
        detail: filter === 'rejected' ? docs.find((x) => x.operationId === o.id)?.rejectionMessage ?? null : [who, d?.dealNumber].filter(Boolean).join(' · ') || null,
        tone: filter === 'rejected' ? 'critical' : o.fiscalStatus === 'PROCESSING' ? 'progress' : 'attention', date: o.updatedAt,
        action: o.fiscalStatus === 'PROCESSING' ? { key: 'fiscal.refresh', label: 'Atualizar' } : { key: 'fiscal.issue', label: filter === 'rejected' ? 'Emitir de novo' : 'Emitir / vincular' },
        extra: { direction: o.kind === 'SALE' || o.kind === 'STORE_TRANSFER' ? 'OUT' : 'IN' },
      } as OpsRow
    }), q)
  }
  const docs = await prisma.fiscalDocument.findMany({ where: { tenantId, status: filter === 'cancelled' ? 'CANCELLED' : 'AUTHORIZED' }, orderBy: { createdAt: 'desc' }, take: PAGE * 4, select: { id: true, operationId: true, vehicleId: true, dealId: true, number: true, series: true, direction: true, amount: true, recipientName: true, authorizedAt: true, cancelledAt: true, createdAt: true, status: true } })
  const vm = await vehiclesMap(docs.map((d) => d.vehicleId).filter(Boolean) as string[])
  return filterRows(docs.map((d) => ({
    key: `f:${d.id}`, vehicleId: d.vehicleId, operationId: d.operationId, dealId: d.dealId, vehicle: vehicleLabel(d.vehicleId ? vm.get(d.vehicleId) : null),
    title: `NF-e ${d.number ?? '—'}${d.series ? `/${d.series}` : ''} · ${d.direction === 'OUT' ? 'saída' : 'entrada'}`,
    detail: [d.recipientName, d.amount != null ? Number(d.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null].filter(Boolean).join(' · ') || null,
    tone: d.status === 'CANCELLED' ? 'neutral' : 'ok', date: d.cancelledAt ?? d.authorizedAt ?? d.createdAt, action: null,
    extra: { documentId: d.id, status: d.status },
  })), q)
}

// ── Transferências ─────────────────────────────────────────────────────────

async function transferList(tenantId: string, filter: string, q: string): Promise<OpsRow[]> {
  if (filter === 'stores') {
    const ts = await prisma.storeTransfer.findMany({ where: { tenantId }, orderBy: { requestedAt: 'desc' }, take: 200 })
    const [vm, units] = await Promise.all([vehiclesMap(ts.map((t) => t.vehicleId)), prisma.unit.findMany({ where: { tenantId }, select: { id: true, name: true } })])
    const un = (id: string | null) => units.find((u) => u.id === id)?.name ?? '—'
    const STATUS: Record<string, string> = { REQUESTED: 'Aguardando aceite', ACCEPTED: 'Aceita', REJECTED: 'Recusada', CANCELLED: 'Cancelada' }
    return filterRows(ts.map((t) => ({
      key: `s:${t.id}`, vehicleId: t.vehicleId, operationId: t.operationId, dealId: null, vehicle: vehicleLabel(vm.get(t.vehicleId)),
      title: `${un(t.fromUnitId)} → ${un(t.toUnitId)}`, detail: STATUS[t.status] ?? t.status,
      tone: t.status === 'REQUESTED' ? 'attention' : t.status === 'ACCEPTED' ? 'ok' : 'neutral', date: t.decidedAt ?? t.requestedAt, action: null,
    })), q)
  }
  const done = filter === 'done'
  const ops = await prisma.vehicleOperation.findMany({
    where: { tenantId, kind: 'SALE', cancelledAt: null, commercialStatus: 'SOLD', transferStatus: done ? 'CRLV_ISSUED' : { notIn: ['NOT_APPLICABLE', 'CRLV_ISSUED'] } },
    orderBy: { updatedAt: 'asc' }, take: 300,
  })
  const [vm, dm] = await Promise.all([vehiclesMap(ops.map((o) => o.vehicleId)), dealsMap(ops.map((o) => o.dealId))])
  const now = Date.now()
  return filterRows(ops.map((o) => {
    const d = o.dealId ? dm.get(o.dealId) : null
    const days = Math.floor((now - o.updatedAt.getTime()) / 86_400_000)
    const ov = overallStatus(o as never)
    const action = !done && ov.nextAction && ['transfer.advance', 'transfer.instructions', 'renave.exit'].includes(ov.nextAction.key) ? ov.nextAction : null
    return {
      key: `o:${o.id}`, vehicleId: o.vehicleId, operationId: o.id, dealId: o.dealId, vehicle: vehicleLabel(vm.get(o.vehicleId)),
      title: done ? 'Transferência concluída' : ov.message || transferStageMessage(o.transferStatus),
      detail: [d?.person?.nomeCompleto ?? d?.customer?.name, !done && days > 0 ? `parada há ${days} dia(s)` : null].filter(Boolean).join(' · ') || null,
      tone: done ? 'ok' : days > 15 ? 'critical' : days > 5 ? 'attention' : 'progress', date: o.updatedAt, action,
      extra: { transferStatus: o.transferStatus },
    } as OpsRow
  }), q)
}

// ── Consultas ───────────────────────────────────────────────────────────────

async function queriesList(tenantId: string, filter: string, q: string): Promise<OpsRow[]> {
  const where: Prisma.VehicleDataQueryWhereInput = { tenantId, ...(filter === 'debts' ? { debtsCount: { gt: 0 } } : filter === 'restrictions' ? { restrictionsCount: { gt: 0 } } : {}) }
  const rows = await prisma.vehicleDataQuery.findMany({ where, orderBy: { createdAt: 'desc' }, take: PAGE * 4 })
  const vm = await vehiclesMap(rows.map((r) => r.vehicleId).filter(Boolean) as string[])
  return filterRows(rows.map((r) => {
    const total = Number(r.debtsTotal ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    return {
      key: `q:${r.id}`, vehicleId: r.vehicleId, operationId: null, dealId: null, vehicle: r.vehicleId ? vehicleLabel(vm.get(r.vehicleId)) : { name: r.plate ?? '—', plate: r.plate },
      title: r.status === 'PROCESSING' ? 'Consultando…' : r.status === 'ERROR' ? 'Consulta não concluída' : r.debtsCount ? `${r.debtsCount} débito(s) · ${total}` : 'Nada consta em débitos',
      detail: [r.restrictionsCount ? `${r.restrictionsCount} restrição(ões)` : null, providerEntry('VEHICLE_DATA', r.providerId)?.name ?? r.providerId].filter(Boolean).join(' · '),
      tone: r.blocking ? 'critical' : r.status === 'ERROR' ? 'attention' : r.debtsCount ? 'attention' : r.status === 'PROCESSING' ? 'progress' : 'ok',
      date: r.createdAt, action: null,
    } as OpsRow
  }), q)
}

function filterRows(rows: OpsRow[], q: string): OpsRow[] {
  const t = q.trim().toLowerCase()
  const out = t ? rows.filter((r) => `${r.vehicle.name} ${r.vehicle.plate ?? ''} ${r.title} ${r.detail ?? ''}`.toLowerCase().includes(t)) : rows
  return out.slice(0, 300)
}

export async function opsList(tenantId: string, view: ListView, filter: string, q: string): Promise<OpsRow[]> {
  switch (view) {
    case 'renave': return renaveList(tenantId, filter || 'pending', q)
    case 'fiscal': return fiscalList(tenantId, filter || 'pending', q)
    case 'transfer': return transferList(tenantId, filter || 'open', q)
    case 'queries': return queriesList(tenantId, filter || 'all', q)
  }
}

/** Painel: só o que pede ação. */
export async function opsDashboard(tenantId: string) {
  const [stock, nfePending, nfeRejected, transfersOpen, storeTransfers, renaveExit, renaveIssues, conns, queriesBlocking] = await Promise.all([
    stockSummary(tenantId),
    prisma.vehicleOperation.count({ where: { tenantId, cancelledAt: null, commercialStatus: { in: ['SOLD', 'ACQUIRED', 'CLOSED'] }, fiscalStatus: { in: ['PENDING', 'PROCESSING', 'UNKNOWN'] } } }),
    prisma.vehicleOperation.count({ where: { tenantId, cancelledAt: null, fiscalStatus: 'REJECTED' } }),
    prisma.vehicleOperation.findMany({ where: { tenantId, kind: 'SALE', cancelledAt: null, commercialStatus: 'SOLD', transferStatus: { notIn: ['NOT_APPLICABLE', 'CRLV_ISSUED'] } }, select: { updatedAt: true } }),
    prisma.storeTransfer.count({ where: { tenantId, status: 'REQUESTED' } }),
    prisma.vehicleOperation.count({ where: { tenantId, kind: 'SALE', cancelledAt: null, commercialStatus: 'SOLD', renaveStatus: 'PENDING' } }),
    prisma.vehicleOperation.count({ where: { tenantId, renaveStatus: { in: ['REJECTED', 'UNKNOWN'] } } }),
    Promise.all((['RENAVE', 'FISCAL', 'TRANSFER', 'VEHICLE_DATA'] as const).map(async (d) => [d, (await activeConnection(tenantId, d)).providerId] as const)),
    prisma.vehicleDataQuery.count({ where: { tenantId, blocking: true, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
  ])
  const stalled = transfersOpen.filter((t) => Date.now() - t.updatedAt.getTime() > 5 * 86_400_000).length
  return {
    renave: { entryPending: stock.indicators.pending, exitPending: renaveExit, issues: renaveIssues, divergent: stock.indicators.divergent, ok: stock.indicators.renaveOk, total: stock.indicators.total },
    fiscal: { pending: nfePending, rejected: nfeRejected },
    transfer: { open: transfersOpen.length, stalled, stores: storeTransfers },
    queries: { blocking: queriesBlocking },
    connections: Object.fromEntries(conns.map(([d, p]) => [d, { providerId: p, name: providerEntry(d, p)?.name ?? null, manual: p === 'MANUAL' }])),
    tracking: stock.tracking,
  }
}
