// =============================================================================
// CRM — processa um lead recebido por um canal de captação (URL de entrada
// ou botão "Enviar lead de teste"). Usa a mesma regra do site (inbound-lead).
// =============================================================================

import { catalogItem, inboundLeadNotes, parseInboundLead, secretMatches, type LeadChannel } from './channels-core'
import { appendChannelLog, type ChannelLogEntry } from './channels'
import { createInboundLead } from './inbound-lead'
import { loadPipelines } from './pipelines'

export interface IntakeResult { status: number; body: Record<string, unknown> }

export async function intakeChannelLead(tenantId: string, channel: LeadChannel, body: unknown, authorization: string | null): Promise<IntakeResult> {
  const at = new Date().toISOString()
  const log = (e: Omit<ChannelLogEntry, 'at' | 'channelId'>) => appendChannelLog(tenantId, { at, channelId: channel.id, ...e })

  if (!channel.active) {
    await log({ ok: false, outcome: 'rejected', message: 'Canal desativado' })
    return { status: 403, body: { success: false, error: 'Canal desativado.' } }
  }
  const parsed = parseInboundLead(body, { authorization })
  if (!parsed.ok) {
    await log({ ok: false, outcome: 'rejected', message: parsed.error })
    // 4xx: a plataforma não reenvia (o problema é o conteúdo, não o servidor).
    return { status: 422, body: { success: false, error: parsed.error } }
  }
  if (!secretMatches(channel, parsed.secret)) {
    await log({ ok: false, outcome: 'rejected', message: 'Chave secreta não confere' })
    return { status: 401, body: { success: false, error: 'Chave inválida.' } }
  }

  const lead = parsed.lead
  const label = catalogItem(channel.type)?.label ?? channel.name
  // Funil do canal só vale se ainda existir (e não for o padrão virtual).
  const pipelineId = channel.pipelineId
    ? (await loadPipelines(tenantId).catch(() => [])).find((p) => p.id === channel.pipelineId && !p.virtual && p.active)?.id ?? null
    : null

  try {
    const r = await createInboundLead({
      tenantId, source: channel.sourceCode,
      name: lead.isTest ? `TESTE — ${lead.name}` : lead.name,
      phone: lead.phone, email: lead.email || null,
      notes: inboundLeadNotes(lead, channel.name),
      vehicleTitle: lead.vehicle || null,
      externalLeadId: lead.externalId || null,
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
    const msg = r.outcome === 'created' ? 'Lead criado' : r.outcome === 'existing' ? 'Cliente já tinha lead aberto: registrado como novo contato' : 'Lead repetido pela plataforma: ignorado'
    await log({ ok: true, outcome: r.outcome, message: msg, leadId: r.leadId, leadNumber: r.leadNumber, name: lead.name, test: lead.isTest || undefined })
    return { status: 200, body: { success: true, leadId: r.leadId, leadNumber: r.leadNumber, outcome: r.outcome } }
  } catch (err) {
    console.error('[crm/channels] falha ao gravar lead:', err)
    await log({ ok: false, outcome: 'error', message: 'Erro ao gravar no CRM', name: lead.name })
    // 5xx: Google/TikTok/OLX reenviam depois.
    return { status: 500, body: { success: false, error: 'Falha temporária. Tente novamente.' } }
  }
}
