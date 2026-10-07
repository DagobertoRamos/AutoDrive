// =============================================================================
// Caixa de Entrada — mensagem de CLIENTE recebida no WhatsApp da loja
// (WhatsApp Business Platform / Cloud API oficial). Processador do Gateway de
// Entrada (provider WHATSAPP). Por mensagem:
//   conversa da loja+número+cliente (cria se não existe) → grava a mensagem
//   (única pelo id do WhatsApp) → sem lead aberto, cria/acha pela regra única
//   (inbound-lead, com o anúncio de clique para WhatsApp como atribuição) →
//   avisa o responsável.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { createInboundLead } from '@/lib/crm/inbound-lead'
import { extractTouch } from '@/lib/crm/attribution-core'
import { normalizePhone } from '@/lib/crm/channels-core'
import { notify } from '@/services/notification.service'
import { PermanentInboxError } from '@/lib/integrations/inbox-core'
import type { InboxHandler } from '@/lib/integrations/inbox'
import { messagePreview, whatsappMessageText } from './inbox-core'

export const WHATSAPP_PROVIDER = 'WHATSAPP'

export interface WhatsappEventPayload {
  phoneNumberId: string
  message: Record<string, unknown>
  contact?: { profile?: { name?: string }; wa_id?: string } | null
}

const CLOSED_LEAD = ['CONVERTED', 'LOST', 'DISCARDED']
/** Não repete o aviso de "nova mensagem" se o cliente já mandou outra há menos disto. */
const NOTIFY_GAP_MS = 10 * 60_000

export const handleWhatsappEvent: InboxHandler = async (row) => {
  if (!row.tenantId) throw new PermanentInboxError('Número sem loja.')
  const p = row.payload as unknown as WhatsappEventPayload
  const msg = p?.message ?? {}
  const waId = String(msg.from ?? p?.contact?.wa_id ?? '').replace(/\D/g, '')
  const msgId = String(msg.id ?? '')
  if (!waId || !msgId) throw new PermanentInboxError('Mensagem sem remetente.')
  const tenantId = row.tenantId
  const at = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : row.receivedAt
  const name = p.contact?.profile?.name?.trim().slice(0, 120) || null
  const phone = normalizePhone(waId)
  const { type, text } = whatsappMessageText(msg)

  const conv = await prisma.conversation.upsert({
    where: { tenantId_channel_accountRef_externalContactId: { tenantId, channel: 'WHATSAPP', accountRef: p.phoneNumberId, externalContactId: waId } },
    create: { tenantId, channel: 'WHATSAPP', accountRef: p.phoneNumberId, externalContactId: waId, contactName: name, contactPhone: phone },
    update: { ...(name ? { contactName: name } : {}) },
  })

  // Mesma mensagem entregue de novo → nada a fazer.
  const already = await prisma.conversationMessage.findUnique({ where: { tenantId_externalMessageId: { tenantId, externalMessageId: msgId } }, select: { id: true } })
  if (already) return { resultRef: conv.id, extra: { duplicate: true } }
  try {
    await prisma.conversationMessage.create({
      data: { tenantId, conversationId: conv.id, direction: 'IN', externalMessageId: msgId, type, body: text, status: 'RECEIVED', sentAt: at, metadata: JSON.parse(JSON.stringify({ raw: msg })) },
    })
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') return { resultRef: conv.id, extra: { duplicate: true } }
    throw e
  }

  // Lead: só cria/acha quando a conversa ainda não tem lead aberto.
  let leadId = conv.leadId
  let assigned = conv.assignedToUserId
  let unitId = conv.unitId
  let createdLead = false
  if (leadId) {
    const lead = await prisma.marketingLead.findFirst({ where: { id: leadId, tenantId, deletedAt: null }, select: { status: true, assignedToUserId: true, unitId: true } })
    if (!lead || CLOSED_LEAD.includes(lead.status)) leadId = null
    else { assigned = lead.assignedToUserId ?? assigned; unitId = lead.unitId ?? unitId }
  }
  if (!leadId) {
    const referral = (msg.referral && typeof msg.referral === 'object' ? msg.referral : null) as Record<string, string> | null
    const touch = extractTouch({}, {
      source: 'WHATSAPP', channelName: referral ? 'Anúncio de clique para WhatsApp' : 'WhatsApp',
      ...(referral?.source_id ? { adId: referral.source_id } : {}),
      ...(referral?.headline ? { adName: referral.headline.slice(0, 160) } : {}),
      ...(referral?.source_url ? { landingPage: referral.source_url.slice(0, 300) } : {}),
      ...(referral?.ctwa_clid ? { fbclid: referral.ctwa_clid.slice(0, 300) } : {}),
      correlationId: row.correlationId ?? undefined,
    }, at)
    const r = await createInboundLead({
      tenantId, source: 'WHATSAPP',
      name: name ?? phone, phone, email: null,
      notes: `Mensagem recebida no WhatsApp da loja:\n${text}`.slice(0, 4000),
      externalLeadId: null, touch, correlationId: row.correlationId,
      metadata: { origin: 'WHATSAPP', conversationId: conv.id, ...(referral ? { ctwa: referral } : {}) },
      authorName: 'WhatsApp', interactionChannel: 'WHATSAPP',
      repeatPrefix: 'Nova conversa no WhatsApp:',
      notifyTitle: 'Nova conversa no WhatsApp',
      notifyMessage: `${name ?? phone}: "${messagePreview(text, 80)}". Aguardando responsável.`,
    })
    leadId = r.leadId
    createdLead = r.created
    const lead = await prisma.marketingLead.findUnique({ where: { id: r.leadId }, select: { assignedToUserId: true, unitId: true, vehicleId: true, customerId: true } })
    assigned = lead?.assignedToUserId ?? assigned
    unitId = lead?.unitId ?? unitId
    if (lead) await prisma.conversation.update({ where: { id: conv.id }, data: { vehicleId: conv.vehicleId ?? lead.vehicleId, customerId: conv.customerId ?? lead.customerId } }).catch(() => {})
  }

  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      leadId, assignedToUserId: assigned, unitId, status: 'OPEN',
      lastMessageAt: at, lastInboundAt: at, lastMessagePreview: messagePreview(text, 140), unreadCount: { increment: 1 },
    },
  })

  // Aviso ao responsável (lead novo já avisa pela regra única).
  const quiet = conv.lastInboundAt && at.getTime() - conv.lastInboundAt.getTime() < NOTIFY_GAP_MS
  if (assigned && !createdLead && !quiet) {
    await notify({
      tenantId, userId: assigned, type: 'SISTEMA', title: `Nova mensagem de ${name ?? phone}`,
      message: messagePreview(text, 120), actionUrl: `/crm/conversas?c=${conv.id}`,
      metadata: { kind: 'conversation_message', conversationId: conv.id }, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'],
    }).catch(() => {})
  }
  return { resultRef: conv.id }
}

/** Status de entrega/leitura de mensagem enviada pela Caixa de Entrada. */
export async function applyWhatsappStatus(status: { id?: string; status?: string; errors?: { title?: string; message?: string }[] }) {
  if (!status?.id || !status.status) return
  const map: Record<string, string> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' }
  const next = map[status.status]
  if (!next) return
  const order = ['PENDING', 'SENT', 'DELIVERED', 'READ']
  const msg = await prisma.conversationMessage.findFirst({ where: { externalMessageId: status.id, direction: 'OUT' }, select: { id: true, status: true } })
  if (!msg) return
  // Não volta status (o "lido" pode chegar antes do "entregue").
  if (next !== 'FAILED' && order.indexOf(next) <= order.indexOf(msg.status)) return
  const err = status.errors?.[0]
  await prisma.conversationMessage.update({ where: { id: msg.id }, data: { status: next, ...(next === 'FAILED' ? { error: (err?.message || err?.title || 'Falha no envio').slice(0, 300) } : {}) } })
}
