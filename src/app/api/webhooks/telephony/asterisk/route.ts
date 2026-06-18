// =============================================================================
// POST /api/webhooks/telephony/asterisk — webhook Asterisk (PREPARADO).
// Público; autenticado por assinatura. ?cid=<connectionId>. Confirmar com a
// instalação/doc oficial antes de produção.
// =============================================================================

import { handleTelephonyWebhook } from '@/lib/telephony/webhook-handler'

export async function POST(req: Request) {
  return handleTelephonyWebhook(req, 'ASTERISK')
}
