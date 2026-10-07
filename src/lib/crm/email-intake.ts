// =============================================================================
// CRM — e-mail de lead → lead (processador do Gateway de Entrada, provider EMAIL).
// Cada canal de captação tem um endereço exclusivo leads+<chave>@<domínio de
// entrada>. O e-mail original fica gravado (auditoria/reprocessamento).
// =============================================================================

import { catalogItem } from './channels-core'
import { loadChannels } from './channels'
import { createInboundLead } from './inbound-lead'
import { extractTouch } from './attribution-core'
import { parseLeadEmail, type InboundEmail } from './email-lead-core'
import { PermanentInboxError } from '@/lib/integrations/inbox-core'
import type { InboxHandler } from '@/lib/integrations/inbox'

export const EMAIL_PROVIDER = 'EMAIL'

/** Domínio de entrada de e-mails da plataforma (MX apontado para o serviço de recebimento). */
export const inboundEmailDomain = () => (process.env.INBOUND_EMAIL_DOMAIN ?? '').trim().toLowerCase() || null

export const handleEmailLeadEvent: InboxHandler = async (row) => {
  if (!row.tenantId || !row.channelRef) throw new PermanentInboxError('Evento sem loja/canal.')
  const channel = (await loadChannels(row.tenantId)).find((c) => c.id === row.channelRef)
  if (!channel) throw new PermanentInboxError('Canal removido.')
  if (!channel.active) return { ignored: 'Canal desativado' }
  const mail = row.payload as unknown as InboundEmail
  const p = parseLeadEmail(mail)
  if (!p.phone && !p.email) throw new PermanentInboxError('E-mail sem telefone nem e-mail do cliente.')
  // Canal genérico de portais: a origem é o portal que mandou o e-mail.
  const source = (channel.type === 'USADOSBR' || channel.type === 'GENERIC') && p.portal ? p.portal.code : channel.sourceCode
  const portalName = p.portal?.label ?? channel.name
  const notes = [
    `Lead recebido por e-mail${p.portal ? ` (${p.portal.label})` : ''}.`,
    mail.subject && `Assunto: ${mail.subject}`,
    p.vehicle && `Veículo de interesse: ${p.vehicle}`,
    p.message && `Mensagem: ${p.message}`,
    p.listingUrl && `Anúncio: ${p.listingUrl}`,
  ].filter(Boolean).join('\n')
  const touch = extractTouch({}, {
    source, channelId: channel.id, channelName: channel.name,
    ...(p.listingId ? { externalListingId: p.listingId } : {}), ...(p.listingUrl ? { landingPage: p.listingUrl } : {}),
    correlationId: row.correlationId ?? undefined,
  }, row.receivedAt)
  const r = await createInboundLead({
    tenantId: row.tenantId, source,
    name: p.name || 'Lead sem nome', phone: p.phone, email: p.email || null,
    notes, vehicleTitle: p.vehicle || null,
    externalLeadId: mail.messageId ? `email:${mail.messageId}` : null,
    externalListingId: p.listingId || null,
    touch, correlationId: row.correlationId,
    metadata: {
      origin: 'EMAIL', channelId: channel.id, channelType: channel.type, channelName: channel.name,
      ...(channel.leadType ? { leadType: channel.leadType } : {}),
      ...(channel.temperature ? { temperature: channel.temperature } : {}),
      vehicleInterest: p.vehicle || undefined, listingUrl: p.listingUrl || undefined, plate: p.plate || undefined,
      emailFrom: mail.from, emailSubject: mail.subject,
    },
    authorName: portalName, interactionChannel: source,
    repeatPrefix: `Novo contato por e-mail (${portalName}):`,
    notifyTitle: `Novo lead — ${catalogItem(channel.type)?.label ?? portalName}`,
    notifyMessage: `${p.name || 'Cliente'}${p.vehicle ? ` — ${p.vehicle}` : ''}. Aguardando responsável.`,
  })
  return { resultRef: r.leadId, extra: { outcome: r.outcome } }
}
