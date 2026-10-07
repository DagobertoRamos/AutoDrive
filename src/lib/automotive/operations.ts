// =============================================================================
// TRANSACTION ORCHESTRATOR — operação veicular (TXN) e suas dimensões.
// Liga negociação ↔ veículo ↔ fiscal ↔ RENAVE ↔ transferência ↔ F&I sem mexer
// nos fluxos que já funcionam: as rotas existentes só publicam eventos
// (events.ts) e este módulo mantém as operações em dia. Toda mudança de
// dimensão grava um OperationEvent (antes/depois, quem, origem).
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { dealBalanceOf, reconciliationOf } from '@/lib/negotiation-service'
import { operationRequirements } from './capabilities'
import { opsContext } from './config'
import { commercialFromDeal, deriveFinancing, kindForRole, mergeFinancing, renaveStockState, fiscalEntryState } from './orchestrator-core'
import { DIMENSION_LABEL, dimensionText } from './status-core'

export interface Actor { id?: string | null; name?: string | null; role?: string | null }
export const SYSTEM_ACTOR: Actor = { id: null, name: 'Sistema' }

type Db = Prisma.TransactionClient | typeof prisma

export class OpsError extends Error {
  constructor(message: string, public status = 409, public details: unknown = null) {
    super(message)
    this.name = 'OpsError'
  }
}

// ── Código TXN ──────────────────────────────────────────────────────────────

export async function nextOperationCode(db: Db = prisma, now = new Date()): Promise<string> {
  const year = now.getFullYear()
  const key = `TXN-${year}`
  const rows = await db.$queryRaw<{ value: number }[]>`
    INSERT INTO "operation_sequences" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "operation_sequences"."value" + 1
    RETURNING "value"`
  return `${key}-${String(Number(rows[0]?.value ?? 1)).padStart(7, '0')}`
}

// ── Linha do tempo ──────────────────────────────────────────────────────────

export interface EventInput {
  tenantId: string
  vehicleId?: string | null
  operationId?: string | null
  type: string
  title: string
  detail?: string | null
  actor?: Actor
  origin?: 'USER' | 'SYSTEM' | 'PROVIDER' | 'WEBHOOK' | 'JOB'
  providerId?: string | null
  externalOperationId?: string | null
  requestId?: string | null
  before?: unknown
  after?: unknown
  technical?: boolean
}

export async function recordEvent(e: EventInput, db: Db = prisma): Promise<void> {
  await db.operationEvent.create({
    data: {
      tenantId: e.tenantId, vehicleId: e.vehicleId ?? null, operationId: e.operationId ?? null,
      type: e.type, title: e.title.slice(0, 300), detail: e.detail?.slice(0, 2000) ?? null,
      actorId: e.actor?.id ?? null, actorName: e.actor?.name ?? null,
      origin: e.origin ?? (e.actor?.id ? 'USER' : 'SYSTEM'),
      providerId: e.providerId ?? null, externalOperationId: e.externalOperationId ?? null, requestId: e.requestId ?? null,
      beforeData: (e.before ?? undefined) as Prisma.InputJsonValue | undefined,
      afterData: (e.after ?? undefined) as Prisma.InputJsonValue | undefined,
      technical: e.technical ?? false,
    },
  })
}

// ── Dimensões ───────────────────────────────────────────────────────────────

const DIMENSIONS = ['commercialStatus', 'financialStatus', 'fiscalStatus', 'renaveStatus', 'transferStatus', 'inspectionStatus', 'restrictionStatus', 'documentStatus', 'financingStatus'] as const
type DimensionKey = typeof DIMENSIONS[number]
export type OperationPatch = Partial<Record<DimensionKey, string>> & Partial<Pick<Prisma.VehicleOperationUncheckedUpdateInput,
  'transferStage' | 'renaveProviderId' | 'renaveCycleId' | 'fiscalDocumentId' | 'bankContractRef' | 'closedAt' | 'cancelledAt' | 'cancelReason' | 'dealId' | 'dealVehicleId' | 'parentId' | 'customerId'>>

/**
 * Aplica mudanças na operação e registra o que mudou. Sem mudança, não grava
 * nada (idempotente). `title` substitui o texto automático do evento.
 */
export async function applyToOperation(opId: string, patch: OperationPatch, meta: { actor?: Actor; title?: string; type?: string; origin?: EventInput['origin']; providerId?: string | null; externalOperationId?: string | null; detail?: string | null }, db: Db = prisma) {
  const op = await db.vehicleOperation.findUnique({ where: { id: opId } })
  if (!op) throw new OpsError('Operação não encontrada.', 404)
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    const cur = (op as Record<string, unknown>)[k]
    const same = cur instanceof Date && v instanceof Date ? cur.getTime() === v.getTime() : cur === v
    if (!same) { before[k] = cur ?? null; after[k] = v }
  }
  if (!Object.keys(after).length) return op
  const updated = await db.vehicleOperation.update({ where: { id: opId }, data: after as Prisma.VehicleOperationUncheckedUpdateInput })
  const dimChanges = Object.keys(after).filter((k) => (DIMENSIONS as readonly string[]).includes(k))
  const auto = dimChanges.map((k) => `${DIMENSION_LABEL[k]}: ${dimensionText(k, String(after[k]))}`).join(' · ')
  if (meta.title || auto) {
    await recordEvent({
      tenantId: op.tenantId, vehicleId: op.vehicleId, operationId: op.id,
      type: meta.type ?? 'OPERATION_UPDATED', title: meta.title ?? auto, detail: meta.detail,
      actor: meta.actor, origin: meta.origin, providerId: meta.providerId, externalOperationId: meta.externalOperationId,
      before, after,
    }, db)
  }
  return updated
}

// ── Restrições e documentos (derivados do veículo) ──────────────────────────

export async function restrictionStatusOf(vehicleId: string, db: Db = prisma): Promise<'CLEAR' | 'WARNING' | 'BLOCKED'> {
  const rows = await db.vehicleRestriction.findMany({ where: { vehicleId, status: 'ACTIVE' }, select: { blocking: true } })
  return rows.some((r) => r.blocking) ? 'BLOCKED' : rows.length ? 'WARNING' : 'CLEAR'
}

/** CRLV anexado (avaliação do carro ou negociação)? */
export async function hasCrlv(vehicleId: string): Promise<boolean> {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { originEvaluationId: true, tenantId: true, plate: true } })
  if (!v) return false
  const evalIds = (await prisma.vehicleEvaluation.findMany({
    where: { OR: [{ vehicleId }, ...(v.originEvaluationId ? [{ id: v.originEvaluationId }] : []), ...(v.plate ? [{ plate: v.plate, tenantId: v.tenantId ?? undefined }] : [])] },
    select: { id: true },
  })).map((e) => e.id)
  if (evalIds.length) {
    const n = await prisma.evaluationAttachment.count({ where: { evaluationId: { in: evalIds }, category: { in: ['CRLV', 'DUT_CRV'] } } }).catch(() => 0)
    if (n > 0) return true
  }
  return false
}

/** Recalcula restrição em todas as operações abertas do veículo. */
export async function refreshVehicleRestriction(vehicleId: string, actor: Actor): Promise<void> {
  const status = await restrictionStatusOf(vehicleId)
  const ops = await prisma.vehicleOperation.findMany({ where: { vehicleId, cancelledAt: null, closedAt: null }, select: { id: true } })
  for (const op of ops) await applyToOperation(op.id, { restrictionStatus: status }, { actor })
}

// ── Operação de entrada sem negociação (avaliação → estoque, estoque antigo) ─

/**
 * Operação de entrada aberta do carro (compra/consignação). Cria se não houver,
 * com trava por veículo para dois cliques não criarem duas.
 */
export async function ensureIntakeOperation(vehicleId: string, actor: Actor) {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, tenantId: true, unitId: true, stockType: true, customerId: true } })
  if (!v?.tenantId) throw new OpsError('Veículo sem loja.', 400)
  const kind = v.stockType === 'CONSIGNADO' ? 'CONSIGNMENT' : 'PURCHASE'
  const { cfg, caps } = await opsContext(v.tenantId, v.unitId)
  const req = operationRequirements(kind, cfg, caps)
  const [restriction, crlv] = await Promise.all([restrictionStatusOf(vehicleId), hasCrlv(vehicleId)])
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'intake:' + vehicleId}))`
    const open = await tx.vehicleOperation.findFirst({ where: { vehicleId, kind: { in: ['PURCHASE', 'CONSIGNMENT'] }, cancelledAt: null }, orderBy: { createdAt: 'desc' } })
    // Já existe entrada depois da última venda? Reusa.
    if (open) {
      const laterSale = await tx.vehicleOperation.findFirst({ where: { vehicleId, kind: 'SALE', cancelledAt: null, createdAt: { gt: open.createdAt } }, select: { id: true } })
      if (!laterSale) return open
    }
    const op = await tx.vehicleOperation.create({
      data: {
        tenantId: v.tenantId!, code: await nextOperationCode(tx), kind, vehicleId, unitId: v.unitId, customerId: v.customerId,
        commercialStatus: 'ACQUIRED', financialStatus: 'NOT_APPLICABLE',
        renaveStatus: req.renave ? 'PENDING' : 'NOT_REQUIRED', fiscalStatus: req.fiscal ? 'PENDING' : 'NOT_REQUIRED',
        transferStatus: 'NOT_APPLICABLE', restrictionStatus: restriction, documentStatus: crlv ? 'COMPLETE' : 'PENDING',
        renaveProviderId: req.renave ? cfg.providers.renave : null, createdById: actor.id ?? null,
      },
    })
    await recordEvent({ tenantId: op.tenantId, vehicleId, operationId: op.id, type: 'OPERATION_CREATED', title: `${kind === 'CONSIGNMENT' ? 'Consignação' : 'Entrada'} ${op.code} criada.`, actor }, tx)
    return op
  })
}

// ── Operações da negociação ─────────────────────────────────────────────────

const dealInclude = {
  vehicles: { select: { id: true, vehicleId: true, role: true, agreedValue: true } },
  debts: true, services: true, payments: true, discountRequests: true, changes: true,
} satisfies Prisma.DealInclude

/**
 * Cria/atualiza as operações de cada veículo da negociação. Troca = duas
 * operações ligadas (venda do carro da loja + entrada do carro do cliente).
 */
export async function syncDealOperations(dealId: string, actor: Actor = SYSTEM_ACTOR) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: dealInclude })
  if (!deal?.tenantId) return []
  const { cfg, caps } = await opsContext(deal.tenantId, deal.unitId)

  // Pagamento (conciliação) e F&I.
  let financial: string = 'PENDING'
  try {
    const rec = reconciliationOf(dealBalanceOf(deal).summary)
    financial = rec.situacao === 'CONCILIADO' || rec.situacao === 'SEM_VALOR' ? 'PAID' : rec.conciliado > 0 ? 'PARTIAL' : 'PENDING'
  } catch { /* mantém PENDING */ }
  const finPayments = deal.payments.filter((p) => String(p.type).toUpperCase() === 'FINANCIAMENTO')
  const [tracks, chargebacks] = finPayments.length
    ? await Promise.all([
        prisma.financeContractTrack.findMany({ where: { paymentId: { in: finPayments.map((p) => p.id) } }, select: { paymentId: true, stage: true } }).catch(() => []),
        prisma.financialEntry.findMany({ where: { dealId, source: { in: finPayments.map((p) => `NEG_CHARGEBACK_${p.id}`) }, status: { not: 'CANCELADO' } }, select: { source: true } }).catch(() => []),
      ])
    : [[], []]
  const financing = deriveFinancing(finPayments.map((p) => ({
    type: p.type, status: p.status, stage: tracks.find((t) => t.paymentId === p.id)?.stage ?? null,
    chargeback: chargebacks.some((c) => c.source === `NEG_CHARGEBACK_${p.id}`),
  })))

  const result = []
  let saleOpId: string | null = null
  const ordered = [...deal.vehicles].sort((a, b) => (a.role === 'VENDIDO' ? -1 : b.role === 'VENDIDO' ? 1 : 0))
  for (const dv of ordered) {
    const kind = kindForRole(dv.role)
    if (!kind || !dv.vehicleId) continue
    const commercial = commercialFromDeal(deal.status, kind)
    const vehicle = await prisma.vehicle.findUnique({ where: { id: dv.vehicleId }, select: { stockType: true, unitId: true } })
    const req = operationRequirements(kind, cfg, caps, { consigned: kind === 'SALE' && vehicle?.stockType === 'CONSIGNADO' })
    const cancelled = commercial === 'CANCELLED'
    let op = await prisma.vehicleOperation.findUnique({ where: { dealVehicleId_kind: { dealVehicleId: dv.id, kind } } })

    // Carro de entrada que já tinha operação aberta (veio pela avaliação): adota.
    if (!op && kind !== 'SALE') {
      const intake = await prisma.vehicleOperation.findFirst({ where: { vehicleId: dv.vehicleId, kind, dealVehicleId: null, cancelledAt: null }, orderBy: { createdAt: 'desc' } })
      if (intake) op = await applyToOperation(intake.id, { dealId, dealVehicleId: dv.id, customerId: deal.customerId ?? undefined }, { actor, title: `Entrada vinculada à negociação ${deal.dealNumber ?? ''}`.trim() })
    }

    if (!op) {
      if (cancelled) continue // negociação morta antes de existir operação: nada a acompanhar
      const restriction = await restrictionStatusOf(dv.vehicleId)
      try {
        op = await prisma.$transaction(async (tx) => {
          const created = await tx.vehicleOperation.create({
            data: {
              tenantId: deal.tenantId!, code: await nextOperationCode(tx), kind, vehicleId: dv.vehicleId!, dealId, dealVehicleId: dv.id,
              customerId: deal.customerId, unitId: deal.unitId ?? vehicle?.unitId ?? null,
              commercialStatus: commercial,
              financialStatus: kind === 'SALE' ? financial : 'NOT_APPLICABLE',
              fiscalStatus: req.fiscal ? 'PENDING' : 'NOT_REQUIRED',
              renaveStatus: req.renave ? 'PENDING' : 'NOT_REQUIRED',
              transferStatus: req.transfer ? 'PENDING' : 'NOT_APPLICABLE',
              financingStatus: kind === 'SALE' ? financing : 'NOT_APPLICABLE',
              restrictionStatus: restriction,
              documentStatus: 'PENDING',
              renaveProviderId: req.renave ? cfg.providers.renave : null,
              closedAt: null, createdById: actor.id ?? null,
            },
          })
          await recordEvent({ tenantId: created.tenantId, vehicleId: created.vehicleId, operationId: created.id, type: 'OPERATION_CREATED', title: `${kind === 'SALE' ? 'Venda' : kind === 'CONSIGNMENT' ? 'Consignação' : 'Entrada'} ${created.code} criada.`, actor }, tx)
          return created
        })
      } catch (err) {
        // Corrida (dois eventos ao mesmo tempo): a outra chamada criou.
        if ((err as { code?: string }).code !== 'P2002') throw err
        op = await prisma.vehicleOperation.findUnique({ where: { dealVehicleId_kind: { dealVehicleId: dv.id, kind } } })
        if (!op) throw err
      }
    } else {
      op = await applyToOperation(op.id, {
        commercialStatus: commercial,
        ...(kind === 'SALE' ? { financialStatus: financial, financingStatus: mergeFinancing(op.financingStatus, financing) } : {}),
        ...(cancelled && !op.cancelledAt ? { cancelledAt: new Date(), cancelReason: deal.cancelledReason ?? null } : {}),
        ...(!cancelled && op.cancelledAt ? { cancelledAt: null, cancelReason: null } : {}),
      }, { actor })
    }
    if (kind === 'SALE') saleOpId = op.id
    else if (saleOpId && op.parentId !== saleOpId) op = await applyToOperation(op.id, { parentId: saleOpId }, { actor })
    result.push(op)
  }
  return result
}

// ── Leitura agregada do veículo ─────────────────────────────────────────────

export async function vehicleRenaveFacts(vehicleId: string) {
  const ops = await prisma.vehicleOperation.findMany({ where: { vehicleId }, select: { kind: true, renaveStatus: true, fiscalStatus: true, createdAt: true, cancelledAt: true } })
  return { renave: renaveStockState(ops), fiscalEntry: fiscalEntryState(ops), hasOps: ops.length > 0 }
}
