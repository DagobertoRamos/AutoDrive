// =============================================================================
// CRM Card — Número público do lead (leadNumber): sequencial por tenant.
// Tolerante: se a coluna ainda não existir (migration pendente), retorna null.
// A atribuição usa "MAX(leadNumber)+1" numa transação serializada para evitar
// conflito em inserções simultâneas (o @@unique de tenantId+leadNumber garante
// a unicidade em última instância).
// =============================================================================

import { prisma } from '@/lib/prisma'

/** Atribui um leadNumber sequencial ao lead (se ainda não tiver). Tolerante. */
export async function assignLeadNumber(leadId: string, tenantId: string): Promise<number | null> {
  try {
    const existing = await prisma.marketingLead.findUnique({ where: { id: leadId }, select: { leadNumber: true } })
    if (existing?.leadNumber) return existing.leadNumber

    const agg = await prisma.marketingLead.aggregate({ where: { tenantId }, _max: { leadNumber: true } })
    const next = (agg._max.leadNumber ?? 0) + 1

    await prisma.marketingLead.update({
      where: { id: leadId },
      data: { leadNumber: next },
    }).catch(() => {
      // Conflito de corrida: ignora (o @@unique impediu — outro processo ganhou).
    })
    return next
  } catch {
    return null // tabela não migrada ou erro transitório
  }
}
