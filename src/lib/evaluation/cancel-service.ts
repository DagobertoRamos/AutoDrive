// =============================================================================
// Avaliação × negociação × lead — cancelamento e registro automático.
//   • cancelEvaluation: cancela a avaliação (fica no sistema como CANCELADA),
//     grava no histórico dela e em TODO lead ligado (pela avaliação ou pela
//     negociação), e tira o carro da lista de veículos do lead.
//   • Automático: negociação cancelada com o carro de entrada devolvido (troca,
//     compra, consignação), carro marcado Devolvido/Cancelado no estoque.
//   • onDealLinkedToLead: negociação vinculada ao lead traz os veículos
//     (interesse, troca), liga as avaliações e registra no lead e na negociação.
// Tudo best-effort fora do fluxo principal: nunca impede cancelar/vincular.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { recordHistory } from '@/lib/evaluation/history'
import { syncDealVehiclesToLead } from '@/lib/crm/vehicle-sync'
import { createDealAudit } from '@/lib/negotiation-service'

export interface Actor { id: string | null; name: string | null; role?: string | null }
export const SYSTEM_ACTOR: Actor = { id: null, name: 'Sistema' }

export type CancelOrigin = 'MANUAL' | 'NEGOCIACAO_CANCELADA' | 'VEICULO_DEVOLVIDO'

const CANCELLED = ['CANCELADA', 'CANCELED']
/** Carro fora do estoque (devolvido/cancelado/inativo): a avaliação pode ser cancelada. */
const OUT_OF_STOCK = ['DEVOLVIDO', 'CANCELADO']
const ENTERING_ROLES = ['TROCA', 'COMPRADO', 'CONSIGNADO']
const ROLE_LABEL: Record<string, string> = { VENDIDO: 'vendido', TROCA: 'na troca', COMPRADO: 'comprado', CONSIGNADO: 'consignado' }

const normPlate = (p: string | null | undefined) => (p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const carLabel = (v: { brand?: string | null; model?: string | null; year?: number | null; plate?: string | null }) =>
  [v.brand, v.model, v.year, v.plate ? `placa ${v.plate}` : null].filter(Boolean).join(' ') || 'veículo'

// ── Leads ligados ────────────────────────────────────────────────────────────

export async function leadsOfDeal(tenantId: string, dealId: string): Promise<string[]> {
  const [links, converted] = await Promise.all([
    prisma.crmLeadDeal.findMany({ where: { tenantId, dealId }, select: { leadId: true } }).catch(() => []),
    prisma.marketingLead.findMany({ where: { tenantId, convertedDealId: dealId, deletedAt: null }, select: { id: true } }).catch(() => []),
  ])
  return [...new Set([...links.map((l) => l.leadId), ...converted.map((l) => l.id)])]
}

export async function leadsOfEvaluation(tenantId: string, evaluationId: string): Promise<string[]> {
  const rows = await prisma.crmLeadEvaluation.findMany({ where: { tenantId, evaluationId }, select: { leadId: true } }).catch(() => [])
  return [...new Set(rows.map((r) => r.leadId))]
}

/** Registra no histórico (linha do tempo) de cada lead. */
export async function logOnLeads(tenantId: string, leadIds: string[], entry: { type: string; summary: string; actor: Actor; vehicle?: string | null }) {
  const now = new Date()
  for (const leadId of leadIds) {
    await prisma.crmLeadInteraction.create({
      data: { tenantId, leadId, type: entry.type, summary: entry.summary.slice(0, 2000), discussedVehicle: entry.vehicle ?? null, authorId: entry.actor.id ?? 'system', authorName: entry.actor.name ?? 'Sistema', occurredAt: now },
    }).catch(() => {})
  }
}

async function linkEvaluationToLeads(tenantId: string, evaluationId: string, leadIds: string[], actor: Actor) {
  for (const leadId of leadIds) {
    await prisma.crmLeadEvaluation.upsert({
      where: { leadId_evaluationId: { leadId, evaluationId } },
      create: { tenantId, leadId, evaluationId, linkedByUserId: actor.id },
      update: {},
    }).catch(() => {})
  }
}

/** Avaliação criada dentro de uma negociação: liga aos leads dela e registra. */
export async function linkNewEvaluationToDealLeads(p: { tenantId: string; evaluationId: string; dealId: string; plate: string | null; actor: Actor }) {
  const leadIds = await leadsOfDeal(p.tenantId, p.dealId)
  if (!leadIds.length) return
  await linkEvaluationToLeads(p.tenantId, p.evaluationId, leadIds, p.actor)
  await logOnLeads(p.tenantId, leadIds, { type: 'EVALUATION', summary: `Avaliação iniciada para ${p.plate ? `placa ${p.plate}` : 'o veículo do cliente'} (veículo de troca da negociação).`, actor: p.actor, vehicle: p.plate })
}

// ── Cancelar avaliação ───────────────────────────────────────────────────────

export type CancelResult = { ok: true; alreadyCancelled: boolean; leadIds: string[] } | { ok: false; status: number; error: string }

export async function cancelEvaluation(p: {
  tenantId: string
  evaluationId: string
  reason: string
  actor: Actor
  origin: CancelOrigin
  /** Negociação que motivou (cancelada) — o cancelamento também vai para os leads dela. */
  dealId?: string | null
}): Promise<CancelResult> {
  const ev = await prisma.vehicleEvaluation.findFirst({
    where: { id: p.evaluationId, tenantId: p.tenantId },
    select: { id: true, status: true, cancelledAt: true, vehicleId: true, negotiationId: true, plate: true, brand: true, model: true, modelYear: true },
  })
  if (!ev) return { ok: false, status: 404, error: 'Avaliação não encontrada.' }
  if (ev.cancelledAt || CANCELLED.includes(String(ev.status ?? '').toUpperCase())) return { ok: true, alreadyCancelled: true, leadIds: [] }

  // Carro já no estoque: cancelar a avaliação não tira o carro de lá — isso é
  // feito devolvendo o carro (negociação de entrada ou "Devolvido" no estoque).
  if (ev.vehicleId && p.origin === 'MANUAL') {
    const v = await prisma.vehicle.findUnique({ where: { id: ev.vehicleId }, select: { stockStatus: true, active: true } })
    if (v && v.active && !OUT_OF_STOCK.includes(String(v.stockStatus))) {
      return { ok: false, status: 409, error: 'Este carro já está no estoque. Para cancelar a avaliação, devolva o carro (cancele a negociação de entrada devolvendo o veículo ou marque-o como Devolvido no estoque).' }
    }
  }

  const reason = p.reason.trim().slice(0, 500)
  const done = await prisma.vehicleEvaluation.updateMany({
    where: { id: ev.id, cancelledAt: null },
    data: { status: 'CANCELADA', cancelledAt: new Date(), cancelledById: p.actor.id, cancelReason: reason },
  })
  if (!done.count) return { ok: true, alreadyCancelled: true, leadIds: [] }

  await recordHistory({
    tenantId: p.tenantId, evaluationId: ev.id, userId: p.actor.id ?? undefined, userName: p.actor.name ?? 'Sistema', userRole: p.actor.role ?? undefined,
    action: 'CANCEL', oldValue: { status: ev.status }, newValue: { status: 'CANCELADA', reason, origin: p.origin, ...(p.dealId ? { dealId: p.dealId } : {}) },
  }).catch(() => {})

  // Leads: os da avaliação + os da negociação (que passam a ter a avaliação ligada).
  const dealIds = [...new Set([p.dealId, ev.negotiationId].filter(Boolean) as string[])]
  const fromDeals = (await Promise.all(dealIds.map((d) => leadsOfDeal(p.tenantId, d)))).flat()
  const leadIds = [...new Set([...(await leadsOfEvaluation(p.tenantId, ev.id)), ...fromDeals])]
  if (leadIds.length) {
    await linkEvaluationToLeads(p.tenantId, ev.id, leadIds, p.actor)
    const car = carLabel({ brand: ev.brand, model: ev.model, year: ev.modelYear, plate: ev.plate })
    const why = p.origin === 'NEGOCIACAO_CANCELADA' ? 'negociação cancelada' : p.origin === 'VEICULO_DEVOLVIDO' ? 'veículo devolvido' : 'cancelada manualmente'
    await logOnLeads(p.tenantId, leadIds, { type: 'EVALUATION', summary: `Avaliação cancelada (${why}): ${car}. Motivo: ${reason}`, actor: p.actor, vehicle: car })
    await removeLeadVehicle(p.tenantId, leadIds, { vehicleId: ev.vehicleId, plate: ev.plate }, `Avaliação cancelada: ${reason}`)
  }
  return { ok: true, alreadyCancelled: false, leadIds }
}

/** Tira o carro do cliente (troca/venda/consignação) da lista do lead — mantém o histórico. */
async function removeLeadVehicle(tenantId: string, leadIds: string[], car: { vehicleId: string | null; plate: string | null }, reason: string) {
  const plate = normPlate(car.plate)
  if (!car.vehicleId && !plate) return
  const rows = await prisma.crmLeadVehicle.findMany({
    where: { tenantId, leadId: { in: leadIds }, removedAt: null, role: { in: ['TROCA', 'VENDA', 'CONSIGNACAO', 'AVALIACAO'] } },
    select: { id: true, vehicleId: true, plate: true },
  }).catch(() => [])
  const ids = rows.filter((r) => (car.vehicleId && r.vehicleId === car.vehicleId) || (plate && normPlate(r.plate) === plate)).map((r) => r.id)
  if (ids.length) await prisma.crmLeadVehicle.updateMany({ where: { id: { in: ids } }, data: { removedAt: new Date(), removedReason: reason.slice(0, 300) } }).catch(() => {})
}

// ── Avaliação de um carro de entrada ─────────────────────────────────────────

/** Avaliação do carro que entraria pela negociação (pelo carro do estoque, pela negociação ou pela placa). */
export async function findEnteringEvaluation(tenantId: string, dealId: string, dv: { vehicleId: string | null; plate: string | null }): Promise<string | null> {
  if (dv.vehicleId) {
    const v = await prisma.vehicle.findUnique({ where: { id: dv.vehicleId }, select: { originEvaluationId: true } }).catch(() => null)
    if (v?.originEvaluationId) return v.originEvaluationId
    const byVehicle = await prisma.vehicleEvaluation.findFirst({ where: { tenantId, vehicleId: dv.vehicleId }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    if (byVehicle) return byVehicle.id
  }
  const plate = normPlate(dv.plate)
  const byDeal = await prisma.vehicleEvaluation.findMany({ where: { tenantId, negotiationId: dealId }, select: { id: true, plate: true } })
  const sameDeal = byDeal.find((e) => !plate || normPlate(e.plate) === plate)
  if (sameDeal) return sameDeal.id
  if (!plate) return null
  // Sem vínculo: a avaliação aberta mais recente da mesma placa que ainda não virou estoque.
  const dashed = `${plate.slice(0, 3)}-${plate.slice(3)}`
  const byPlate = await prisma.vehicleEvaluation.findFirst({
    where: { tenantId, cancelledAt: null, vehicleId: null, OR: [{ plate: { equals: plate, mode: 'insensitive' } }, { plate: { equals: dashed, mode: 'insensitive' } }] },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return byPlate?.id ?? null
}

// ── Negociação cancelada ─────────────────────────────────────────────────────

/**
 * Depois de cancelar a negociação: cancela a avaliação de cada carro de entrada
 * devolvido (ou que nem chegou ao estoque) e registra tudo nos leads.
 */
export async function afterDealCancelled(p: {
  tenantId: string
  deal: { id: string; dealNumber: string | null; type: string }
  vehicles: { vehicleId: string | null; role: string; brand: string | null; model: string | null; year: number | null; plate: string | null }[]
  returnEntering: boolean
  returnedVehicleIds: string[]
  reason: string
  actor: Actor
}) {
  const number = p.deal.dealNumber ?? `NEG-${p.deal.id.slice(-8)}`
  const lines: string[] = [`Negociação ${number} cancelada. Motivo: ${p.reason.trim()}`]
  for (const dv of p.vehicles) {
    const car = carLabel(dv)
    if (dv.role === 'VENDIDO') { lines.push(`Veículo vendido voltou ao estoque: ${car}.`); continue }
    if (!ENTERING_ROLES.includes(dv.role)) continue
    const returned = !!dv.vehicleId && p.returnedVehicleIds.includes(dv.vehicleId)
    // Carro de entrada que ficou com a loja: a avaliação continua válida.
    if (!p.returnEntering || (dv.vehicleId && !returned)) { lines.push(`Veículo ${ROLE_LABEL[dv.role] ?? 'de entrada'} continua com a loja: ${car}.`); continue }
    lines.push(`Veículo ${ROLE_LABEL[dv.role] ?? 'de entrada'} devolvido ao proprietário: ${car}.`)
    const evaluationId = await findEnteringEvaluation(p.tenantId, p.deal.id, dv).catch(() => null)
    if (!evaluationId) continue
    const r = await cancelEvaluation({ tenantId: p.tenantId, evaluationId, reason: `Negociação ${number} cancelada: ${p.reason.trim()}`, actor: p.actor, origin: 'NEGOCIACAO_CANCELADA', dealId: p.deal.id }).catch(() => null)
    if (r?.ok && !r.alreadyCancelled) lines.push(`Avaliação do ${car} cancelada.`)
  }
  const leadIds = await leadsOfDeal(p.tenantId, p.deal.id)
  if (leadIds.length) await logOnLeads(p.tenantId, leadIds, { type: 'NEGOTIATION', summary: lines.join('\n'), actor: p.actor })
}

// ── Carro devolvido/cancelado pelo estoque ───────────────────────────────────

export async function afterVehicleReturned(tenantId: string, vehicleId: string, newStatus: string, actor: Actor) {
  const evaluationId = await findEnteringEvaluation(tenantId, '__none__', { vehicleId, plate: null }).catch(() => null)
  if (!evaluationId) return
  await cancelEvaluation({ tenantId, evaluationId, reason: `Veículo marcado como ${newStatus === 'DEVOLVIDO' ? 'Devolvido' : 'Cancelado'} no estoque.`, actor, origin: 'VEICULO_DEVOLVIDO' }).catch(() => null)
}

// ── Negociação vinculada ao lead ─────────────────────────────────────────────

/**
 * Lead ↔ negociação: traz os veículos (interesse e troca) para o lead, liga as
 * avaliações dos carros de entrada e registra o vínculo no lead e na negociação.
 */
export async function onDealLinkedToLead(p: { tenantId: string; leadId: string; dealId: string; actor: Actor }) {
  const [deal, lead] = await Promise.all([
    prisma.deal.findFirst({
      where: { id: p.dealId, tenantId: p.tenantId },
      select: { id: true, dealNumber: true, type: true, status: true, unitId: true, vehicles: { select: { vehicleId: true, role: true, brand: true, model: true, year: true, plate: true, agreedValue: true } } },
    }),
    prisma.marketingLead.findFirst({ where: { id: p.leadId, tenantId: p.tenantId }, select: { id: true, leadNumber: true, name: true } }),
  ])
  if (!deal || !lead) return
  await syncDealVehiclesToLead(deal.id, lead.id, p.tenantId)

  const lines: string[] = []
  for (const dv of deal.vehicles) {
    const value = dv.agreedValue ? ` — ${Number(dv.agreedValue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''
    lines.push(`Veículo ${ROLE_LABEL[dv.role] ?? dv.role.toLowerCase()}: ${carLabel(dv)}${value}`)
    if (ENTERING_ROLES.includes(dv.role)) {
      const evaluationId = await findEnteringEvaluation(p.tenantId, deal.id, dv).catch(() => null)
      if (evaluationId) await linkEvaluationToLeads(p.tenantId, evaluationId, [lead.id], p.actor)
    }
  }
  const number = deal.dealNumber ?? `NEG-${deal.id.slice(-8)}`
  const status = String(deal.status).toLowerCase().replace(/_/g, ' ')
  await logOnLeads(p.tenantId, [lead.id], {
    type: 'NEGOTIATION', actor: p.actor,
    summary: [`Negociação ${number} vinculada (${String(deal.type).toLowerCase()}, ${status}).`, ...lines].join('\n'),
  })
  await createDealAudit(prisma as never, {
    dealId: deal.id, tenantId: p.tenantId, unitId: deal.unitId, userId: p.actor.id ?? undefined, userName: p.actor.name ?? 'Sistema', userRole: p.actor.role ?? undefined,
    action: 'VINCULAR_LEAD', field: 'lead', newValue: `Lead #${lead.leadNumber ?? lead.id.slice(-6)} — ${lead.name ?? ''}`.trim(),
  }).catch(() => {})
}
