// =============================================================================
// Site da loja — processador do Gateway de Entrada para o formulário do site.
// O corpo do formulário é gravado antes (webhook_inbox, provider SITE); este
// processador transforma o evento em lead pela regra única (inbound-lead), na
// hora ou depois, pelo job, se o banco falhar na primeira vez.
// =============================================================================

import { siteVehicleRef } from '@/lib/site/vehicles'
import { inspectionSummary, parseInspection } from '@/lib/evaluation/site-pre-evaluation'
import { buildLeadMessage, KIND_LABEL, parseSiteLead } from '@/lib/site/leads-core'
import { createInboundLead } from '@/lib/crm/inbound-lead'
import { extractTouch, type Touch } from '@/lib/crm/attribution-core'
import { PermanentInboxError } from '@/lib/integrations/inbox-core'
import type { InboxHandler } from '@/lib/integrations/inbox'

export const SITE_PROVIDER = 'SITE'

/** Toque de marketing do formulário (último toque) + o primeiro, se o navegador guardou. */
export function siteTouches(tracking: Record<string, string>, at: Date, correlationId?: string | null): { last: Touch; first: Touch | null } {
  const base = { source: 'SITE', channelName: 'Site da loja', ...(correlationId ? { correlationId } : {}) }
  const last = extractTouch({ ...tracking, landing_page: tracking.landingPage || tracking.pageUrl }, base, at)
  let first: Touch | null = null
  if (tracking.firstTouch) {
    try {
      const f = JSON.parse(tracking.firstTouch) as Record<string, string>
      const when = f.at && !Number.isNaN(Date.parse(f.at)) ? new Date(f.at) : at
      first = extractTouch(f, { source: 'SITE', channelName: 'Site da loja' }, when)
    } catch { /* ignora */ }
  }
  return { last, first }
}

export const handleSiteLeadEvent: InboxHandler = async (row) => {
  if (!row.tenantId) throw new PermanentInboxError('Evento sem loja.')
  const body = row.payload
  const parsed = parseSiteLead(body)
  if (!parsed.ok) throw new PermanentInboxError(parsed.error)
  const input = parsed.value
  const tenantId = row.tenantId
  const inspection = input.kind === 'sell_car' && body && typeof body === 'object' && 'inspection' in body
    ? (() => { const r = parseInspection((body as Record<string, unknown>).inspection); return r.ok ? r.value : null })()
    : null
  // Carro saiu do site depois do envio: o lead entra assim mesmo (sem o vínculo).
  const vehicle = input.vehicleId ? await siteVehicleRef(tenantId, input.vehicleId) : null
  const message = buildLeadMessage(input, vehicle?.title ?? null) + (inspection ? `\n${inspectionSummary(inspection)}` : '')
  const { last, first } = siteTouches(input.tracking, row.receivedAt, row.correlationId)
  const r = await createInboundLead({
    tenantId, source: 'SITE',
    name: input.name, phone: input.phone, email: input.email || null,
    notes: message,
    vehicleId: vehicle?.id ?? null, vehicleTitle: vehicle?.title ?? null,
    // Lead novo nasce com o primeiro toque do navegador + o atual.
    touch: last, firstTouch: first, correlationId: row.correlationId,
    metadata: { origin: 'SITE', siteKind: input.kind, ...(input.intent ? { intent: input.intent } : {}), details: input.details, tracking: input.tracking },
    authorName: 'Site da loja', authorId: 'site', interactionChannel: 'SITE', repeatPrefix: 'Nova solicitação pelo site:',
    notifyTitle: 'Novo lead do site',
    notifyMessage: `${input.name} — ${KIND_LABEL[input.kind]}${vehicle ? `: ${vehicle.title}` : ''}. Aguardando responsável.`,
  })
  return { resultRef: r.leadId, extra: { created: r.created, leadNumber: r.leadNumber, vehicle, input, inspection } }
}
