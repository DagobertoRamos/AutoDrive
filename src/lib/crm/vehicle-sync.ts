// =============================================================================
// CRM Vehicle Sync — sincroniza DealVehicle → CrmLeadVehicle quando uma
// negociação é criada ou vinculada a um lead. Idempotente: não duplica.
// Mapeamento de roles: VENDIDO→COMPRA, TROCA→TROCA, COMPRADO→VENDA,
// CONSIGNADO→CONSIGNACAO (ponto de vista do LEAD = cliente).
// =============================================================================

import { prisma } from '@/lib/prisma'

const DEAL_ROLE_TO_LEAD_ROLE: Record<string, string> = {
  VENDIDO:     'COMPRA',       // deal vendeu → cliente comprando
  TROCA:       'TROCA',
  COMPRADO:    'VENDA',        // loja comprou → cliente vendendo
  CONSIGNADO:  'CONSIGNACAO',
}

export async function syncDealVehiclesToLead(dealId: string, leadId: string, tenantId: string): Promise<void> {
  try {
    const dealVehicles = await prisma.dealVehicle.findMany({ where: { dealId }, select: { id: true, plate: true, brand: true, model: true, year: true, vehicleId: true, role: true } })
    if (!dealVehicles.length) return

    for (const dv of dealVehicles) {
      const role = DEAL_ROLE_TO_LEAD_ROLE[dv.role] ?? 'COMPRA'
      // Procura por placa ou vehicleId já cadastrado no lead.
      const existing = await prisma.crmLeadVehicle.findFirst({
        where: { leadId, tenantId, OR: [
          ...(dv.vehicleId ? [{ vehicleId: dv.vehicleId }] : []),
          ...(dv.plate     ? [{ plate: dv.plate }] : []),
        ], removedAt: null },
        select: { id: true },
      }).catch(() => null)

      if (existing) {
        // Atualiza se já existe (ex.: placa mudou de status).
        await prisma.crmLeadVehicle.update({ where: { id: existing.id }, data: { role, brand: dv.brand ?? undefined, model: dv.model ?? undefined, year: dv.year ?? undefined, plate: dv.plate ?? undefined, vehicleId: dv.vehicleId ?? undefined } }).catch(() => {})
      } else {
        // Cria novo sem conflito de unique (vehicleId nulo não conflita).
        await prisma.crmLeadVehicle.create({ data: { tenantId, leadId, vehicleId: dv.vehicleId ?? null, brand: dv.brand, model: dv.model, year: dv.year, plate: dv.plate, role, interest: 'PRIMARY', status: 'INTERESTED', isPrimary: dv.role === 'VENDIDO', addedByUserId: 'system' } }).catch(() => {})
      }
    }
  } catch {
    // sync é best-effort — nunca bloqueia o fluxo principal.
  }
}
