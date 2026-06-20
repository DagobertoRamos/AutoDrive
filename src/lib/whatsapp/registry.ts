// =============================================================================
// whatsapp/registry.ts — registro central de adaptadores de WhatsApp.
// Para adicionar um provedor novo: crie o adapter em ./adapters e some-o aqui.
// =============================================================================

import type { WhatsappAdapter, WhatsappProviderKind } from './types'
import { metaAdapter } from './adapters/meta'
import { twilioAdapter } from './adapters/twilio'

const ADAPTERS: Partial<Record<WhatsappProviderKind, WhatsappAdapter>> = {
  META:   metaAdapter,
  TWILIO: twilioAdapter,
  // ZENVIA: zenviaAdapter,  // <- basta criar o adapter e registrar aqui
}

/** Adapter pelo tipo (default META). null se o tipo não tem adapter implementado. */
export function getWhatsappAdapter(kind?: string | null): WhatsappAdapter | null {
  const k = (kind ?? 'META') as WhatsappProviderKind
  return ADAPTERS[k] ?? null
}

/** Lista de provedores disponíveis + campos (sem segredos) — para a UI. */
export function listWhatsappProviders() {
  return Object.values(ADAPTERS).map((a) => ({ kind: a.kind, label: a.label, fields: a.fields }))
}
