// =============================================================================
// Baixa (pagar/receber) e cancelamento de lançamentos do Centro Financeiro.
// A baixa delega para src/lib/finance/settlement.ts (total ou parcial, com
// juros/multa e desconto); o título mantém o valor original e cada baixa
// parcial vira um lançamento filho. Comissão e pagamento da negociação só
// acompanham na quitação total (applyStatusSideEffects).
// =============================================================================

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { applyStatusSideEffects } from '@/lib/finance/entry-settlement'
import { settleTitle, type Actor } from '@/lib/finance/settlement'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { lockedDatesOf, periodError } from '@/lib/finance/period-lock'
import { isDeletableSource } from './shared'

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
const optId = z.string().max(40).nullable().optional()

export const settleSchema = z.object({
  paidDate: ymd,
  accountId: optId,
  paymentMethod: z.string().trim().max(60).nullable().optional(),
  /** Principal a abater (vazio = saldo inteiro; menor que o saldo = baixa parcial). */
  principalAmount: z.coerce.number().max(100_000_000).nullable().optional(),
  /** Legado: valor pago total (principal + juros − desconto). */
  paidAmount: z.coerce.number().max(100_000_000).nullable().optional(),
  interestAmount: z.coerce.number().min(0).max(100_000_000).nullable().optional(),
  discountAmount: z.coerce.number().min(0).max(100_000_000).nullable().optional(),
  settleRemainderAsDiscount: z.boolean().optional(),
  newDueDate: ymd.nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
})
export type SettleInput = z.infer<typeof settleSchema>

/** Dá baixa no lançamento. Retorna mensagem de erro legível ou null. */
export async function settleEntry(id: string, input: SettleInput, actor?: Actor, tenantId?: string | null): Promise<string | null> {
  const interest = input.interestAmount ?? 0
  const discount = input.discountAmount ?? 0
  const principal = input.principalAmount ?? (input.paidAmount == null ? null : Math.round((input.paidAmount - interest + discount) * 100) / 100)
  const r = await settleTitle(tenantId ?? null, id, {
    paidDate: input.paidDate, accountId: input.accountId, paymentMethod: input.paymentMethod,
    principal, interest, discount, settleRemainderAsDiscount: input.settleRemainderAsDiscount,
    newDueDate: input.newDueDate ?? null, notes: input.notes ?? null,
  }, actor ?? { id: 'system' })
  return 'error' in r ? r.error : null
}

/** Cancela um lançamento previsto, guardando o motivo nas observações. */
export async function cancelEntry(id: string, reason: string | null | undefined): Promise<string | null> {
  const e = await prisma.financialEntry.findUnique({ where: { id }, include: { _count: { select: { partials: { where: { status: { not: 'CANCELADO' } } } } } } })
  if (!e) return 'Lançamento não encontrado.'
  if (e.status === 'CANCELADO') return null
  if (e.status !== 'PREVISTO') return 'Estorne a baixa antes de cancelar.'
  if (e._count.partials) return 'O título tem baixas parciais: estorne-as antes de cancelar.'
  const closed = await periodError(e.tenantId, [e.competenceDate])
  if (closed) return closed
  const why = reason?.trim()
  const notes = why ? [e.notes?.trim(), `Cancelado: ${why}`].filter(Boolean).join('\n').slice(0, 2000) : e.notes
  await prisma.financialEntry.update({ where: { id }, data: { status: 'CANCELADO', notes } })
  await applyStatusSideEffects(e, 'CANCELADO', null)
  return null
}

/**
 * "Excluir" do financeiro: nada é apagado. Previsto → cancelado; lançamento
 * manual já pago/recebido → cancelado direto (sai do caixa, fica o histórico).
 * Integrado já baixado → precisa estornar antes. Sempre com motivo na auditoria.
 */
export async function voidEntry(id: string, reason: string | null | undefined, actor: Actor & { tenantId?: string | null }): Promise<string | null> {
  const e = await prisma.financialEntry.findUnique({ where: { id }, include: { _count: { select: { partials: { where: { status: { not: 'CANCELADO' } } } } } } })
  if (!e) return 'Lançamento não encontrado.'
  if (e.status === 'CANCELADO') return null
  if (e.parentEntryId) return 'Esta linha é uma baixa: use Estornar.'
  if (e.transferGroupId) return 'Transferência: cancele pela transferência.'
  if (e._count.partials) return 'O título tem baixas: estorne-as antes.'
  const closed = await periodError(e.tenantId, lockedDatesOf(e))
  if (closed) return closed
  const why = reason?.trim() || 'Excluído pelo usuário'
  const before = { status: e.status, amount: Number(e.amount), paidDate: e.paidDate, accountId: e.accountId, description: e.description }
  if (e.status === 'PREVISTO') {
    const err = await cancelEntry(id, why)
    if (err) return err
  } else {
    if (!isDeletableSource(e.source)) return 'Lançamento integrado já baixado: estorne a baixa antes.'
    const r = await prisma.financialEntry.updateMany({
      where: { id, status: e.status },
      data: { status: 'CANCELADO', notes: [e.notes?.trim(), `Cancelado: ${why}`].filter(Boolean).join('\n').slice(0, 2000) },
    })
    if (r.count !== 1) return 'O lançamento foi alterado por outra operação. Atualize a tela.'
    await applyStatusSideEffects(e, 'CANCELADO', null)
  }
  await createSafeAuditLog({ userId: actor.id, tenantId: e.tenantId, action: 'FINANCE_VOID', entity: 'FinancialEntry', entityId: id, userName: actor.name ?? undefined, userRole: actor.role ?? undefined, beforeData: before, afterData: { status: 'CANCELADO', reason: why } })
  return null
}
