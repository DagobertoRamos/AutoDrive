// =============================================================================
// Liberação de comissão para pagamento (por loja).
//   SystemSetting `commission:release:<tenantId>`:
//     APROVACAO   (padrão) — paga quando a venda é aprovada (como sempre foi);
//     RECEBIMENTO — só paga depois que o financeiro conciliou todo o valor da venda.
//   Bônus de período e descontos (sem negociação) não dependem de recebimento.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { calculateNegotiationFinancialSummary, dealToFinancialInput, reconciliationOf } from '@/lib/negotiation-service'

export type CommissionReleaseMode = 'APROVACAO' | 'RECEBIMENTO'
const KEY = (tenantId: string) => `commission:release:${tenantId}`
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export async function getCommissionRelease(tenantId: string | null | undefined): Promise<CommissionReleaseMode> {
  if (!tenantId) return 'APROVACAO'
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY(tenantId) }, select: { value: true } }).catch(() => null)
  return row?.value === 'RECEBIMENTO' ? 'RECEBIMENTO' : 'APROVACAO'
}

export async function setCommissionRelease(tenantId: string, mode: CommissionReleaseMode, userId: string) {
  await prisma.systemSetting.upsert({
    where: { key: KEY(tenantId) },
    create: { tenantId, key: KEY(tenantId), value: mode, group: 'finance', description: 'Liberação de comissão para pagamento', updatedByUserId: userId },
    update: { value: mode, updatedByUserId: userId },
  })
}

/** Motivo de a comissão ainda não poder ser paga; null = liberada. */
export async function commissionHoldReason(tenantId: string | null | undefined, commissionCalculationId: string | null | undefined): Promise<string | null> {
  if (!commissionCalculationId || (await getCommissionRelease(tenantId)) !== 'RECEBIMENTO') return null
  const c = await prisma.commissionCalculation.findUnique({ where: { id: commissionCalculationId }, select: { commissionValue: true, ruleDetails: true } })
  if (!c || Number(c.commissionValue) <= 0) return null
  const dealId = (c.ruleDetails as { dealId?: string } | null)?.dealId
  if (!dealId) return null
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      dealNumber: true, saleAmount: true, purchaseAmount: true, vehicleValue: true, documentationFee: true, discountAmount: true,
      vehicles: { select: { agreedValue: true } }, debts: { select: { value: true } }, services: { select: { value: true } },
      payments: { select: { value: true, status: true } }, discountRequests: { select: { status: true, approvedValue: true, requestedValue: true } },
      changes: { select: { value: true } },
    },
  })
  if (!deal) return null
  const rec = reconciliationOf(calculateNegotiationFinancialSummary(dealToFinancialInput(deal)))
  if (rec.naoConciliado <= 0.009) return null
  return `Comissão liberada só após o recebimento da venda ${deal.dealNumber ?? ''} (falta conciliar ${brl(rec.naoConciliado)}).`.replace('  ', ' ')
}
