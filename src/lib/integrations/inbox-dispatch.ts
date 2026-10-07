// =============================================================================
// Gateway de Entrada — despachante: provedor do evento → processador.
// Um canal novo só precisa registrar o processador aqui (o resto — gravação,
// idempotência, novas tentativas, saúde — é comum a todos).
// Também roda no tick (/api/queue/jobs/tick): reprocessa falhas e aplica a
// retenção do corpo original.
// =============================================================================

import { duePendingEvents, processInboxEvent, purgeOldPayloads, type InboxHandler } from './inbox'

export async function handlerFor(provider: string): Promise<InboxHandler | null> {
  switch (provider) {
    case 'CRM_CHANNEL': return (await import('@/lib/crm/channel-intake')).handleChannelLeadEvent
    case 'SITE': return (await import('@/lib/site/site-lead-intake')).handleSiteLeadEvent
    case 'EMAIL': return (await import('@/lib/crm/email-intake')).handleEmailLeadEvent
    case 'WHATSAPP': return (await import('@/lib/inbox/whatsapp-inbound')).handleWhatsappEvent
    default: return null
  }
}

/** Job: (re)processa eventos pendentes. Limitado por execução para não estourar o tempo da função. */
export async function runInboxJob(opts: { limit?: number; budgetMs?: number } = {}) {
  const started = Date.now()
  const budget = opts.budgetMs ?? 20_000
  const due = await duePendingEvents(opts.limit ?? 25)
  const out = { picked: due.length, processed: 0, failed: 0, purged: 0 }
  for (const ev of due) {
    if (Date.now() - started > budget) break
    const handler = await handlerFor(ev.provider)
    if (!handler) continue
    const r = await processInboxEvent(ev.id, handler)
    if (r.status === 'PROCESSED' || r.status === 'IGNORED') out.processed++
    else out.failed++
  }
  out.purged = await purgeOldPayloads()
  return out
}
