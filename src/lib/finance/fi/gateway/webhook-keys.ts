// =============================================================================
// Chave de webhook POR LOJA (BYOC): derivada da chave da plataforma
// (FINANCE_WEBHOOK_SECRET) + loja + canal. Cada loja cadastra no banco a SUA
// URL (?l=<loja>) e a SUA chave — uma loja nunca conhece a chave de outra, e a
// chave da plataforma nunca sai do servidor. Formato de UUID (o BV usa assim).
// =============================================================================

import { createHmac } from 'node:crypto'

export function tenantWebhookKey(platformSecret: string, tenantId: string, provider: string): string {
  const h = createHmac('sha256', platformSecret).update(`fi-webhook:${provider}:${tenantId}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`.toUpperCase()
}

export function tenantWebhookUrl(origin: string, provider: string, tenantId: string): string {
  return `${origin.replace(/\/+$/, '')}/api/webhook/financing/${encodeURIComponent(provider)}?l=${encodeURIComponent(tenantId)}`
}
