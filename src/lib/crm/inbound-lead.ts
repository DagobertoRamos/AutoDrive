// =============================================================================
// CRM — entrada de lead vindo de fora (site da loja, canais de captação).
// Regra única para todo lead externo:
//   1. mesmo lead da plataforma (source + externalLeadId) → não duplica;
//   2. mesmo cliente com lead aberto (telefone/e-mail) → vira interação nele;
//   3. senão cria o lead, numera, põe no funil do canal, tenta distribuir
//      (Mesa SDR) — sem ninguém para receber, avisa os gestores — e dispara as
//      automações "Lead criado".
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveIdentity } from '@/lib/crm/dedup'
import { assignLeadNumber } from '@/lib/crm/lead-number'
import { fireAutomations } from '@/lib/crm/automations'
import { savePlacement } from '@/lib/crm/pipelines'
import { distributeLeadById } from '@/lib/marketing/distribution'
import { notify, notifyByRole } from '@/services/notification.service'

const MANAGER_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE']

export interface InboundLeadInput {
  tenantId: string
  source: string
  name: string
  phone: string
  email: string | null
  /** Observação do lead novo / texto da interação quando o lead já existe. */
  notes: string
  vehicleId?: string | null
  vehicleTitle?: string | null
  externalLeadId?: string | null
  metadata: Record<string, unknown>
  /** Quem "fala" na interação e no aviso (ex.: "Site da loja", "Facebook"). */
  authorName: string
  authorId?: string
  interactionChannel: string
  /** Prefixo do texto da interação em lead já aberto. */
  repeatPrefix: string
  notifyTitle: string
  notifyMessage: string
  pipelineId?: string | null
}

export interface InboundLeadResult {
  leadId: string
  leadNumber: number | null
  created: boolean
  /** 'duplicate' = mesmo lead da plataforma reenviado; 'existing' = cliente com lead aberto. */
  outcome: 'created' | 'existing' | 'duplicate'
}

export async function createInboundLead(i: InboundLeadInput): Promise<InboundLeadResult> {
  const { tenantId } = i
  const now = new Date()

  // 1) Reenvio do mesmo lead pela plataforma (webhooks reentregam).
  if (i.externalLeadId) {
    const same = await prisma.marketingLead.findFirst({
      where: { tenantId, source: i.source, deletedAt: null, metadata: { path: ['externalLeadId'], equals: i.externalLeadId } as never },
      select: { id: true, leadNumber: true },
    })
    if (same) return { leadId: same.id, leadNumber: same.leadNumber, created: false, outcome: 'duplicate' }
  }

  // 2) Mesmo cliente com lead aberto → registra no lead existente. O telefone é
  // gravado formatado ("(11) 97777-1234"): pré-filtra pelos 4 últimos dígitos e
  // compara os números normalizados (8 últimos dígitos, ignora DDI/9º dígito).
  const phoneDigits = i.phone.replace(/\D/g, '')
  const or: Prisma.MarketingLeadWhereInput[] = []
  if (phoneDigits.length >= 8) or.push({ phone: { contains: phoneDigits.slice(-4) } })
  if (i.email) or.push({ email: { equals: i.email, mode: 'insensitive' } })
  const candidates = or.length
    ? await prisma.marketingLead.findMany({
      where: { tenantId, deletedAt: null, status: { notIn: ['CONVERTED', 'LOST', 'DISCARDED'] }, OR: or },
      select: { id: true, leadNumber: true, vehicleId: true, phone: true, email: true, name: true, assignedToUserId: true, metadata: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })
    : []
  const tail = phoneDigits.slice(-8)
  const existing = (tail.length === 8 ? candidates.find((c) => (c.phone ?? '').replace(/\D/g, '').slice(-8) === tail) : undefined)
    ?? (i.email ? candidates.find((c) => c.email?.toLowerCase() === i.email!.toLowerCase()) : undefined)
  if (existing) {
    await prisma.crmLeadInteraction.create({
      data: { tenantId, leadId: existing.id, type: 'NOTE', channel: i.interactionChannel, summary: `🔁 Cliente em atendimento abriu um novo pedido — ${i.repeatPrefix}\n${i.notes}`, discussedVehicle: i.vehicleTitle ?? null, authorId: i.authorId ?? 'system', authorName: i.authorName, occurredAt: now },
    }).catch(() => {})
    // Marca o retorno no lead (selo "Voltou a pedir" no CRM até alguém abrir o lead).
    const meta = (existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata) ? existing.metadata : {}) as Record<string, unknown>
    const returns = (typeof meta.returnCount === 'number' ? meta.returnCount : 0) + 1
    await prisma.marketingLead.update({
      where: { id: existing.id },
      data: {
        lastContactAt: now, ...(i.vehicleId && !existing.vehicleId ? { vehicleId: i.vehicleId } : {}),
        metadata: JSON.parse(JSON.stringify({ ...meta, returnCount: returns, lastReturnAt: now.toISOString(), lastReturnFrom: i.authorName, lastReturnVehicle: i.vehicleTitle ?? null, returnSeenAt: null })) as Prisma.InputJsonValue,
      },
    })
    // Avisa quem está atendendo (sem responsável: os gestores).
    const who = existing.name || i.name
    const title = 'Cliente em atendimento abriu novo pedido'
    const message = `${who}${existing.leadNumber ? ` (lead #${existing.leadNumber})` : ''} pediu de novo pelo ${i.authorName}${i.vehicleTitle ? `: ${i.vehicleTitle}` : ''}.${returns > 1 ? ` É o ${returns}º pedido.` : ''}`
    const base = { tenantId, type: 'SISTEMA', title, message, actionUrl: `/crm/leads/${existing.id}`, metadata: { kind: 'inbound_lead_return', leadId: existing.id, source: i.source, returns }, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'] as ('APP_WEB' | 'APP_MOBILE' | 'PUSH')[] }
    if (existing.assignedToUserId) await notify({ ...base, userId: existing.assignedToUserId }).catch(() => {})
    else await notifyByRole({ ...base, roles: MANAGER_ROLES }).catch(() => {})
    return { leadId: existing.id, leadNumber: existing.leadNumber, created: false, outcome: 'existing' }
  }

  // 3) Lead novo.
  const identity = await resolveIdentity(tenantId, { phone: i.phone || null, email: i.email, name: i.name, source: i.source, cpf: null, externalLeadId: i.externalLeadId ?? null }).catch(() => null)
  const lead = await prisma.marketingLead.create({
    data: {
      tenantId, status: 'NEW', source: i.source,
      name: i.name, phone: i.phone || null, email: i.email,
      notes: i.notes,
      ...(i.vehicleId ? { vehicleId: i.vehicleId } : {}),
      ...(identity?.customerId ? { customerId: identity.customerId } : {}),
      // JSON ida-e-volta tira os campos `undefined` (o Prisma recusa em Json).
      metadata: JSON.parse(JSON.stringify({ ...i.metadata, ...(i.externalLeadId ? { externalLeadId: i.externalLeadId } : {}) })) as Prisma.InputJsonValue,
    },
    select: { id: true },
  })
  const leadNumber = await assignLeadNumber(lead.id, tenantId)
  if (i.pipelineId) {
    await savePlacement({ tenantId, leadId: lead.id, pipelineId: i.pipelineId, stageId: null, stageChanged: true }).catch(() => {})
  }

  const distributed = await distributeLeadById(tenantId, lead.id).catch(() => false)
  if (!distributed) {
    await notifyByRole({
      tenantId, roles: MANAGER_ROLES, type: 'SISTEMA', actionUrl: `/crm/leads/${lead.id}`,
      title: i.notifyTitle, message: i.notifyMessage,
      metadata: { kind: 'inbound_lead', leadId: lead.id, source: i.source }, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'],
    }).catch(() => {})
  }
  await fireAutomations(tenantId, 'LEAD_CREATED', lead.id)
  return { leadId: lead.id, leadNumber, created: true, outcome: 'created' }
}
