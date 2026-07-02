import { prisma } from '@/lib/prisma'
import type { NormalizedCommissionRuleData } from '@/lib/commission/rule-validation'

function tenantOrGlobalWhere(tenantId: string | null) {
  return tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : {}
}

export async function validateCommissionRuleReferences(
  data: NormalizedCommissionRuleData,
  tenantId: string | null,
): Promise<string | null> {
  if (data.unitId) {
    const unit = await prisma.unit.findFirst({
      where: tenantId ? { id: data.unitId, tenantId } : { id: data.unitId },
      select: { id: true },
    })
    if (!unit) return 'Unidade inválida ou fora da loja atual.'
  }

  if (data.positionId) {
    const position = await prisma.position.findFirst({
      where: { id: data.positionId, ...tenantOrGlobalWhere(tenantId) },
      select: { id: true },
    })
    if (!position) return 'Cargo inválido ou fora da loja atual.'
  }

  if (data.sellerId) {
    const seller = await prisma.seller.findFirst({
      where: tenantId
        ? { id: data.sellerId, unit: { tenantId } }
        : { id: data.sellerId },
      select: { id: true },
    })
    if (!seller) return 'Vendedor inválido ou fora da loja atual.'
  }

  if (data.managerId) {
    const manager = await prisma.manager.findFirst({
      where: tenantId
        ? { id: data.managerId, unit: { tenantId } }
        : { id: data.managerId },
      select: { id: true },
    })
    if (!manager) return 'Gerente inválido ou fora da loja atual.'
  }

  if (data.serviceId) {
    const service = await prisma.service.findFirst({
      where: { id: data.serviceId, ...tenantOrGlobalWhere(tenantId) },
      select: { id: true },
    })
    if (!service) return 'Serviço inválido ou fora da loja atual.'
  }

  if (data.warrantyId) {
    const warranty = await prisma.warranty.findFirst({
      where: { id: data.warrantyId, ...tenantOrGlobalWhere(tenantId) },
      select: { id: true },
    })
    if (!warranty) return 'Garantia inválida ou fora da loja atual.'
  }

  return null
}
