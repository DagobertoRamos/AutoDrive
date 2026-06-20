// =============================================================================
// seller-queue/recurring.ts — identificação de cliente recorrente (SOMENTE LEITURA).
// Cruza telefone com Customer, MarketingLead (aberto) e Deal (último vendedor).
// NÃO altera nada nesses módulos. Usado para sugerir o vendedor responsável.
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { LeadStatus } from '@prisma/client'

const OPEN_LEAD: LeadStatus[] = ['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'RECYCLED']

export interface RecurringResult {
  recurring: boolean
  customerId?: string
  leadId?: string
  suggestedSellerId?: string // vendedor responsável (Deal mais recente > lead)
}

export async function detectRecurringCustomer(tenantId: string, phone?: string | null, _name?: string | null): Promise<RecurringResult> {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 8) return { recurring: false }
  const last8 = digits.slice(-8)

  const [customer, lead] = await Promise.all([
    prisma.customer.findFirst({ where: { tenantId, phone: { contains: last8 } }, select: { id: true }, orderBy: { createdAt: 'desc' } }),
    prisma.marketingLead.findFirst({ where: { tenantId, phone: { contains: last8 }, status: { in: OPEN_LEAD } }, select: { id: true, assignedToUserId: true }, orderBy: { createdAt: 'desc' } }),
  ])

  // Último Deal do cliente com vendedor → responsável preferencial.
  let dealSellerId: string | undefined
  if (customer) {
    const deal = await prisma.deal.findFirst({
      where: { tenantId, customerId: customer.id, sellerId: { not: null } },
      select: { sellerId: true }, orderBy: { createdAt: 'desc' },
    })
    dealSellerId = deal?.sellerId ?? undefined
  }

  const suggestedSellerId = dealSellerId ?? lead?.assignedToUserId ?? undefined
  return {
    recurring: !!(customer || lead || dealSellerId),
    customerId: customer?.id,
    leadId: lead?.id,
    suggestedSellerId,
  }
}
