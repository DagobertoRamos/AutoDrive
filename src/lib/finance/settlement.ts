// =============================================================================
// Baixas no banco: total, parcial, em lote e estorno (regras em settlement-core).
//   • Parcial → cria o lançamento filho PAGO/RECEBIDO (parentEntryId) e o
//     título fica PREVISTO com o saldo (vencimento pode ser renegociado).
//   • Total   → o próprio título vira PAGO/RECEBIDO; só então comissão e
//     pagamento da negociação acompanham (applyStatusSideEffects).
//   • Estorno → desfaz a última baixa (LIFO), devolvendo o principal ao saldo;
//     tudo com motivo no registro de auditoria.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { applyStatusSideEffects } from './entry-settlement'
import { noonUtc } from './recurrence-core'
import { partialBlockedReason, partialSource, planSettlement, principalOf } from './settlement-core'

export interface SettleTitleInput {
  paidDate: string // YYYY-MM-DD
  accountId?: string | null
  paymentMethod?: string | null
  /** Principal a abater (vazio = saldo inteiro). */
  principal?: number | null
  interest?: number | null
  discount?: number | null
  settleRemainderAsDiscount?: boolean
  /** Novo vencimento do saldo (só na parcial). */
  newDueDate?: string | null
  batchId?: string | null
  notes?: string | null
}

export interface Actor { id: string; name?: string | null; role?: string | null }

const todaySP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

async function audit(actor: Actor, tenantId: string | null, action: string, entityId: string, before: unknown, after: unknown) {
  await prisma.auditLog.create({
    data: { userId: actor.id, tenantId, action, entity: 'FinancialEntry', entityId, userName: actor.name ?? null, userRole: actor.role ?? null, status: 'SUCCESS', beforeData: before as never, afterData: after as never },
  }).catch(() => {})
}

/** Dá baixa (total ou parcial) num título PREVISTO. Retorna erro legível ou null. */
export async function settleTitle(tenantId: string | null, entryId: string, input: SettleTitleInput, actor: Actor): Promise<{ error: string } | { kind: 'FULL' | 'PARTIAL'; childId?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidDate)) return { error: 'Data da baixa inválida.' }
  if (input.paidDate > todaySP()) return { error: 'A data da baixa não pode ser futura.' }
  const e = await prisma.financialEntry.findFirst({ where: { id: entryId, ...(tenantId ? { tenantId } : {}) }, include: { _count: { select: { partials: true } } } })
  if (!e) return { error: 'Lançamento não encontrado.' }
  if (e.parentEntryId) return { error: 'Esta linha já é uma baixa.' }
  if (e.status === 'CANCELADO') return { error: 'Lançamento cancelado: reabra antes de dar baixa.' }
  if (e.status !== 'PREVISTO') return { error: 'Lançamento já quitado.' }
  if (e.transferGroupId) return { error: 'Transferência não tem baixa.' }
  if (e.commissionCalculationId) {
    const c = await prisma.commissionCalculation.findUnique({ where: { id: e.commissionCalculationId }, select: { status: true } })
    if (c?.status === 'CANCELADO') return { error: 'Comissão cancelada: não pode ser paga.' }
  }

  // Valor negativo (vale/débito de comissão): só quitação integral, sem juros/desconto.
  const amountNow = Number(e.amount)
  const plan = amountNow < 0
    ? (input.principal != null && Math.abs(Number(input.principal) - amountNow) > 0.005) || input.interest || input.discount
      ? { ok: false as const, error: 'Valor negativo (vale/débito): baixe o valor inteiro.' }
      : { ok: true as const, kind: 'FULL' as const, principal: amountNow, interest: 0, discount: 0, paid: amountNow, remainingAfter: 0 }
    : planSettlement({ remaining: amountNow, principal: input.principal, interest: input.interest, discount: input.discount, settleRemainderAsDiscount: input.settleRemainderAsDiscount })
  if (!plan.ok) return { error: plan.error }
  if (plan.kind === 'PARTIAL') {
    const blocked = partialBlockedReason(e)
    if (blocked) return { error: blocked }
  } else if ((e.commissionCalculationId || e.vehicleServiceId) && (plan.interest || plan.discount)) {
    // Valor vem de outro módulo: juros/desconto mudariam o custo apurado lá.
    return { error: e.commissionCalculationId ? 'Comissão: o valor vem do sistema de comissões.' : 'Custo de serviço: altere o valor na aba Serviços do veículo.' }
  }

  const paidDate = noonUtc(input.paidDate)
  const accountId = input.accountId !== undefined ? input.accountId || null : e.accountId
  const paymentMethod = input.paymentMethod !== undefined ? input.paymentMethod || null : e.paymentMethod
  const status = e.type === 'DESPESA' ? 'PAGO' : 'RECEBIDO'

  if (plan.kind === 'FULL') {
    await prisma.financialEntry.update({
      where: { id: e.id },
      data: {
        status, paidDate, amount: plan.paid, accountId, paymentMethod,
        interestAmount: plan.interest || null, discountAmount: plan.discount || null,
        settlementBatchId: input.batchId ?? null,
        ...(input.notes ? { notes: [e.notes, input.notes].filter(Boolean).join('\n').slice(0, 2000) } : {}),
      },
    })
    await applyStatusSideEffects(e, status, paidDate)
    await audit(actor, e.tenantId, 'FINANCE_SETTLE', e.id, { status: e.status, amount: Number(e.amount) }, { status, paid: plan.paid, principal: plan.principal, interest: plan.interest, discount: plan.discount, paidDate: input.paidDate, accountId, batchId: input.batchId ?? null })
    return { kind: 'FULL' }
  }

  const n = e._count.partials + 1
  const child = await prisma.$transaction(async (tx) => {
    const c = await tx.financialEntry.create({
      data: {
        tenantId: e.tenantId, unitId: e.unitId, accountId, categoryId: e.categoryId, costCenterId: e.costCenterId,
        type: e.type, status, description: `${e.description} — baixa parcial ${n}`.slice(0, 300),
        amount: plan.paid, interestAmount: plan.interest || null, discountAmount: plan.discount || null,
        dueDate: e.dueDate, paidDate, competenceDate: e.competenceDate ?? e.dueDate ?? paidDate,
        dealId: e.dealId, sellerId: e.sellerId, vehicleId: e.vehicleId, supplierId: e.supplierId, employeeUserId: e.employeeUserId,
        source: partialSource(e.source, n), counterparty: e.counterparty, documentNumber: e.documentNumber, paymentMethod,
        notes: input.notes ?? null, parentEntryId: e.id, settlementBatchId: input.batchId ?? null, createdById: actor.id,
      },
      select: { id: true },
    })
    await tx.financialEntry.update({
      where: { id: e.id },
      data: { amount: plan.remainingAfter, ...(input.newDueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.newDueDate) ? { dueDate: noonUtc(input.newDueDate) } : {}) },
    })
    return c
  })
  await audit(actor, e.tenantId, 'FINANCE_SETTLE_PARTIAL', e.id, { remaining: Number(e.amount) }, { childId: child.id, paid: plan.paid, principal: plan.principal, interest: plan.interest, discount: plan.discount, remaining: plan.remainingAfter, paidDate: input.paidDate, newDueDate: input.newDueDate ?? null, batchId: input.batchId ?? null })
  return { kind: 'PARTIAL', childId: child.id }
}

/**
 * Estorna uma baixa. `entryId` pode ser a baixa parcial (filho) ou o título
 * quitado (baixa final). Ordem: a última baixa primeiro.
 */
export async function reverseSettlement(tenantId: string | null, entryId: string, reason: string, actor: Actor): Promise<string | null> {
  if (!reason.trim()) return 'Informe o motivo do estorno.'
  const e = await prisma.financialEntry.findFirst({ where: { id: entryId, ...(tenantId ? { tenantId } : {}) } })
  if (!e) return 'Lançamento não encontrado.'
  if (e.parentEntryId) {
    const parent = await prisma.financialEntry.findUnique({ where: { id: e.parentEntryId }, include: { partials: { select: { id: true, createdAt: true }, orderBy: { createdAt: 'desc' } } } })
    if (!parent) return 'Título não encontrado.'
    if (parent.status !== 'PREVISTO') return 'Estorne primeiro a baixa final do título.'
    if (parent.partials[0]?.id !== e.id) return 'Estorne primeiro a baixa mais recente.'
    const principal = principalOf({ amount: Number(e.amount), interestAmount: e.interestAmount == null ? null : Number(e.interestAmount), discountAmount: e.discountAmount == null ? null : Number(e.discountAmount) })
    await prisma.$transaction([
      prisma.financialEntry.update({ where: { id: parent.id }, data: { amount: Math.round((Number(parent.amount) + principal) * 100) / 100 } }),
      prisma.financialEntryAttachment.deleteMany({ where: { entryId: e.id } }),
      prisma.financialEntry.delete({ where: { id: e.id } }),
    ])
    await audit(actor, e.tenantId, 'FINANCE_SETTLE_REVERSE', parent.id, { partial: { id: e.id, paid: Number(e.amount), paidDate: e.paidDate, accountId: e.accountId } }, { restored: principal, reason })
    return null
  }
  if (e.status !== 'PAGO' && e.status !== 'RECEBIDO') return 'Lançamento sem baixa para estornar.'
  if (e.transferGroupId) return 'Transferência: exclua a transferência.'
  const principal = principalOf({ amount: Number(e.amount), interestAmount: e.interestAmount == null ? null : Number(e.interestAmount), discountAmount: e.discountAmount == null ? null : Number(e.discountAmount) })
  await prisma.financialEntry.update({
    where: { id: e.id },
    data: { status: 'PREVISTO', paidDate: null, amount: principal, interestAmount: null, discountAmount: null, settlementBatchId: null },
  })
  await applyStatusSideEffects(e, 'PREVISTO', null)
  await audit(actor, e.tenantId, 'FINANCE_SETTLE_REVERSE', e.id, { status: e.status, paid: Number(e.amount), paidDate: e.paidDate, accountId: e.accountId }, { status: 'PREVISTO', amount: principal, reason })
  return null
}

export interface BatchItem { entryId: string; principal?: number | null; interest?: number | null; discount?: number | null; settleRemainderAsDiscount?: boolean }
export interface BatchInput { type: 'RECEITA' | 'DESPESA'; paidDate: string; accountId?: string | null; paymentMethod?: string | null; description?: string | null; items: BatchItem[] }

/**
 * Baixa em lote: mesmo tipo, data, conta e forma; cada item com seu valor
 * (menor que o saldo = parcial), juros e desconto. Valida tudo antes de gravar.
 */
export async function settleBatch(tenantId: string, input: BatchInput, actor: Actor): Promise<{ error: string } | { batchId: string; done: number; failed: { entryId: string; error: string }[]; total: number }> {
  if (!input.items.length) return { error: 'Selecione os lançamentos.' }
  if (input.items.length > 200) return { error: 'No máximo 200 lançamentos por lote.' }
  if (input.paidDate > todaySP()) return { error: 'A data da baixa não pode ser futura.' }
  const ids = [...new Set(input.items.map((i) => i.entryId))]
  const rows = await prisma.financialEntry.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, type: true, status: true, amount: true, parentEntryId: true, transferGroupId: true, source: true, commissionCalculationId: true, vehicleServiceId: true } })
  const byId = new Map(rows.map((r) => [r.id, r]))
  let total = 0
  for (const it of input.items) {
    const r = byId.get(it.entryId)
    if (!r) return { error: 'Lançamento do lote não encontrado.' }
    if (r.type !== input.type) return { error: 'O lote não pode misturar contas a pagar e a receber.' }
    if (r.status !== 'PREVISTO' || r.parentEntryId) return { error: 'O lote tem lançamento já quitado ou cancelado.' }
    const plan = planSettlement({ remaining: Number(r.amount), principal: it.principal, interest: it.interest, discount: it.discount, settleRemainderAsDiscount: it.settleRemainderAsDiscount })
    if (!plan.ok) return { error: plan.error }
    if (plan.kind === 'PARTIAL') { const b = partialBlockedReason(r); if (b) return { error: b } }
    total += plan.paid
  }
  const batch = await prisma.financialSettlementBatch.create({
    data: { tenantId, type: input.type, paidDate: noonUtc(input.paidDate), accountId: input.accountId || null, paymentMethod: input.paymentMethod || null, description: input.description || null, total: Math.round(total * 100) / 100, count: input.items.length, createdById: actor.id },
    select: { id: true },
  })
  const failed: { entryId: string; error: string }[] = []
  const snapshot: Array<{ entryId: string; description: string; counterparty: string | null; dueDate: Date | null; remaining: number; principal: number; interest: number; discount: number; paid: number; kind: string }> = []
  for (const it of input.items) {
    const before = await prisma.financialEntry.findUnique({ where: { id: it.entryId }, select: { description: true, counterparty: true, dueDate: true, amount: true } })
    const r = await settleTitle(tenantId, it.entryId, { paidDate: input.paidDate, accountId: input.accountId, paymentMethod: input.paymentMethod, principal: it.principal, interest: it.interest, discount: it.discount, settleRemainderAsDiscount: it.settleRemainderAsDiscount, batchId: batch.id }, actor)
    if ('error' in r) { failed.push({ entryId: it.entryId, error: r.error }); continue }
    const plan = planSettlement({ remaining: Number(before?.amount ?? 0), principal: it.principal, interest: it.interest, discount: it.discount, settleRemainderAsDiscount: it.settleRemainderAsDiscount })
    if (plan.ok) snapshot.push({ entryId: it.entryId, description: before?.description ?? '', counterparty: before?.counterparty ?? null, dueDate: before?.dueDate ?? null, remaining: Number(before?.amount ?? 0), principal: plan.principal, interest: plan.interest, discount: plan.discount, paid: plan.paid, kind: r.kind })
  }
  const done = snapshot.length
  const paidTotal = Math.round(snapshot.reduce((acc, x) => acc + x.paid, 0) * 100) / 100
  if (!done) await prisma.financialSettlementBatch.delete({ where: { id: batch.id } }).catch(() => {})
  else await prisma.financialSettlementBatch.update({ where: { id: batch.id }, data: { count: done, total: paidTotal, snapshot: snapshot as never } })
  return { batchId: batch.id, done, failed, total: paidTotal }
}

/** Estorna o lote inteiro (baixas parciais e finais feitas nele). */
export async function reverseBatch(tenantId: string, batchId: string, reason: string, actor: Actor): Promise<string | null> {
  if (!reason.trim()) return 'Informe o motivo do estorno.'
  const batch = await prisma.financialSettlementBatch.findFirst({ where: { id: batchId, tenantId } })
  if (!batch) return 'Lote não encontrado.'
  if (batch.reversedAt) return 'Lote já estornado.'
  const entries = await prisma.financialEntry.findMany({ where: { settlementBatchId: batchId, tenantId }, select: { id: true, parentEntryId: true, createdAt: true }, orderBy: { createdAt: 'desc' } })
  // Antes de estornar qualquer item: as baixas do lote precisam ser as mais
  // recentes de cada título (senão o estorno pararia no meio).
  const inBatch = new Set(entries.map((x) => x.id))
  const titleIds = [...new Set(entries.map((x) => x.parentEntryId ?? x.id))]
  const titles = await prisma.financialEntry.findMany({ where: { id: { in: titleIds } }, select: { id: true, status: true, settlementBatchId: true, partials: { select: { id: true, createdAt: true }, orderBy: { createdAt: 'desc' } } } })
  for (const t of titles) {
    const finalOutside = t.status !== 'PREVISTO' && !inBatch.has(t.id)
    if (finalOutside) return 'Um título do lote foi quitado depois, fora do lote: estorne essa baixa antes.'
    let seenOutside = false
    for (const p of t.partials) {
      if (!inBatch.has(p.id)) seenOutside = true
      else if (seenOutside) return 'Um título do lote teve baixa mais recente fora do lote: estorne-a antes.'
    }
  }
  // Finais antes das parciais do mesmo título; parciais da mais recente para a mais antiga.
  const ordered = [...entries.filter((x) => !x.parentEntryId), ...entries.filter((x) => x.parentEntryId)]
  for (const x of ordered) {
    const err = await reverseSettlement(tenantId, x.id, `Estorno do lote: ${reason}`, actor)
    if (err) return `Não foi possível estornar todo o lote: ${err}`
  }
  await prisma.financialSettlementBatch.update({ where: { id: batchId }, data: { reversedAt: new Date(), reversalReason: reason.slice(0, 300) } })
  return null
}
