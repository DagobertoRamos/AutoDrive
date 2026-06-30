// =============================================================================
// seller-queue/lead.ts — ao finalizar um atendimento da fila:
//   (b) acha-ou-cria um CLIENTE (Customer) e o vincula (sem duplicar);
//       dedup por e-mail / telefone (ou cliente/lead já vinculado à chegada).
//   • reaproveita SEMPRE o mesmo LEAD do cliente (histórico único, sem duplicar);
//   (a) se "virou negociação", cria a NEGOCIAÇÃO (Deal RASCUNHO) e linka o lead.
// Credita o vendedor (assignedToUserId). Best-effort: nunca quebra o finish.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { generateDealNumber } from '@/lib/negotiation-service'
import type { LeadStatus } from '@prisma/client'

const RESULT_TO_STATUS: Record<string, LeadStatus> = {
  CONVERTED_TO_NEGOTIATION: 'CONVERTED',
  SCHEDULED_RETURN: 'WORKING',
  NO_INTEREST: 'LOST',
  LOST: 'LOST',
  FORWARDED_TO_RESPONSIBLE: 'WORKING',
  DUPLICATED: 'DISCARDED',
  INVALID_ATTENDANCE: 'DISCARDED',
}

const onlyDigits = (s: string) => s.replace(/\D/g, '')

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
  existingCustomerId?: string | null
  attendanceType?: string | null
  customerName?: string | null
  customerPhone?: string | null
  customerEmail?: string | null
}

// Tipo do atendimento → tipo da negociação (Deal). Default VENDA.
const TYPE_TO_DEAL: Record<string, 'VENDA' | 'COMPRA' | 'TROCA' | 'CONSIGNACAO'> = {
  SALE: 'VENDA', PURCHASE: 'COMPRA', EXCHANGE: 'TROCA', CONSIGNMENT: 'CONSIGNACAO',
}

// Telefone NORMALIZADO (só dígitos) p/ dedup robusta, independente da máscara.
async function customerIdByPhone(tenantId: string, digits: string): Promise<string | null> {
  if (digits.length < 10) return null
  const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM customers WHERE "tenantId" = ${tenantId} AND regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = ${digits} ORDER BY "createdAt" DESC LIMIT 1`.catch(() => [] as { id: string }[])
  return rows[0]?.id ?? null
}
async function leadIdByPhone(tenantId: string, digits: string): Promise<string | null> {
  if (digits.length < 10) return null
  const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM marketing_leads WHERE "tenantId" = ${tenantId} AND regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = ${digits} ORDER BY "createdAt" DESC LIMIT 1`.catch(() => [] as { id: string }[])
  return rows[0]?.id ?? null
}

export interface AttendanceLeadResult {
  leadId: string | null
  dealId: string | null
  customerId: string | null
}

/** Acha um Cliente existente por e-mail (insensitive) ou telefone normalizado. */
async function findCustomer(tenantId: string, phone: string | null, email: string | null): Promise<string | null> {
  if (email) {
    const c = await prisma.customer.findFirst({ where: { tenantId, email: { equals: email, mode: 'insensitive' } }, select: { id: true }, orderBy: { createdAt: 'desc' } }).catch(() => null)
    if (c) return c.id
  }
  if (phone) { const id = await customerIdByPhone(tenantId, onlyDigits(phone)); if (id) return id }
  return null
}

/** Acha um Lead existente por cliente, e-mail ou telefone normalizado (reuso). */
async function findLead(tenantId: string, customerId: string | null, phone: string | null, email: string | null): Promise<string | null> {
  if (customerId) {
    const byCust = await prisma.marketingLead.findFirst({ where: { tenantId, customerId }, orderBy: { createdAt: 'desc' }, select: { id: true } }).catch(() => null)
    if (byCust) return byCust.id
  }
  if (email) {
    const l = await prisma.marketingLead.findFirst({ where: { tenantId, email: { equals: email, mode: 'insensitive' } }, select: { id: true }, orderBy: { createdAt: 'desc' } }).catch(() => null)
    if (l) return l.id
  }
  if (phone) { const id = await leadIdByPhone(tenantId, onlyDigits(phone)); if (id) return id }
  return null
}

export async function ensureAttendanceLead(opts: AttendanceLeadInput): Promise<AttendanceLeadResult> {
  const now = new Date()
  const status = RESULT_TO_STATUS[opts.result] ?? 'WORKING'
  const converted = opts.result === 'CONVERTED_TO_NEGOTIATION' || !!opts.dealId

  const arrival = opts.arrivalId
    ? await prisma.sellerQueueCustomerArrival.findUnique({ where: { id: opts.arrivalId }, select: { customerName: true, customerPhone: true, customerEmail: true, customerId: true, leadId: true } }).catch(() => null)
    : null

  const name = opts.customerName?.trim() || arrival?.customerName || null
  const phone = opts.customerPhone?.trim() || arrival?.customerPhone || null
  const email = opts.customerEmail?.trim() || arrival?.customerEmail || null

  // ── (b) CLIENTE: acha-ou-cria, sem duplicar ────────────────────────────────
  let customerId = opts.existingCustomerId || arrival?.customerId || null
  if (!customerId) customerId = await findCustomer(opts.tenantId, phone, email)
  if (customerId) {
    // Completa dados que faltarem (não sobrescreve com vazio).
    await prisma.customer.update({ where: { id: customerId }, data: { ...(name ? { name } : {}), ...(phone ? { phone } : {}), ...(email ? { email } : {}) } }).catch(() => {})
  } else if (name || phone || email) {
    const c = await prisma.customer.create({ data: { tenantId: opts.tenantId, name: name ?? 'Cliente', phone, email } }).catch(() => null)
    customerId = c?.id ?? null
  }

  // ── LEAD: reaproveita SEMPRE o mesmo (sem duplicar) ─────────────────────────
  let leadId = opts.existingLeadId || arrival?.leadId || null
  if (!leadId) leadId = await findLead(opts.tenantId, customerId, phone, email)

  // ── (a) NEGOCIAÇÃO: se virou negociação e ainda não há Deal, cria RASCUNHO ──
  let dealId = opts.dealId || null
  if (converted && !dealId) {
    const dealNumber = await generateDealNumber(opts.tenantId).catch(() => undefined)
    const deal = await prisma.deal.create({
      data: {
        dealNumber, tenantId: opts.tenantId, unitId: opts.unitId, sellerId: opts.sellerId,
        customerId, type: TYPE_TO_DEAL[opts.attendanceType ?? ''] ?? 'VENDA', status: 'RASCUNHO', source: 'FILA_ATENDIMENTO',
      },
    }).catch(() => null)
    dealId = deal?.id ?? null
  }

  const convertedFields = converted ? { status: 'CONVERTED' as LeadStatus, convertedDealId: dealId ?? undefined, convertedAt: now } : {}
  const lostFields = status === 'LOST' && !converted ? { lostReason: opts.result } : {}
  const common = {
    assignedToUserId: opts.sellerId, lastContactAt: now, customerId,
    status: converted ? ('CONVERTED' as LeadStatus) : status,
    ...convertedFields, ...lostFields,
    ...(name ? { name } : {}), ...(phone ? { phone } : {}), ...(email ? { email } : {}),
  }

  if (leadId) {
    const upd = await prisma.marketingLead.update({ where: { id: leadId }, data: common }).catch(() => null)
    return { leadId: upd?.id ?? leadId, dealId, customerId }
  }

  const created = await prisma.marketingLead.create({
    data: {
      tenantId: opts.tenantId, unitId: opts.unitId, source: 'FILA_ATENDIMENTO',
      createdById: opts.actorId, notes: opts.notes ?? null,
      metadata: { fromQueue: true, attendanceId: opts.attendanceId, arrivalId: opts.arrivalId },
      ...common,
    },
  }).catch(() => null)
  return { leadId: created?.id ?? null, dealId, customerId }
}
