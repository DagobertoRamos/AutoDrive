// =============================================================================
// POST /api/webhooks/telephony/3cx — webhook 3CX (PREPARADO).
// Público; autenticado por assinatura. ?cid=<connectionId>. Confirmar com a
// doc/instalação oficial do 3CX antes de produção.
// =============================================================================

import { handleTelephonyWebhook } from '@/lib/telephony/webhook-handler'

export async function POST(req: Request) {
  return handleTelephonyWebhook(req, 'THREE_CX')
}
