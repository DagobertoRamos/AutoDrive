// =============================================================================
// seller-queue/lead.ts — gera o "lead de atendimento" no sistema de leads
// (MarketingLead) ao finalizar um atendimento da fila, creditando o VENDEDOR
// que atendeu (assignedToUserId). Reaproveita o lead existente do cliente
// recorrente em vez de duplicar. Se o atendimento virou negociação (resultado
// CONVERTED_TO_NEGOTIATION ou dealId), marca o lead como convertido — a
// negociação (Deal) segue o fluxo próprio. Best-effort: nunca quebra o finish.
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { LeadStatus } from '@prisma/client'

// Resultado do atendimento → status do lead.
const RESULT_TO_STATUS: Record<string, LeadStatus> = {
  CONVERTED_TO_NEGOTIATION: 'CONVERTED',
  SCHEDULED_RETURN: 'WORKING',
  NO_INTEREST: 'LOST',
  LOST: 'LOST',
  FORWARDED_TO_RESPONSIBLE: 'WORKING',
  DUPLICATED: 'DISCARDED',
  INVALID_ATTENDANCE: 'DISCARDED',
}

export interface AttendanceLeadInput {
  tenantId: string
  unitId: string
  sellerId: string
  actorId: string
  attendanceId: string
  arrivalId: string | null
  result: string
  dealId?: string | null
  notes?: string | null
  existingLeadId?: string | null
  customerName?: string | null
  customerPhone?: string | null
}

/**
 * Garante um lead para o atendimento (cria ou reaproveita) atribuído ao vendedor.
 * Retorna o id do lead (ou null se falhou — não bloqueia o fluxo).
 */
export async function ensureAttendanceLead(opts: AttendanceLeadInput): Promise<string | null> {
  const now = new Date()
  const status = RESULT_TO_STATUS[opts.result] ?? 'WORKING'
  const converted = opts.result === 'CONVERTED_TO_NEGOTIATION' || !!opts.dealId

  // Dados do cliente: o que o vendedor digitou tem prioridade; senão, a chegada.
  const arrival = opts.arrivalId
    ? await prisma.sellerQueueCustomerArrival.findUnique({
        where: { id: opts.arrivalId },
        select: { customerName: true, customerPhone: true, customerId: true, leadId: true },
      }).catch(() => null)
    : null

  const name = opts.customerName?.trim() || arrival?.customerName || null
  const phone = opts.customerPhone?.trim() || arrival?.customerPhone || null
  const targetLeadId = opts.existingLeadId || arrival?.leadId || null

  const convertedFields = converted ? { status: 'CONVERTED' as LeadStatus, convertedDealId: opts.dealId ?? undefined, convertedAt: now } : {}
  const lostFields = status === 'LOST' && !converted ? { lostReason: opts.result } : {}

  // Recorrente: reaproveita o lead aberto, creditando o vendedor que atendeu.
  if (targetLeadId) {
    const updated = await prisma.marketingLead.update({
      where: { id: targetLeadId },
      data: {
        assignedToUserId: opts.sellerId,
        lastContactAt: now,
        status: converted ? 'CONVERTED' : status,
        ...convertedFields,
        ...lostFields,
        ...(name ? { name } : {}),
        ...(phone ? { phone } : {}),
      },
    }).catch(() => null)
    return updated?.id ?? targetLeadId
  }

  // Novo lead de atendimento, já do vendedor.
  const lead = await prisma.marketingLead.create({
    data: {
      tenantId: opts.tenantId, unitId: opts.unitId,
      name, phone, customerId: arrival?.customerId ?? null,
      source: 'FILA_ATENDIMENTO',
      assignedToUserId: opts.sellerId, createdById: opts.actorId,
      status: converted ? 'CONVERTED' : status,
      lastContactAt: now,
      ...convertedFields,
      ...lostFields,
      notes: opts.notes ?? null,
      metadata: { fromQueue: true, attendanceId: opts.attendanceId, arrivalId: opts.arrivalId },
    },
  }).catch(() => null)

  return lead?.id ?? null
}
