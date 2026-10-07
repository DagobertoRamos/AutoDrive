// =============================================================================
// Chargeback de F&I: o banco cobra de volta (total ou parte) o retorno/PLUS de um
// contrato de financiamento (ex.: cliente quitou cedo, contrato cancelado).
//   → DESPESA PAGO na conta debitada, source NEG_CHARGEBACK_<paymentId>, grupo
//     da DRE "F&I" (reduz a receita de F&I), centro FI, banco como contraparte.
//   Reflete no resultado da negociação, na DRE, no extrato e em Receitas de F&I.
//   Um chargeback por contrato; desfazer = cancela (nada é apagado).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { periodError } from './period-lock'
import { resultCenterIds } from './setup'
import { computeFiNet, parseAddOns, summarizeFiContract } from './fi-receipt-core'

export const CHARGEBACK_SOURCE_PREFIX = 'NEG_CHARGEBACK_'
const source = (paymentId: string) => `${CHARGEBACK_SOURCE_PREFIX}${paymentId}`
const r2 = (n: number) => Math.round(n * 100) / 100

type Actor = { id: string; name?: string | null; role?: string | null }

export async function loadChargeback(paymentId: string) {
  const e = await prisma.financialEntry.findFirst({ where: { source: source(paymentId), status: { not: 'CANCELADO' } }, select: { id: true, amount: true, paidDate: true, notes: true, account: { select: { name: true } } } })
  return e ? { entryId: e.id, amount: Number(e.amount), date: e.paidDate?.toISOString() ?? null, account: e.account?.name ?? null, reason: e.notes } : null
}

export async function registerChargeback(tenantId: string, paymentId: string, input: { amount: number; date: Date; accountId: string | null; reason: string }, actor: Actor): Promise<string | null> {
  const p = await prisma.dealPayment.findFirst({
    where: { id: paymentId, deal: { tenantId } },
    select: { id: true, type: true, bank: true, value: true, returnNetValue: true, plusValue: true, addOns: true, returnGrossValue: true, ilaValue: true, iofValue: true, irrfValue: true, deal: { select: { id: true, unitId: true, sellerId: true, dealNumber: true } } },
  })
  if (!p) return 'Contrato não encontrado.'
  if (p.type !== 'FINANCIAMENTO') return 'Chargeback é só de financiamento.'
  if (!(input.amount > 0)) return 'Informe o valor.'
  if (!input.reason.trim()) return 'Informe o motivo.'
  if (await loadChargeback(paymentId)) return 'Este contrato já tem chargeback registrado.'
  const n = (v: unknown) => (v == null ? null : Number(v))
  const net = n(p.returnNetValue) ?? computeFiNet(p.returnGrossValue, p.ilaValue, p.iofValue, p.irrfValue)
  const income = summarizeFiContract({ financedAmount: p.value, returnNetValue: net, plusValue: p.plusValue, addOns: parseAddOns(p.addOns) }).storeIncome
  if (income > 0 && input.amount > income + 0.009) return `O chargeback não pode passar das receitas do contrato (${income.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`
  const closed = await periodError(tenantId, [input.date])
  if (closed) return closed
  if (input.accountId && !(await prisma.financialAccount.findFirst({ where: { id: input.accountId, tenantId }, select: { id: true } }))) return 'Conta inválida.'
  const centers = await resultCenterIds(tenantId).catch(() => ({} as Record<string, string>))
  const ref = p.deal.dealNumber ?? p.deal.id.slice(0, 8)
  const e = await prisma.financialEntry.create({
    data: {
      tenantId, unitId: p.deal.unitId, sellerId: p.deal.sellerId, dealId: p.deal.id, source: source(paymentId),
      type: 'DESPESA', status: 'PAGO', amount: r2(input.amount), dueDate: input.date, paidDate: input.date, competenceDate: input.date,
      description: `Chargeback do F&I — ${[p.bank, ref].filter(Boolean).join(' · ')}`, accountId: input.accountId,
      costCenterId: centers.FI ?? null, counterparty: p.bank ?? null, notes: input.reason.trim().slice(0, 500), createdById: actor.id,
    },
    select: { id: true },
  })
  await createSafeAuditLog({ userId: actor.id, tenantId, action: 'FI_CHARGEBACK', entity: 'DealPayment', entityId: paymentId, userName: actor.name ?? null, userRole: actor.role ?? null, afterData: { entryId: e.id, amount: r2(input.amount), reason: input.reason.trim() } })
  return null
}

export async function undoChargeback(tenantId: string, paymentId: string, reason: string, actor: Actor): Promise<string | null> {
  const e = await prisma.financialEntry.findFirst({ where: { tenantId, source: source(paymentId), status: { not: 'CANCELADO' } }, select: { id: true, amount: true, paidDate: true, notes: true } })
  if (!e) return 'Chargeback não encontrado.'
  const closed = await periodError(tenantId, [e.paidDate])
  if (closed) return closed
  await prisma.financialEntry.update({ where: { id: e.id }, data: { status: 'CANCELADO', source: `${source(paymentId)}#X${Date.now()}`, notes: [e.notes, `Desfeito: ${reason || 'sem motivo'}`].filter(Boolean).join('\n').slice(0, 2000) } })
  await createSafeAuditLog({ userId: actor.id, tenantId, action: 'FI_CHARGEBACK_UNDO', entity: 'DealPayment', entityId: paymentId, userName: actor.name ?? null, userRole: actor.role ?? null, beforeData: { entryId: e.id, amount: Number(e.amount) }, afterData: { reason } })
  return null
}
