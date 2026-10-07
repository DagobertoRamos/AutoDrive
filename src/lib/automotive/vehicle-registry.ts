// =============================================================================
// Compliance do veículo: restrições/gravame, vistorias, contrato de
// consignação e transferência entre lojas. Nada é apagado: resolver,
// cancelar e recusar ficam registrados na linha do tempo.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { notifyMany } from '@/services/notification.service'
import { opsContext } from './config'
import { applyToOperation, nextOperationCode, OpsError, recordEvent, refreshVehicleRestriction, type Actor } from './operations'
import { operationRequirements } from './capabilities'
import { restrictionKindText } from './readiness-core'
import { computePayout, payoutDueDate, payoutStatusFrom } from './consignment-core'
import { ensureVehicleCategory, sourceOf } from '@/lib/stock/vehicle-ledger'

const RESTRICTION_KINDS = new Set(['JUDICIAL', 'ROUBO_FURTO', 'ADMINISTRATIVA', 'TRIBUTARIA', 'RENAJUD', 'GRAVAME', 'OUTRA'])
/** Tipos que, por natureza, impedem a venda. */
const ALWAYS_BLOCKING = new Set(['JUDICIAL', 'ROUBO_FURTO', 'RENAJUD'])
const INSPECTION_TYPES = new Set(['VISTORIA_TRANSFERENCIA', 'LAUDO_ECV', 'CAUTELAR', 'OUTRA'])
const INSPECTION_STATUS = new Set(['VALID', 'PENDING', 'REJECTED'])

const str = (v: unknown, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const dateOf = (v: unknown) => (typeof v === 'string' && v && !isNaN(Date.parse(v)) ? new Date(v) : null)

async function vehicleOf(vehicleId: string, tenantId: string | null) {
  const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, ...(tenantId ? { tenantId } : {}) }, select: { id: true, tenantId: true, unitId: true, brand: true, model: true, plate: true, stockStatus: true, stockType: true } })
  if (!v?.tenantId) throw new OpsError('Veículo não encontrado.', 404)
  return v as typeof v & { tenantId: string }
}

// ── Restrições ──────────────────────────────────────────────────────────────

export async function addRestriction(vehicleId: string, tenantId: string | null, b: Record<string, unknown>, actor: Actor) {
  const v = await vehicleOf(vehicleId, tenantId)
  const kind = String(b.kind ?? '').toUpperCase()
  if (!RESTRICTION_KINDS.has(kind)) throw new OpsError('Tipo de restrição inválido.', 400)
  const blocking = ALWAYS_BLOCKING.has(kind) ? true : b.blocking !== false
  const r = await prisma.vehicleRestriction.create({
    data: { tenantId: v.tenantId, vehicleId, kind, blocking, description: str(b.description, 500), reference: str(b.reference, 80), institution: str(b.institution, 120), source: 'MANUAL', createdById: actor.id ?? null },
  })
  await recordEvent({ tenantId: v.tenantId, vehicleId, type: 'RESTRICTION_ADDED', title: `${restrictionKindText(kind)} registrada${blocking ? ' (impede a venda)' : ''}.`, detail: r.description, actor, after: { kind, blocking } })
  await refreshVehicleRestriction(vehicleId, actor)
  return r
}

export async function resolveRestriction(restrictionId: string, tenantId: string | null, resolution: string, actor: Actor) {
  const r = await prisma.vehicleRestriction.findFirst({ where: { id: restrictionId, ...(tenantId ? { tenantId } : {}) } })
  if (!r) throw new OpsError('Restrição não encontrada.', 404)
  if (r.status === 'RESOLVED') return r
  if (!resolution?.trim()) throw new OpsError('Informe como a restrição foi resolvida.', 400)
  const done = await prisma.vehicleRestriction.updateMany({ where: { id: r.id, status: 'ACTIVE' }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: actor.id ?? null, resolution: resolution.trim().slice(0, 500) } })
  if (done.count) {
    await recordEvent({ tenantId: r.tenantId, vehicleId: r.vehicleId, type: 'RESTRICTION_RESOLVED', title: `${restrictionKindText(r.kind)} baixada.`, detail: resolution, actor })
    await refreshVehicleRestriction(r.vehicleId, actor)
  }
  return prisma.vehicleRestriction.findUnique({ where: { id: r.id } })
}

// ── Vistorias ───────────────────────────────────────────────────────────────

export async function addInspection(vehicleId: string, tenantId: string | null, b: Record<string, unknown>, actor: Actor) {
  const v = await vehicleOf(vehicleId, tenantId)
  const type = String(b.type ?? '').toUpperCase()
  const status = String(b.status ?? 'VALID').toUpperCase()
  if (!INSPECTION_TYPES.has(type)) throw new OpsError('Tipo de vistoria inválido.', 400)
  if (!INSPECTION_STATUS.has(status)) throw new OpsError('Resultado inválido.', 400)
  const performedAt = dateOf(b.performedAt)
  if (!performedAt) throw new OpsError('Informe a data da vistoria.', 400)
  const validUntil = dateOf(b.validUntil)
  if (validUntil && validUntil < performedAt) throw new OpsError('A validade não pode ser antes da data da vistoria.', 400)
  const i = await prisma.vehicleInspection.create({
    data: { tenantId: v.tenantId, vehicleId, type, status, company: str(b.company, 120), performedAt, validUntil, protocol: str(b.protocol, 80), fileId: str(b.fileId, 40), notes: str(b.notes, 500), createdById: actor.id ?? null },
  })
  const label = type === 'LAUDO_ECV' ? 'Laudo ECV' : type === 'CAUTELAR' ? 'Cautelar' : 'Vistoria'
  await recordEvent({ tenantId: v.tenantId, vehicleId, type: 'INSPECTION_ADDED', title: `${label} registrada: ${status === 'VALID' ? 'aprovada' : status === 'REJECTED' ? 'reprovada' : 'pendente'}.`, actor })
  const opStatus = status === 'VALID' ? 'VALID' : status === 'REJECTED' ? 'REJECTED' : 'PENDING'
  const ops = await prisma.vehicleOperation.findMany({ where: { vehicleId, cancelledAt: null, closedAt: null, inspectionStatus: { not: 'NOT_REQUIRED' } }, select: { id: true } })
  for (const op of ops) await applyToOperation(op.id, { inspectionStatus: opStatus }, { actor })
  return i
}

export async function cancelInspection(inspectionId: string, tenantId: string | null, actor: Actor) {
  const i = await prisma.vehicleInspection.findFirst({ where: { id: inspectionId, ...(tenantId ? { tenantId } : {}) } })
  if (!i) throw new OpsError('Vistoria não encontrada.', 404)
  if (i.cancelledAt) return i
  const u = await prisma.vehicleInspection.update({ where: { id: i.id }, data: { cancelledAt: new Date() } })
  await recordEvent({ tenantId: i.tenantId, vehicleId: i.vehicleId, type: 'INSPECTION_CANCELLED', title: 'Registro de vistoria anulado.', actor })
  return u
}

// ── Consignação ─────────────────────────────────────────────────────────────

export async function saveConsignment(vehicleId: string, tenantId: string | null, b: Record<string, unknown>, actor: Actor) {
  const v = await vehicleOf(vehicleId, tenantId)
  if (v.stockType !== 'CONSIGNADO') throw new OpsError('O veículo não é consignado.', 409)
  const ownerName = str(b.ownerName, 160)
  if (!ownerName) throw new OpsError('Informe o proprietário.', 400)
  const num = (x: unknown) => (x === '' || x == null ? null : Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : NaN)
  const minPrice = num(b.minPrice)
  const commissionValue = num(b.commissionValue)
  if (Number.isNaN(minPrice) || Number.isNaN(commissionValue)) throw new OpsError('Valor inválido.', 400)
  const commissionType = ['PERCENT', 'FIXED', 'DIFFERENCE'].includes(String(b.commissionType)) ? String(b.commissionType) : 'PERCENT'
  if (commissionType === 'PERCENT' && commissionValue != null && commissionValue > 100) throw new OpsError('Comissão acima de 100%.', 400)
  const endsAt = dateOf(b.endsAt)
  const payoutDays = b.payoutDays === '' || b.payoutDays == null ? null : Math.round(Number(b.payoutDays))
  if (payoutDays != null && (!Number.isFinite(payoutDays) || payoutDays < 0 || payoutDays > 365)) throw new OpsError('Prazo de repasse inválido.', 400)
  const data = { ownerName, ownerDoc: str(b.ownerDoc, 20), ownerPhone: str(b.ownerPhone, 20), minPrice, commissionType, commissionValue, endsAt, payoutDays, notes: str(b.notes, 1000) }
  const current = await prisma.consignmentContract.findFirst({ where: { vehicleId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } })
  const saved = current
    ? await prisma.consignmentContract.update({ where: { id: current.id }, data })
    : await prisma.consignmentContract.create({ data: { ...data, tenantId: v.tenantId, vehicleId, createdById: actor.id ?? null } })
  await recordEvent({ tenantId: v.tenantId, vehicleId, type: current ? 'CONSIGNMENT_UPDATED' : 'CONSIGNMENT_CREATED', title: current ? 'Contrato de consignação atualizado.' : 'Contrato de consignação registrado.', actor, before: current ? { minPrice: current.minPrice, commissionValue: current.commissionValue, endsAt: current.endsAt } : undefined, after: { minPrice, commissionValue, endsAt } })
  return saved
}

/**
 * Consignação vinda da negociação: os termos (mínimo, %, prazo) já estão no
 * Deal — o contrato é criado a partir deles, não digitado de novo.
 */
export async function ensureConsignmentFromDeal(dealId: string, actor: Actor) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { tenantId: true, type: true, consignMinValue: true, consignCommPct: true, consignDeadline: true, customer: { select: { name: true, cpf: true, phone: true } }, vehicles: { where: { role: 'CONSIGNADO' }, select: { vehicleId: true } } },
  })
  if (!deal?.tenantId || deal.type !== 'CONSIGNACAO') return
  for (const dv of deal.vehicles) {
    if (!dv.vehicleId) continue
    const exists = await prisma.consignmentContract.findFirst({ where: { vehicleId: dv.vehicleId, status: 'ACTIVE' }, select: { id: true } })
    if (exists) continue
    await prisma.consignmentContract.create({
      data: {
        tenantId: deal.tenantId, vehicleId: dv.vehicleId, ownerName: deal.customer?.name ?? 'Proprietário', ownerDoc: deal.customer?.cpf ?? null, ownerPhone: deal.customer?.phone ?? null,
        minPrice: deal.consignMinValue ?? null, commissionType: 'PERCENT', commissionValue: deal.consignCommPct ?? null, endsAt: deal.consignDeadline ?? null, createdById: actor.id ?? null,
      },
    })
    await recordEvent({ tenantId: deal.tenantId, vehicleId: dv.vehicleId, type: 'CONSIGNMENT_CREATED', title: 'Contrato de consignação registrado a partir da negociação.', actor })
  }
}

const REPASSE_SOURCE = sourceOf('REPASSE')

/**
 * Consignado vendido: calcula o repasse pelo contrato, ajusta o lançamento
 * "Repasse ao proprietário" (valor + vencimento) e liga contrato ↔ financeiro.
 * Lançamento já pago (total ou em parte) nunca é alterado — vira aviso.
 */
export async function settleConsignmentOnSale(vehicleId: string, saleDealId: string, actor: Actor) {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { tenantId: true, unitId: true, plate: true, brand: true, model: true, purchasePrice: true, stockType: true } })
  if (!v?.tenantId || v.stockType !== 'CONSIGNADO') return null
  const c = await prisma.consignmentContract.findFirst({ where: { vehicleId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } })
  if (!c) {
    await recordEvent({ tenantId: v.tenantId, vehicleId, type: 'CONSIGNMENT_MISSING', title: 'Consignado vendido sem contrato de consignação registrado.', actor })
    return null
  }
  const dv = await prisma.dealVehicle.findFirst({ where: { dealId: saleDealId, vehicleId, role: 'VENDIDO' }, select: { agreedValue: true } })
  const salePrice = dv?.agreedValue != null ? Number(dv.agreedValue) : 0
  const calc = computePayout({ salePrice, commissionType: c.commissionType, commissionValue: c.commissionValue != null ? Number(c.commissionValue) : null, minPrice: c.minPrice != null ? Number(c.minPrice) : null, fallback: v.purchasePrice != null ? Number(v.purchasePrice) : null })
  const soldAt = new Date()
  const dueAt = payoutDueDate(soldAt, c.payoutDays)
  const label = [v.plate, [v.brand, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')

  const entries = await prisma.financialEntry.findMany({ where: { vehicleId, source: { startsWith: REPASSE_SOURCE }, status: { not: 'CANCELADO' } }, select: { id: true, status: true, amount: true, parentEntryId: true } })
  const title = entries.find((e) => !e.parentEntryId)
  const touched = entries.some((e) => e.parentEntryId) || title?.status === 'PAGO'
  let entryId = title?.id ?? null
  if (!title) {
    const created = await prisma.financialEntry.create({
      data: {
        tenantId: v.tenantId, unitId: v.unitId, vehicleId, type: 'DESPESA', status: 'PREVISTO', source: REPASSE_SOURCE,
        categoryId: await ensureVehicleCategory(v.tenantId, 'REPASSE', 'DESPESA'),
        description: `Repasse ao proprietário — ${label}`, amount: calc.payout, competenceDate: soldAt, dueDate: dueAt,
        counterparty: c.ownerName, createdById: actor.id ?? null,
      },
      select: { id: true },
    })
    entryId = created.id
  } else if (!touched) {
    await prisma.financialEntry.update({ where: { id: title.id }, data: { amount: calc.payout, dueDate: dueAt, competenceDate: soldAt, counterparty: c.ownerName, description: `Repasse ao proprietário — ${label}` } })
  }
  const done = await prisma.consignmentContract.updateMany({
    where: { id: c.id, status: 'ACTIVE' },
    data: { status: 'SOLD', payoutStatus: touched ? payoutStatusFrom(entries.map((e) => ({ ...e, amount: Number(e.amount) })), calc.payout) : 'PENDING', payoutAmount: calc.payout, payoutDueAt: dueAt, payoutEntryId: entryId, salePrice, soldAt, saleDealId },
  })
  if (!done.count) return null
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  await recordEvent({ tenantId: v.tenantId, vehicleId, type: 'CONSIGNMENT_SOLD', title: `Consignado vendido: repasse de ${brl(calc.payout)} ao proprietário até ${dueAt.toLocaleDateString('pt-BR')}.`, actor, after: { salePrice, payout: calc.payout, storeShare: calc.storeShare } })
  if (calc.belowMinimum) await recordEvent({ tenantId: v.tenantId, vehicleId, type: 'CONSIGNMENT_BELOW_MIN', title: 'Venda abaixo do valor mínimo combinado com o proprietário.', actor })
  if (touched) await recordEvent({ tenantId: v.tenantId, vehicleId, type: 'CONSIGNMENT_PAYOUT_LOCKED', title: 'O repasse já tinha pagamento registrado; o valor não foi alterado. Confira no financeiro.', actor })
  return { payout: calc.payout, dueAt }
}

/** Venda do consignado cancelada: contrato volta a ativo e o repasse deixa de vencer. */
export async function revertConsignmentSale(saleDealId: string, actor: Actor) {
  const list = await prisma.consignmentContract.findMany({ where: { saleDealId, status: 'SOLD' } })
  for (const c of list) {
    const entries = c.payoutEntryId ? await prisma.financialEntry.findMany({ where: { OR: [{ id: c.payoutEntryId }, { parentEntryId: c.payoutEntryId }], status: { not: 'CANCELADO' } }, select: { id: true, status: true, parentEntryId: true } }) : []
    const paid = entries.some((e) => e.parentEntryId || e.status === 'PAGO')
    if (!paid && c.payoutEntryId) {
      const v = await prisma.vehicle.findUnique({ where: { id: c.vehicleId }, select: { purchasePrice: true } })
      const back = c.minPrice ?? v?.purchasePrice ?? c.payoutAmount
      await prisma.financialEntry.updateMany({ where: { id: c.payoutEntryId, status: 'PREVISTO' }, data: { dueDate: null, ...(back != null ? { amount: back } : {}) } })
    }
    await prisma.consignmentContract.update({ where: { id: c.id }, data: { status: 'ACTIVE', payoutStatus: 'PENDING', payoutAmount: null, payoutDueAt: null, salePrice: null, soldAt: null, saleDealId: null } })
    await recordEvent({ tenantId: c.tenantId, vehicleId: c.vehicleId, type: 'CONSIGNMENT_SALE_REVERTED', title: paid ? 'Venda cancelada, mas o repasse já tinha sido pago: trate a devolução no financeiro.' : 'Venda cancelada: a consignação volta a ficar ativa e o repasse deixa de vencer.', actor })
  }
  return list.length
}

/** Job: atualiza a situação do repasse pelo financeiro (pago / pago em parte). */
export async function syncConsignmentPayouts(tenantId: string) {
  const sold = await prisma.consignmentContract.findMany({ where: { tenantId, status: 'SOLD', payoutStatus: { in: ['PENDING', 'PARTIAL'] }, payoutEntryId: { not: null } } })
  let changed = 0
  for (const c of sold) {
    const entries = await prisma.financialEntry.findMany({ where: { OR: [{ id: c.payoutEntryId! }, { parentEntryId: c.payoutEntryId! }], status: { not: 'CANCELADO' } }, select: { status: true, amount: true, parentEntryId: true } })
    const st = payoutStatusFrom(entries.map((e) => ({ ...e, amount: Number(e.amount) })), Number(c.payoutAmount ?? 0))
    if (st === c.payoutStatus) continue
    await prisma.consignmentContract.update({ where: { id: c.id }, data: { payoutStatus: st } })
    await recordEvent({ tenantId, vehicleId: c.vehicleId, type: 'CONSIGNMENT_PAYOUT', title: st === 'PAID' ? 'Repasse ao proprietário pago.' : 'Repasse ao proprietário pago em parte.', origin: 'JOB', actor: { id: null, name: 'Sistema' } })
    changed++
  }
  return changed
}

export async function closeConsignment(vehicleId: string, status: 'SOLD' | 'RETURNED' | 'CANCELLED', actor: Actor) {
  const c = await prisma.consignmentContract.findFirst({ where: { vehicleId, status: 'ACTIVE' } })
  if (!c) return null
  const u = await prisma.consignmentContract.update({ where: { id: c.id }, data: { status, payoutStatus: status === 'SOLD' ? 'PENDING' : 'NOT_DUE' } })
  await recordEvent({ tenantId: c.tenantId, vehicleId, type: 'CONSIGNMENT_CLOSED', title: status === 'SOLD' ? 'Consignado vendido: repasse ao proprietário pendente.' : status === 'RETURNED' ? 'Consignado devolvido ao proprietário.' : 'Consignação cancelada.', actor })
  return u
}

// ── Transferência entre lojas ───────────────────────────────────────────────

export async function requestStoreTransfer(vehicleId: string, tenantId: string | null, toUnitId: string, reason: string | null, actor: Actor) {
  const v = await vehicleOf(vehicleId, tenantId)
  if (!toUnitId) throw new OpsError('Escolha a loja de destino.', 400)
  if (toUnitId === v.unitId) throw new OpsError('O veículo já está nesta loja.', 400)
  const unit = await prisma.unit.findFirst({ where: { id: toUnitId, tenantId: v.tenantId, active: true }, select: { id: true, name: true } })
  if (!unit) throw new OpsError('Loja de destino inválida.', 400)
  if (['VENDIDO', 'CANCELADO', 'DEVOLVIDO', 'RESERVADO', 'EM_NEGOCIACAO'].includes(String(v.stockStatus))) throw new OpsError('Veículo vendido ou em negociação não pode ser transferido.', 409)
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'store-transfer:' + vehicleId}))`
    const open = await tx.storeTransfer.findFirst({ where: { vehicleId, status: 'REQUESTED' } })
    if (open) throw new OpsError('Já existe uma transferência aguardando aceite.', 409)
    const t = await tx.storeTransfer.create({ data: { tenantId: v.tenantId, vehicleId, fromUnitId: v.unitId, toUnitId, reason: reason?.trim().slice(0, 300) || null, requestedById: actor.id ?? null } })
    await recordEvent({ tenantId: v.tenantId, vehicleId, type: 'STORE_TRANSFER_REQUESTED', title: `Transferência para ${unit.name} solicitada.`, actor }, tx)
    return t
  }).then(async (t) => {
    const managers = await prisma.user.findMany({ where: { tenantId: v.tenantId, status: 'ATIVO', role: { in: ['ADM', 'GERENTE_GERAL', 'GERENTE'] }, OR: [{ unitId: toUnitId }, { role: { in: ['ADM', 'GERENTE_GERAL'] } }] }, select: { id: true } })
    if (managers.length) await notifyMany({ userIds: managers.map((m) => m.id), tenantId: v.tenantId, type: 'SISTEMA', title: 'Transferência de veículo', message: `${v.brand} ${v.model} ${v.plate ?? ''} aguarda aceite em ${unit.name}.`, actionUrl: `/estoque/${vehicleId}`, metadata: { vehicleId, storeTransferId: t.id }, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'] }).catch(() => {})
    return t
  })
}

/** Aceite/recusa/cancelamento. Aceite move o estoque com origem registrada. */
export async function decideStoreTransfer(transferId: string, tenantId: string | null, decision: 'ACCEPT' | 'REJECT' | 'CANCEL', note: string | null, actor: Actor) {
  const t = await prisma.storeTransfer.findFirst({ where: { id: transferId, ...(tenantId ? { tenantId } : {}) } })
  if (!t) throw new OpsError('Transferência não encontrada.', 404)
  if (t.status !== 'REQUESTED') throw new OpsError('Esta transferência já foi decidida.', 409)
  if (decision === 'REJECT' && !note?.trim()) throw new OpsError('Informe o motivo da recusa.', 400)
  const status = decision === 'ACCEPT' ? 'ACCEPTED' : decision === 'REJECT' ? 'REJECTED' : 'CANCELLED'
  const [from, to] = await Promise.all([
    t.fromUnitId ? prisma.unit.findUnique({ where: { id: t.fromUnitId }, select: { name: true, cnpj: true } }) : null,
    prisma.unit.findUnique({ where: { id: t.toUnitId }, select: { name: true, cnpj: true } }),
  ])
  const result = await prisma.$transaction(async (tx) => {
    const lock = await tx.storeTransfer.updateMany({ where: { id: t.id, status: 'REQUESTED' }, data: { status, decidedById: actor.id ?? null, decidedAt: new Date(), decisionNote: note?.trim().slice(0, 300) || null } })
    if (lock.count !== 1) throw new OpsError('Esta transferência já foi decidida.', 409)
    if (decision !== 'ACCEPT') {
      await recordEvent({ tenantId: t.tenantId, vehicleId: t.vehicleId, type: `STORE_TRANSFER_${status}`, title: decision === 'REJECT' ? `Transferência para ${to?.name ?? 'outra loja'} recusada.` : 'Transferência entre lojas cancelada.', detail: note, actor }, tx)
      return null
    }
    const moved = await tx.vehicle.updateMany({ where: { id: t.vehicleId, unitId: t.fromUnitId }, data: { unitId: t.toUnitId } })
    if (moved.count !== 1) throw new OpsError('O veículo mudou de loja enquanto a transferência aguardava. Atualize a tela.', 409)
    // CNPJ diferente = operação fiscal/RENAVE entre estabelecimentos.
    const crossCnpj = !!from?.cnpj && !!to?.cnpj && from.cnpj.replace(/\D/g, '') !== to.cnpj.replace(/\D/g, '')
    const { cfg, caps } = await opsContext(t.tenantId, t.toUnitId)
    const req = operationRequirements('STORE_TRANSFER', cfg, caps)
    const op = await tx.vehicleOperation.create({
      data: {
        tenantId: t.tenantId, code: await nextOperationCode(tx), kind: 'STORE_TRANSFER', vehicleId: t.vehicleId, unitId: t.toUnitId,
        commercialStatus: 'CLOSED', financialStatus: 'NOT_APPLICABLE', transferStatus: 'NOT_APPLICABLE',
        fiscalStatus: crossCnpj && req.fiscal ? 'PENDING' : 'NOT_REQUIRED',
        renaveStatus: crossCnpj && req.renave ? 'PENDING' : 'NOT_REQUIRED',
        documentStatus: 'COMPLETE', createdById: actor.id ?? null,
      },
    })
    await tx.storeTransfer.update({ where: { id: t.id }, data: { operationId: op.id } })
    await tx.auditLog.create({ data: { tenantId: t.tenantId, userId: actor.id ?? null, userName: actor.name ?? null, userRole: actor.role ?? null, action: 'VEHICLE_STORE_TRANSFER', entity: 'Vehicle', entityId: t.vehicleId, beforeData: { unitId: t.fromUnitId } as never, afterData: { unitId: t.toUnitId, operation: op.code } as never } })
    await recordEvent({ tenantId: t.tenantId, vehicleId: t.vehicleId, operationId: op.id, type: 'STORE_TRANSFER_ACCEPTED', title: `Veículo transferido de ${from?.name ?? '—'} para ${to?.name ?? '—'} (${op.code}).`, actor, before: { unitId: t.fromUnitId }, after: { unitId: t.toUnitId } }, tx)
    return op
  })
  return { status, operation: result }
}
