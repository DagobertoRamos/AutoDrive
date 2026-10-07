// =============================================================================
// Financeiro / F&I — valida que os ids referenciados na escrita (conta, categoria,
// unidade, vendedor, proponente, banco) pertencem à MESMA loja do registro.
// Retorna a mensagem de erro (→ 400) ou null. tenantId null (MASTER/legado) não valida.
// =============================================================================

import { prisma } from '@/lib/prisma'

export interface TenantRefs {
  accountId?: string | null
  categoryId?: string | null
  unitId?: string | null
  sellerId?: string | null
  proponentId?: string | null
  bankId?: string | null
  // F&I Core
  coProponentId?: string | null
  dealId?: string | null
  vehicleId?: string | null
  leadId?: string | null
  customerId?: string | null
}

export async function tenantRefError(tenantId: string | null, refs: TenantRefs): Promise<string | null> {
  if (!tenantId) return null
  const checks: Array<[string | null | undefined, string, () => Promise<unknown>]> = [
    [refs.accountId, 'Conta inválida.', () => prisma.financialAccount.findFirst({ where: { id: refs.accountId!, tenantId }, select: { id: true } })],
    [refs.categoryId, 'Categoria inválida.', () => prisma.financialCategory.findFirst({ where: { id: refs.categoryId!, tenantId }, select: { id: true } })],
    [refs.unitId, 'Unidade inválida.', () => prisma.unit.findFirst({ where: { id: refs.unitId!, tenantId }, select: { id: true } })],
    // Vendedor não tem tenantId: a loja vem da unidade dele.
    [refs.sellerId, 'Vendedor inválido.', () => prisma.seller.findFirst({ where: { id: refs.sellerId!, unit: { tenantId } }, select: { id: true } })],
    [refs.proponentId, 'Proponente inválido.', () => prisma.financeProponent.findFirst({ where: { id: refs.proponentId!, tenantId }, select: { id: true } })],
    [refs.bankId, 'Banco inválido.', () => prisma.financeBank.findFirst({ where: { id: refs.bankId!, tenantId }, select: { id: true } })],
    [refs.coProponentId, 'Co-comprador inválido.', () => prisma.financeProponent.findFirst({ where: { id: refs.coProponentId!, tenantId }, select: { id: true } })],
    [refs.dealId, 'Negociação inválida.', () => prisma.deal.findFirst({ where: { id: refs.dealId!, tenantId }, select: { id: true } })],
    [refs.vehicleId, 'Veículo inválido.', () => prisma.vehicle.findFirst({ where: { id: refs.vehicleId!, tenantId }, select: { id: true } })],
    [refs.leadId, 'Lead inválido.', () => prisma.marketingLead.findFirst({ where: { id: refs.leadId!, tenantId }, select: { id: true } })],
    [refs.customerId, 'Cliente inválido.', () => prisma.customer.findFirst({ where: { id: refs.customerId!, tenantId }, select: { id: true } })],
  ]
  for (const [id, msg, find] of checks) {
    if (id && !(await find())) return msg
  }
  return null
}
