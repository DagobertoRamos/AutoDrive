// =============================================================================
// CRM — processa um lead recebido por um canal de captação (URL de entrada
// ou botão "Enviar lead de teste"). Fluxo do Gateway de Entrada:
//   validar (canal ativo, conteúdo, chave) → GRAVAR o evento bruto (único por
//   canal + id do lead / corpo) → processar (regra única de inbound-lead).
// Gravado o evento, o lead não se perde: se o processamento falhar, o job
// reprocessa e a plataforma recebe 202 (não precisa reenviar).
// =============================================================================

import { catalogItem, inboundLeadNotes, parseInboundLead, secretMatches, type LeadChannel } from './channels-core'
import { appendChannelLog, loadChannels, type ChannelLogEntry } from './channels'
import { createInboundLead } from './inbound-lead'
import { loadPipelines } from './pipelines'
import { extractTouch } from './attribution-core'
import { processInboxEvent, receiveEvent, recordRejected, type InboxHandler } from '@/lib/integrations/inbox'
import { PermanentInboxError, stripAuthKeys } from '@/lib/integrations/inbox-core'

export interface IntakeResult { status: number; body: Record<string, unknown> }

export const CHANNEL_PROVIDER = 'CRM_CHANNEL'

export async function intakeChannelLead(tenantId: string, channel: LeadChannel, body: unknown, authorization: string | null): Promise<IntakeResult> {
  const at = new Date().toISOString()
  const log = (e: Omit<ChannelLogEntry, 'at' | 'channelId'>) => appendChannelLog(tenantId, { at, channelId: channel.id, ...e })
  const base = { provider: CHANNEL_PROVIDER, kind: 'LEAD' as const, tenantId, channelRef: channel.id, scope: `${tenantId}:${channel.id}`, payload: stripAuthKeys(body) }

  if (!channel.active) {
    await log({ ok: false, outcome: 'rejected', message: 'Canal desativado' })
    await recordRejected(base, 'Canal desativado')
    return { status: 403, body: { success: false, error: 'Canal desativado.' } }
  }
  const parsed = parseInboundLead(body, { authorization })
  if (!parsed.ok) {
    await log({ ok: false, outcome: 'rejected', message: parsed.error })
    await recordRejected(base, parsed.error)
    // 4xx: a plataforma não reenvia (o problema é o conteúdo, não o servidor).
    return { status: 422, body: { success: false, error: parsed.error } }
  }
  if (!secretMatches(channel, parsed.secret)) {
    await log({ ok: false, outcome: 'rejected', message: 'Chave secreta não confere' })
    return { status: 401, body: { success: false, error: 'Chave inválida.' } }
  }

  // Grava ANTES de processar. Mesmo lead (id da plataforma) ou mesmo corpo = mesmo evento.
  let ev
  try {
    ev = await receiveEvent({ ...base, providerEventId: parsed.lead.externalId || null })
  } catch (err) {
    console.error('[crm/channels] não gravou o evento:', err)
    await log({ ok: false, outcome: 'error', message: 'Erro ao gravar no CRM', name: parsed.lead.name })
    // 5xx: nada foi gravado — Google/TikTok/OLX reenviam depois.
    return { status: 500, body: { success: false, error: 'Falha temporária. Tente novamente.' } }
  }
  if (ev.duplicate && ev.status === 'PROCESSED') {
    await log({ ok: true, outcome: 'duplicate', message: 'Lead repetido pela plataforma: ignorado', leadId: ev.resultRef ?? undefined, name: parsed.lead.name })
    return { status: 200, body: { success: true, leadId: ev.resultRef, outcome: 'duplicate', eventId: ev.correlationId } }
  }

  const r = await processInboxEvent(ev.id, handleChannelLeadEvent)
  if (r.status === 'PROCESSED') {
    const outcome = (r.extra?.outcome as 'created' | 'existing' | 'duplicate' | undefined) ?? 'created'
    const msg = outcome === 'created' ? 'Lead criado' : outcome === 'existing' ? 'Cliente já tinha lead aberto: registrado como novo contato' : 'Lead repetido pela plataforma: ignorado'
    await log({ ok: true, outcome, message: msg, leadId: r.resultRef ?? undefined, name: parsed.lead.name, test: parsed.lead.isTest || undefined })
    return { status: 200, body: { success: true, leadId: r.resultRef, outcome, eventId: ev.correlationId } }
  }
  await log({ ok: false, outcome: 'error', message: 'Recebido; o CRM vai tentar de novo automaticamente', name: parsed.lead.name })
  // Já está gravado: a plataforma não precisa reenviar.
  return { status: 202, body: { success: true, queued: true, eventId: ev.correlationId } }
}

/** Processador do Gateway: transforma o evento gravado em lead (na hora ou pelo job). */
export const handleChannelLeadEvent: InboxHandler = async (row) => {
  if (!row.tenantId || !row.channelRef) throw new PermanentInboxError('Evento sem loja/canal.')
  const channel = (await loadChannels(row.tenantId)).find((c) => c.id === row.channelRef)
  if (!channel) throw new PermanentInboxError('Canal removido.')
  const parsed = parseInboundLead(row.payload)
  if (!parsed.ok) throw new PermanentInboxError(parsed.error)
  const lead = parsed.lead
  const label = catalogItem(channel.type)?.label ?? channel.name
  // Funil do canal só vale se ainda existir (e não for o padrão virtual).
  const pipelineId = channel.pipelineId
    ? (await loadPipelines(row.tenantId).catch(() => [])).find((p) => p.id === channel.pipelineId && !p.virtual && p.active)?.id ?? null
    : null
  const touch = extractTouch(lead.fields, {
    source: channel.sourceCode, channelId: channel.id, channelName: channel.name,
    ...(lead.campaign ? { campaign: lead.campaign } : {}), ...(lead.adName ? { adName: lead.adName } : {}), ...(lead.formName ? { formName: lead.formName } : {}),
    ...(lead.externalId ? { platformLeadId: lead.externalId } : {}), correlationId: row.correlationId ?? undefined,
  }, row.receivedAt)

  const r = await createInboundLead({
    tenantId: row.tenantId, source: channel.sourceCode,
    name: lead.isTest ? `TESTE — ${lead.name}` : lead.name,
    phone: lead.phone, email: lead.email || null,
    notes: inboundLeadNotes(lead, channel.name),
    vehicleTitle: lead.vehicle || null,
    externalLeadId: lead.externalId || null,
    externalListingId: touch.externalListingId ?? null,
    touch, correlationId: row.correlationId,
    metadata: {
      origin: 'CHANNEL', channelId: channel.id, channelType: channel.type, channelName: channel.name,
      ...(channel.leadType ? { leadType: channel.leadType } : {}),
      ...(channel.temperature ? { temperature: channel.temperature } : {}),
      campaign: lead.campaign || undefined, adName: lead.adName || undefined, formName: lead.formName || undefined,
      vehicleInterest: lead.vehicle || undefined, city: lead.city || undefined,
      answers: lead.answers.length ? Object.fromEntries(lead.answers) : undefined,
      test: lead.isTest || undefined,
    },
    authorName: channel.name, interactionChannel: channel.sourceCode,
    repeatPrefix: `Novo contato pelo canal "${channel.name}":`,
    notifyTitle: `Novo lead — ${label}`,
    notifyMessage: `${lead.name}${lead.vehicle ? ` — ${lead.vehicle}` : ''}. Aguardando responsável.`,
    pipelineId,
  })
  return { resultRef: r.leadId, extra: { outcome: r.outcome, leadNumber: r.leadNumber } }
}
