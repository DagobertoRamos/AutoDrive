// =============================================================================
// Leituras para as telas: visão do veículo (o que é, status, problema, próxima
// ação), operações da negociação e a trava "pode vender?" usada pelas rotas.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { getVehicleAvailabilityForSale } from '@/lib/vehicle-availability'
import { operationRequirements } from './capabilities'
import { opsContext } from './config'
import { dealNeedsOperations } from './orchestrator-core'
import { hasCrlv, syncDealOperations, vehicleRenaveFacts, type Actor } from './operations'
import { evaluateSaleReadiness, type Readiness } from './readiness-core'
import { DIMENSION_LABEL, dimensionText, overallStatus, type OverallStatus } from './status-core'
import { transferView } from './transfer'

/** Negociações finalizadas antes disto não ganham operação automática (sem ruído no histórico). */
export const OPS_LAUNCH = new Date('2026-10-07T00:00:00-03:00')

const OPEN_DEAL = ['RASCUNHO', 'EM_PREENCHIMENTO', 'AGUARDANDO_LIBERACAO', 'AGUARDANDO_APROVACAO', 'LIBERADA', 'APROVADA', 'EM_ANDAMENTO', 'REABERTA', 'SINAL_RECEBIDO', 'RESERVADA', 'AGUARDANDO_FINANCEIRO', 'FINANCEIRO_APROVADO', 'AGUARDANDO_DOCUMENTACAO', 'DOCUMENTACAO_CONCLUIDA', 'AGUARDANDO_CONTRATO', 'CONTRATO_GERADO', 'AGUARDANDO_ASSINATURA', 'ASSINADA', 'AGUARDANDO_ENTREGA', 'ENTREGUE']

export function serializeOperation<T extends Record<string, any>>(op: T) {
  const overall = overallStatus(op as never)
  const dims = Object.keys(DIMENSION_LABEL).map((k) => ({ key: k, label: DIMENSION_LABEL[k], value: op[k] as string, text: dimensionText(k, op[k] as string) }))
  return { id: op.id as string, code: op.code as string, kind: op.kind as string, dealId: op.dealId as string | null, vehicleId: op.vehicleId as string, parentId: op.parentId as string | null, overall, dimensions: dims, raw: { commercialStatus: op.commercialStatus, fiscalStatus: op.fiscalStatus, renaveStatus: op.renaveStatus, transferStatus: op.transferStatus, financingStatus: op.financingStatus, financialStatus: op.financialStatus, restrictionStatus: op.restrictionStatus }, createdAt: op.createdAt, cancelledAt: op.cancelledAt ?? null }
}

/** Fatos de prontidão de um veículo (uma consulta por fonte). */
export async function vehicleReadiness(vehicleId: string): Promise<{ readiness: Readiness; facts: Awaited<ReturnType<typeof vehicleRenaveFacts>> & { crlv: boolean } } | null> {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, tenantId: true, unitId: true, stockStatus: true, stockType: true, isAvailableForSale: true, active: true, cautelarStatus: true } })
  if (!v?.tenantId) return null
  const [ctx, restrictions, inspection, consignment, renave, crlv, openDeal, lastQuery] = await Promise.all([
    opsContext(v.tenantId, v.unitId),
    prisma.vehicleRestriction.findMany({ where: { vehicleId, status: 'ACTIVE' }, select: { kind: true, blocking: true, description: true } }),
    prisma.vehicleInspection.findFirst({ where: { vehicleId, cancelledAt: null, type: { in: ['VISTORIA_TRANSFERENCIA', 'LAUDO_ECV'] } }, orderBy: { performedAt: 'desc' }, select: { status: true, validUntil: true } }),
    v.stockType === 'CONSIGNADO' ? prisma.consignmentContract.findFirst({ where: { vehicleId }, orderBy: { createdAt: 'desc' }, select: { status: true, endsAt: true } }) : null,
    vehicleRenaveFacts(vehicleId),
    hasCrlv(vehicleId),
    prisma.dealVehicle.findFirst({ where: { vehicleId, role: 'VENDIDO', deal: { status: { in: OPEN_DEAL as never[] } } }, select: { deal: { select: { id: true, dealNumber: true, status: true } } } }),
    prisma.vehicleDataQuery.findFirst({ where: { vehicleId, status: 'DONE' }, orderBy: { createdAt: 'desc' }, select: { debtsTotal: true, debtsCount: true } }).catch(() => null),
  ])
  const consigned = v.stockType === 'CONSIGNADO'
  const req = operationRequirements(consigned ? 'CONSIGNMENT' : 'PURCHASE', ctx.cfg, ctx.caps)
  const avail = getVehicleAvailabilityForSale({ stockStatus: v.stockStatus, isAvailableForSale: v.isAvailableForSale, active: v.active, hasOpenNegotiation: !!openDeal, openNegotiationId: openDeal?.deal.id ?? null, openNegotiationNumber: openDeal?.deal.dealNumber ?? null, openNegotiationStatus: openDeal?.deal.status ?? null })
  const readiness = evaluateSaleReadiness({
    stock: { canSelect: avail.canSelect, warning: avail.warning },
    restrictions, renaveStock: renave.renave, renaveRequired: req.renave,
    fiscalEntry: renave.fiscalEntry, fiscalRequired: req.fiscal,
    cautelarStatus: v.cautelarStatus, inspection, hasCrlv: crlv, consigned, consignment,
    debts: lastQuery ? { total: Number(lastQuery.debtsTotal ?? 0), count: lastQuery.debtsCount } : null,
  }, ctx.cfg)
  return { readiness, facts: { ...renave, crlv } }
}

/**
 * Pendências que IMPEDEM a venda destes veículos (restrição bloqueante sempre;
 * RENAVE/fiscal/vistoria/documentos só quando a loja configurou BLOCK).
 * Disponibilidade de estoque continua com a regra que já existe nas rotas.
 */
export async function saleBlockers(vehicleIds: string[]): Promise<{ vehicleId: string; reasons: string[] }[]> {
  const out: { vehicleId: string; reasons: string[] }[] = []
  for (const id of [...new Set(vehicleIds.filter(Boolean))]) {
    const r = await vehicleReadiness(id).catch(() => null)
    if (!r) continue
    const reasons = r.readiness.blockers.filter((b) => b.key !== 'stock').map((b) => b.reason ?? b.label)
    if (reasons.length) out.push({ vehicleId: id, reasons })
  }
  return out
}

export function saleBlockedMessage(blocked: { reasons: string[] }[]): string {
  return `Existe uma pendência que impede a venda: ${blocked[0].reasons[0]}`
}

/** Tudo que o card + drawer do veículo precisam. */
export async function vehicleOverview(vehicleId: string, opts: { costs: boolean }) {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, tenantId: true, unitId: true, stockStatus: true, stockType: true, purchasePrice: true } })
  if (!v?.tenantId) return null
  const [ready, ops, events, eventsTotal, restrictions, inspections, consignment, storeTransfer, fiscalDocs] = await Promise.all([
    vehicleReadiness(vehicleId),
    prisma.vehicleOperation.findMany({ where: { vehicleId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.operationEvent.findMany({ where: { vehicleId, technical: false }, orderBy: { createdAt: 'desc' }, take: 6 }),
    prisma.operationEvent.count({ where: { vehicleId, technical: false } }),
    prisma.vehicleRestriction.findMany({ where: { vehicleId }, orderBy: [{ status: 'asc' }, { detectedAt: 'desc' }], take: 20 }),
    prisma.vehicleInspection.findMany({ where: { vehicleId, cancelledAt: null }, orderBy: { performedAt: 'desc' }, take: 10 }),
    v.stockType === 'CONSIGNADO' ? prisma.consignmentContract.findFirst({ where: { vehicleId }, orderBy: { createdAt: 'desc' } }) : null,
    prisma.storeTransfer.findFirst({ where: { vehicleId, status: 'REQUESTED' } }),
    prisma.fiscalDocument.findMany({ where: { vehicleId }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, series: true, direction: true, status: true, accessKey: true, amount: true, authorizedAt: true, recipientName: true, issuerName: true } }),
  ])
  const units = storeTransfer ? await prisma.unit.findMany({ where: { id: { in: [storeTransfer.fromUnitId, storeTransfer.toUnitId].filter(Boolean) as string[] } }, select: { id: true, name: true } }) : []
  const current = ops.find((o) => !o.cancelledAt) ?? ops[0] ?? null
  const currentOverall: OverallStatus | null = current ? overallStatus(current as never) : null
  const facts = ready?.facts
  return {
    readiness: ready?.readiness ?? null,
    renave: facts?.renave ?? 'NONE',
    fiscalEntry: facts?.fiscalEntry ?? 'NONE',
    documentsOk: facts?.crlv ?? false,
    cost: opts.costs && v.purchasePrice != null ? Number(v.purchasePrice) : null,
    current: current ? { ...serializeOperation(current), transfer: await transferView(current) } : null,
    currentOverall,
    operations: ops.map(serializeOperation),
    events, eventsTotal,
    restrictions, inspections, consignment,
    storeTransfer: storeTransfer ? { ...storeTransfer, fromName: units.find((u) => u.id === storeTransfer.fromUnitId)?.name ?? null, toName: units.find((u) => u.id === storeTransfer.toUnitId)?.name ?? null } : null,
    fiscalDocs: fiscalDocs.map((d) => ({ ...d, amount: d.amount != null ? Number(d.amount) : null })),
  }
}

/** Operações da negociação (cria as que faltam quando a negociação já pede acompanhamento). */
export async function dealOperations(dealId: string, actor: Actor) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, status: true, finalizedAt: true, updatedAt: true } })
  if (!deal) return { operations: [], legacy: false }
  const legacy = deal.status === 'FINALIZADA' && !!deal.finalizedAt && deal.finalizedAt < OPS_LAUNCH
  let ops = await prisma.vehicleOperation.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } })
  if (!legacy && dealNeedsOperations(deal.status)) {
    await syncDealOperations(dealId, actor).catch((e) => console.error('[operacoes] sync da negociação', dealId, e))
    ops = await prisma.vehicleOperation.findMany({ where: { dealId }, orderBy: { createdAt: 'asc' } })
  }
  const vehicles = await prisma.vehicle.findMany({ where: { id: { in: [...new Set(ops.map((o) => o.vehicleId))] } }, select: { id: true, brand: true, model: true, plate: true } })
  const withTransfer = await Promise.all(ops.map(async (o) => ({ ...serializeOperation(o), transfer: await transferView(o), vehicle: vehicles.find((v) => v.id === o.vehicleId) ?? null })))
  const fiscalDocs = await prisma.fiscalDocument.findMany({ where: { dealId }, orderBy: { createdAt: 'desc' }, select: { id: true, operationId: true, number: true, series: true, direction: true, status: true, accessKey: true, amount: true, authorizedAt: true, recipientName: true, issuerName: true } })
  return { operations: withTransfer, legacy: legacy && ops.length === 0, fiscalDocs: fiscalDocs.map((d) => ({ ...d, amount: d.amount != null ? Number(d.amount) : null })) }
}
