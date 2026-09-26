// =============================================================================
// Lojas parceiras — validação do formulário e importação (feed / site antigo).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { partnerRefFromName } from './origin-core'

const FIELDS = ['legalName', 'cnpj', 'responsibleName', 'whatsapp', 'email', 'city', 'state', 'address', 'instagram', 'website', 'commission', 'notes'] as const
type Field = (typeof FIELDS)[number]
export type PartnerStoreInput = { name: string } & { [K in Field]: string | null }

const clean = (v: unknown, max = 300) => {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}

export function partnerStoreData(body: Record<string, unknown>): { ok: true; data: PartnerStoreInput } | { ok: false; error: string } {
  const name = clean(body.name, 120)
  if (!name) return { ok: false, error: 'Informe o nome da loja parceira.' }
  const data = { name } as PartnerStoreInput
  for (const f of FIELDS) data[f] = clean(body[f], f === 'notes' ? 2000 : 300)
  if (data.cnpj) data.cnpj = data.cnpj.replace(/\D/g, '') || null
  if (data.whatsapp) data.whatsapp = data.whatsapp.replace(/\D/g, '') || null
  if (data.state) data.state = data.state.toUpperCase().slice(0, 2)
  if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return { ok: false, error: 'E-mail inválido.' }
  return { ok: true, data }
}

/**
 * Garante a loja parceira pelo nome (importação do feed). Não sobrescreve o
 * que a loja já cadastrou à mão: só completa cidade/WhatsApp vazios.
 */
export async function ensurePartnerStoreByName(tenantId: string, name: string, extra: { city?: string | null; whatsapp?: string | null } = {}): Promise<string> {
  const clean = name.trim()
  const existing = await prisma.partnerStore.findFirst({
    where: { tenantId, OR: [{ sourceRef: partnerRefFromName(clean) }, { name: { equals: clean, mode: 'insensitive' } }] },
    select: { id: true, city: true, whatsapp: true },
  })
  if (existing) {
    const patch: Record<string, string> = {}
    if (!existing.city && extra.city) patch.city = extra.city
    if (!existing.whatsapp && extra.whatsapp) patch.whatsapp = extra.whatsapp.replace(/\D/g, '')
    if (Object.keys(patch).length) await prisma.partnerStore.update({ where: { id: existing.id }, data: patch })
    return existing.id
  }
  const row = await prisma.partnerStore.create({
    data: {
      tenantId, name: clean, sourceRef: partnerRefFromName(clean),
      city: extra.city || null, whatsapp: extra.whatsapp ? extra.whatsapp.replace(/\D/g, '') : null,
      notes: 'Importada automaticamente do estoque do site.',
    },
    select: { id: true },
  })
  return row.id
}
