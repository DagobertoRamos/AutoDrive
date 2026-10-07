// =============================================================================
// Caixa de Entrada — leitura, resposta e atribuição de conversas (servidor).
// Escopo igual ao do CRM: vendedor vê as suas; gerente, as da unidade (e as
// ainda sem unidade); quem vê tudo, todas.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { CrmScope } from '@/lib/crm/shared'
import { getTenantWhatsappConfig } from '@/lib/whatsapp/credentials'
import { getWhatsappAdapter } from '@/lib/whatsapp/registry'
import { canReplyNow, messagePreview } from './inbox-core'

export interface InboxUser { id: string; name: string | null; unitId: string | null }

export function conversationScope(scope: CrmScope, user: InboxUser): Prisma.ConversationWhereInput {
  if (scope === 'own') return { assignedToUserId: user.id }
  if (scope === 'unit') return { OR: [{ unitId: user.unitId ?? '__missing_unit__' }, { unitId: null }] }
  return {}
}

export type InboxFilter = 'todos' | 'meus' | 'nao_respondidos' | 'pendentes'

/**
 * A conversa acompanha o lead: se o lead foi transferido/distribuído para outro
 * vendedor, a conversa vai junto (mesmo responsável e unidade).
 */
export async function syncConversationOwners(tenantId: string) {
  await prisma.$executeRaw`
    UPDATE "conversations" c
       SET "assignedToUserId" = l."assignedToUserId", "unitId" = COALESCE(l."unitId", c."unitId"), "updatedAt" = now() AT TIME ZONE 'UTC'
      FROM "marketing_leads" l
     WHERE c."leadId" = l."id" AND c."tenantId" = ${tenantId} AND c."status" <> 'CLOSED'
       AND l."assignedToUserId" IS NOT NULL AND c."assignedToUserId" IS DISTINCT FROM l."assignedToUserId"`.catch(() => 0)
}

export async function listConversations(tenantId: string, scope: CrmScope, user: InboxUser, opts: { filter?: InboxFilter; q?: string; take?: number } = {}) {
  await syncConversationOwners(tenantId)
  const and: Prisma.ConversationWhereInput[] = [{ tenantId }, conversationScope(scope, user)]
  if (opts.filter === 'meus') and.push({ assignedToUserId: user.id })
  if (opts.filter === 'nao_respondidos') and.push({ status: { not: 'CLOSED' }, lastInboundAt: { not: null }, OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lt: prisma.conversation.fields.lastInboundAt } }] })
  if (opts.filter === 'pendentes') and.push({ status: 'PENDING' })
  if (opts.filter !== 'pendentes') and.push({ status: { not: 'CLOSED' } })
  const q = (opts.q ?? '').trim()
  if (q) and.push({ OR: [{ contactName: { contains: q, mode: 'insensitive' } }, { contactPhone: { contains: q } }, { lastMessagePreview: { contains: q, mode: 'insensitive' } }] })
  const rows = await prisma.conversation.findMany({ where: { AND: and }, orderBy: { lastMessageAt: 'desc' }, take: opts.take ?? 100 })
  // Nomes de responsável e veículo de uma vez (sem relações no schema).
  const userIds = [...new Set(rows.map((r) => r.assignedToUserId).filter(Boolean) as string[])]
  const vehicleIds = [...new Set(rows.map((r) => r.vehicleId).filter(Boolean) as string[])]
  const [users, vehicles] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
    vehicleIds.length ? prisma.vehicle.findMany({ where: { id: { in: vehicleIds }, tenantId }, select: { id: true, brand: true, model: true, version: true } }) : [],
  ])
  const uName = new Map(users.map((u) => [u.id, u.name]))
  const vName = new Map(vehicles.map((v) => [v.id, [v.brand, v.model, v.version].filter(Boolean).join(' ')]))
  return rows.map((r) => ({
    id: r.id, channel: r.channel, contactName: r.contactName, contactPhone: r.contactPhone, status: r.status,
    unreadCount: r.unreadCount, lastMessageAt: r.lastMessageAt, lastMessagePreview: r.lastMessagePreview,
    awaitingReply: !!r.lastInboundAt && (!r.lastOutboundAt || r.lastOutboundAt < r.lastInboundAt),
    leadId: r.leadId, assignedToUserId: r.assignedToUserId, assignedToName: r.assignedToUserId ? uName.get(r.assignedToUserId) ?? null : null,
    vehicleTitle: r.vehicleId ? vName.get(r.vehicleId) ?? null : null,
  }))
}

export async function loadConversation(tenantId: string, id: string, scope: CrmScope, user: InboxUser) {
  return prisma.conversation.findFirst({ where: { AND: [{ id, tenantId }, conversationScope(scope, user)] } })
}

export async function conversationDetail(tenantId: string, conv: NonNullable<Awaited<ReturnType<typeof loadConversation>>>) {
  const [messages, lead, vehicle, assignee] = await Promise.all([
    prisma.conversationMessage.findMany({ where: { conversationId: conv.id }, orderBy: { sentAt: 'asc' }, take: 300, select: { id: true, direction: true, type: true, body: true, status: true, error: true, authorName: true, sentAt: true } }),
    conv.leadId ? prisma.marketingLead.findFirst({ where: { id: conv.leadId, tenantId }, select: { id: true, leadNumber: true, status: true, source: true, name: true, metadata: true, convertedDealId: true } }) : null,
    conv.vehicleId ? prisma.vehicle.findFirst({ where: { id: conv.vehicleId, tenantId }, select: { id: true, brand: true, model: true, version: true, modelYear: true, plate: true, salePrice: true, stockStatus: true } }) : null,
    conv.assignedToUserId ? prisma.user.findUnique({ where: { id: conv.assignedToUserId }, select: { id: true, name: true } }) : null,
  ])
  const meta = (lead?.metadata && typeof lead.metadata === 'object' ? lead.metadata : {}) as Record<string, unknown>
  return {
    conversation: {
      id: conv.id, channel: conv.channel, contactName: conv.contactName, contactPhone: conv.contactPhone, status: conv.status,
      lastInboundAt: conv.lastInboundAt, reply: canReplyNow(conv.channel, conv.lastInboundAt),
    },
    messages,
    lead: lead ? {
      id: lead.id, number: lead.leadNumber, status: lead.status, source: lead.source, convertedDealId: lead.convertedDealId,
      attribution: meta.attribution ?? null, vehicleSold: meta.vehicleSold ?? null, similarVehicles: meta.similarVehicles ?? null,
    } : null,
    vehicle: vehicle ? { ...vehicle, salePrice: vehicle.salePrice ? Number(vehicle.salePrice) : null } : null,
    assignee,
  }
}

export async function markConversationRead(id: string) {
  await prisma.conversation.update({ where: { id }, data: { unreadCount: 0 } }).catch(() => {})
}

export type SendResult = { ok: true; messageId: string } | { ok: false; status: number; error: string }

/** Resposta do vendedor pelo mesmo canal (hoje: WhatsApp oficial da loja). */
export async function sendConversationReply(tenantId: string, conv: NonNullable<Awaited<ReturnType<typeof loadConversation>>>, text: string, author: InboxUser): Promise<SendResult> {
  const body = text.trim().slice(0, 4000)
  if (!body) return { ok: false, status: 400, error: 'Escreva a mensagem.' }
  const check = canReplyNow(conv.channel, conv.lastInboundAt)
  if (!check.ok) return { ok: false, status: 409, error: check.message }

  const cfg = await getTenantWhatsappConfig(tenantId)
  const adapter = cfg ? getWhatsappAdapter(cfg.kind) : null
  if (!cfg || !adapter) return { ok: false, status: 409, error: 'O WhatsApp da loja não está conectado. Conecte em Configurações › Canais e integrações.' }

  const now = new Date()
  const msg = await prisma.conversationMessage.create({
    data: { tenantId, conversationId: conv.id, direction: 'OUT', type: 'TEXT', body, status: 'PENDING', authorUserId: author.id, authorName: author.name, sentAt: now },
  })
  try {
    const r = await adapter.sendText({ to: conv.externalContactId, text: body }, cfg.creds)
    await prisma.conversationMessage.update({ where: { id: msg.id }, data: { status: 'SENT', externalMessageId: r.id ?? null } })
  } catch (e) {
    console.error('[inbox] envio falhou:', e)
    await prisma.conversationMessage.update({ where: { id: msg.id }, data: { status: 'FAILED', error: 'O WhatsApp recusou o envio. Tente de novo em instantes.' } })
    return { ok: false, status: 502, error: 'O WhatsApp recusou o envio. Tente de novo em instantes.' }
  }
  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      lastOutboundAt: now, lastMessageAt: now, lastMessagePreview: messagePreview(body, 140), unreadCount: 0,
      ...(conv.firstResponseAt ? {} : { firstResponseAt: now }),
      // Quem responde uma conversa sem dono assume o atendimento.
      ...(conv.assignedToUserId ? {} : { assignedToUserId: author.id }),
    },
  })
  if (conv.leadId) {
    // Conta como contato com o cliente (SLA de primeiro contato) e entra na linha do tempo do lead.
    await prisma.marketingLead.updateMany({ where: { id: conv.leadId, tenantId }, data: { lastContactAt: now } }).catch(() => {})
    await prisma.crmLeadInteraction.create({
      data: { tenantId, leadId: conv.leadId, type: 'WHATSAPP', channel: 'WHATSAPP', summary: `Resposta pela Caixa de Entrada: ${messagePreview(body, 300)}`, authorId: author.id, authorName: author.name ?? 'Vendedor', occurredAt: now },
    }).catch(() => {})
  }
  return { ok: true, messageId: msg.id }
}
