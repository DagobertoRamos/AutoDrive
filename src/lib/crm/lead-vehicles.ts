// =============================================================================
// Veículos de interesse do lead (CrmLeadVehicle).
//   • Carro do estoque: snapshot do veículo; re-adicionar restaura o removido
//     (@@unique [leadId, vehicleId]).
//   • Lead que chegou com carro (MarketingLead.vehicleId — site, portais,
//     WhatsApp): vira interesse automaticamente uma única vez (removido não volta).
//   • O primeiro interesse ativo do lead é o principal.
// =============================================================================

import { prisma } from '@/lib/prisma'

async function hasPrimary(tenantId: string, leadId: string) {
  return !!(await prisma.crmLeadVehicle.findFirst({ where: { tenantId, leadId, removedAt: null, isPrimary: true }, select: { id: true } }))
}

/** Liga um carro do estoque ao lead (cria ou restaura). */
export async function addStockInterest(tenantId: string, leadId: string, vehicleId: string, userId: string | null) {
  const v = await prisma.vehicle.findFirst({
    where: { id: vehicleId, tenantId },
    select: { id: true, brand: true, model: true, version: true, modelYear: true, plate: true, salePrice: true },
  })
  if (!v) return null
  const primary = !(await hasPrimary(tenantId, leadId))
  const snapshot = { brand: v.brand, model: v.model, version: v.version, year: v.modelYear, plate: v.plate, priceViewed: v.salePrice }
  const existing = await prisma.crmLeadVehicle.findFirst({ where: { leadId, vehicleId }, select: { id: true, removedAt: true } })
  if (existing) {
    if (!existing.removedAt) return existing
    return prisma.crmLeadVehicle.update({ where: { id: existing.id }, data: { ...snapshot, removedAt: null, removedReason: null, isPrimary: primary } })
  }
  return prisma.crmLeadVehicle.create({
    data: { tenantId, leadId, vehicleId, ...snapshot, role: 'COMPRA', interest: 'PRIMARY', status: 'INTERESTED', isPrimary: primary, addedByUserId: userId },
  })
}

/** Interesse fora do estoque (marca/modelo/ano digitados). */
export async function addManualInterest(tenantId: string, leadId: string, d: { brand?: string | null; model: string; year?: number | null }, userId: string | null) {
  const primary = !(await hasPrimary(tenantId, leadId))
  return prisma.crmLeadVehicle.create({
    data: {
      tenantId, leadId, vehicleId: null, brand: d.brand?.trim() || null, model: d.model.trim(), year: d.year ?? null,
      role: 'COMPRA', interest: 'PRIMARY', status: 'INTERESTED', isPrimary: primary, addedByUserId: userId,
    },
  })
}

/** Lead que veio com carro do estoque: traz o carro para os interesses (uma vez). */
export async function ensureLeadOriginVehicle(tenantId: string, lead: { id: string; vehicleId: string | null }) {
  if (!lead.vehicleId) return
  const any = await prisma.crmLeadVehicle.findFirst({ where: { leadId: lead.id, vehicleId: lead.vehicleId }, select: { id: true } })
  if (any) return
  await addStockInterest(tenantId, lead.id, lead.vehicleId, null).catch((e) => console.error('[crm] veículo do lead', lead.id, e))
}
