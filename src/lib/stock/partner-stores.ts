// =============================================================================
// Fornecedor de veículos (antiga "loja parceira") — importação do feed do site
// antigo. O cadastro é o de Fornecedores (kind VEICULOS).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { partnerRefFromName } from './origin-core'

/**
 * Garante o fornecedor de veículos pelo nome (importação do feed). Não
 * sobrescreve o que a loja já cadastrou: só completa cidade/WhatsApp vazios.
 */
export async function ensurePartnerStoreByName(tenantId: string, name: string, extra: { city?: string | null; whatsapp?: string | null } = {}): Promise<string> {
  const clean = name.trim()
  const existing = await prisma.supplier.findFirst({
    where: { tenantId, kind: 'VEICULOS', OR: [{ sourceRef: partnerRefFromName(clean) }, { name: { equals: clean, mode: 'insensitive' } }] },
    select: { id: true, city: true, whatsapp: true },
  })
  if (existing) {
    const patch: Record<string, string> = {}
    if (!existing.city && extra.city) patch.city = extra.city
    if (!existing.whatsapp && extra.whatsapp) patch.whatsapp = extra.whatsapp.replace(/\D/g, '')
    if (Object.keys(patch).length) await prisma.supplier.update({ where: { id: existing.id }, data: patch })
    return existing.id
  }
  const row = await prisma.supplier.create({
    data: {
      tenantId, name: clean, kind: 'VEICULOS', sourceRef: partnerRefFromName(clean),
      city: extra.city || null, whatsapp: extra.whatsapp ? extra.whatsapp.replace(/\D/g, '') : null,
      notes: 'Importado do estoque do site — complete CPF/CNPJ e endereço para o contrato.',
    },
    select: { id: true },
  })
  return row.id
}
