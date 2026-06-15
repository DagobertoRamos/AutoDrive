// =============================================================================
// Financeiro — integração com vendas e comissões.
// Gera FinancialEntry de forma IDEMPOTENTE a partir do que já existe:
//   - Deal FINALIZADA (com saleAmount) → RECEITA  (source=VENDA, 1 por deal)
//   - CommissionCalculation            → DESPESA  (source por ruleType, 1 por comissão)
// Idempotência garantida pelos @@unique [dealId, source] e [commissionCalculationId]
// e por skipDuplicates. Tenant-scoped via tenantWhere; cada entry herda o tenant
// do registro de origem (importante para MASTER, que varre todos).
// =============================================================================

import type { UserRole } from '@/lib/permissions'
import { tenantWhere } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'

const COMMISSION_SOURCE: Record<string, string> = { RETORNO: 'RETORNO', GARANTIA: 'GARANTIA' }

export async function syncFinanceFromBusiness(role: UserRole, tenantId: string | null): Promise<{ vendas: number; comissoes: number }> {
  // ── Vendas finalizadas → RECEITA ──────────────────────────────────────
  const deals = await prisma.deal.findMany({
    where: tenantWhere(role, tenantId, { type: 'VENDA', status: 'FINALIZADA', saleAmount: { gt: 0 } }) as never,
    select: { id: true, tenantId: true, unitId: true, sellerId: true, dealNumber: true, saleAmount: true, finalizedAt: true, saleDate: true, createdAt: true },
  })
  const dealIds = deals.map((d) => d.id)
  const existingDeal = dealIds.length
    ? await prisma.financialEntry.findMany({ where: { source: 'VENDA', dealId: { in: dealIds } }, select: { dealId: true } })
    : []
  const haveDeal = new Set(existingDeal.map((e) => e.dealId))
  const dealEntries = deals.filter((d) => !haveDeal.has(d.id)).map((d) => ({
    tenantId: d.tenantId, unitId: d.unitId, sellerId: d.sellerId, dealId: d.id, source: 'VENDA',
    type: 'RECEITA' as const, status: 'RECEBIDO' as const,
    description: `Venda ${d.dealNumber ?? d.id.slice(0, 8)}`,
    amount: d.saleAmount ?? 0,
    competenceDate: d.finalizedAt ?? d.saleDate ?? d.createdAt,
    dueDate: d.finalizedAt ?? d.saleDate ?? d.createdAt,
    paidDate: d.finalizedAt ?? d.saleDate ?? d.createdAt,
  }))

  // ── Comissões → DESPESA ───────────────────────────────────────────────
  const comissoes = await prisma.commissionCalculation.findMany({
    where: tenantWhere(role, tenantId, {}) as never,
    select: { id: true, tenantId: true, sellerId: true, ruleType: true, description: true, commissionValue: true, status: true, createdAt: true },
  })
  const comIds = comissoes.map((c) => c.id)
  const existingCom = comIds.length
    ? await prisma.financialEntry.findMany({ where: { commissionCalculationId: { in: comIds } }, select: { commissionCalculationId: true } })
    : []
  const haveCom = new Set(existingCom.map((e) => e.commissionCalculationId))
  const comEntries = comissoes.filter((c) => !haveCom.has(c.id)).map((c) => ({
    tenantId: c.tenantId, sellerId: c.sellerId, commissionCalculationId: c.id,
    source: COMMISSION_SOURCE[c.ruleType] ?? 'COMISSAO',
    type: 'DESPESA' as const,
    status: (c.status === 'PAGO' ? 'PAGO' : 'PREVISTO') as 'PAGO' | 'PREVISTO',
    description: c.description || `Comissão ${c.ruleType}`,
    amount: c.commissionValue,
    competenceDate: c.createdAt,
    dueDate: c.createdAt,
    paidDate: c.status === 'PAGO' ? c.createdAt : null,
  }))

  let vendas = 0
  let comissoesCount = 0
  if (dealEntries.length) vendas = (await prisma.financialEntry.createMany({ data: dealEntries as never, skipDuplicates: true })).count
  if (comEntries.length) comissoesCount = (await prisma.financialEntry.createMany({ data: comEntries as never, skipDuplicates: true })).count
  return { vendas, comissoes: comissoesCount }
}
