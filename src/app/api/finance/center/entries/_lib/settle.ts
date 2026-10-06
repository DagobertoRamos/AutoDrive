// =============================================================================
// Baixa (pagar/receber) e cancelamento de lançamentos do Centro Financeiro.
// A baixa grava data, conta, forma, valor pago, juros/multa e desconto (o valor
// pago já os inclui e passa a ser o valor do lançamento) e SEMPRE roda
// applyStatusSideEffects (comissão e pagamento da negociação acompanham).
// =============================================================================

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { applyStatusSideEffects } from '@/lib/finance/entry-settlement'
import { noonUtc } from '@/lib/finance/recurrence-core'
import { round2 } from './shared'

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
const optId = z.string().max(40).nullable().optional()

export const settleSchema = z.object({
  paidDate: ymd,
  accountId: optId,
  paymentMethod: z.string().trim().max(60).nullable().optional(),
  paidAmount: z.coerce.number().max(100_000_000).nullable().optional(),
  interestAmount: z.coerce.number().min(0).max(100_000_000).nullable().optional(),
  discountAmount: z.coerce.number().min(0).max(100_000_000).nullable().optional(),
})
export type SettleInput = z.infer<typeof settleSchema>

/** Dá baixa no lançamento. Retorna mensagem de erro legível ou null. */
export async function settleEntry(id: string, input: SettleInput): Promise<string | null> {
  const e = await prisma.financialEntry.findUnique({ where: { id } })
  if (!e) return 'Lançamento não encontrado.'
  if (e.status === 'CANCELADO') return 'Lançamento cancelado: reabra antes de dar baixa.'
  if (e.status !== 'PREVISTO') return 'Lançamento já baixado.'
  if (e.transferGroupId) return 'Transferência não tem baixa.'
  const current = Number(e.amount)
  const interest = round2(input.interestAmount ?? 0)
  const discount = round2(input.discountAmount ?? 0)
  const paid = input.paidAmount == null ? round2(current + interest - discount) : round2(input.paidAmount)
  const linked = !!e.commissionCalculationId || !!e.vehicleServiceId
  if (linked && paid !== current) return e.commissionCalculationId ? 'Comissão: o valor vem do sistema de comissões.' : 'Custo de serviço: altere o valor na aba Serviços do veículo.'
  if (!linked && !(paid > 0)) return 'Informe o valor pago.'
  if (e.commissionCalculationId) {
    const c = await prisma.commissionCalculation.findUnique({ where: { id: e.commissionCalculationId }, select: { status: true } })
    if (c?.status === 'CANCELADO') return 'Comissão cancelada: não pode ser paga.'
  }
  const status = e.type === 'DESPESA' ? 'PAGO' : 'RECEBIDO'
  const paidDate = noonUtc(input.paidDate)
  await prisma.financialEntry.update({
    where: { id },
    data: {
      status, paidDate, amount: paid,
      interestAmount: interest || null, discountAmount: discount || null,
      ...(input.accountId !== undefined ? { accountId: input.accountId || null } : {}),
      ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod || null } : {}),
    },
  })
  await applyStatusSideEffects(e, status, paidDate)
  return null
}

/** Cancela um lançamento previsto, guardando o motivo nas observações. */
export async function cancelEntry(id: string, reason: string | null | undefined): Promise<string | null> {
  const e = await prisma.financialEntry.findUnique({ where: { id } })
  if (!e) return 'Lançamento não encontrado.'
  if (e.status === 'CANCELADO') return null
  if (e.status !== 'PREVISTO') return 'Estorne a baixa antes de cancelar.'
  const why = reason?.trim()
  const notes = why ? [e.notes?.trim(), `Cancelado: ${why}`].filter(Boolean).join('\n').slice(0, 2000) : e.notes
  await prisma.financialEntry.update({ where: { id }, data: { status: 'CANCELADO', notes } })
  await applyStatusSideEffects(e, 'CANCELADO', null)
  return null
}
