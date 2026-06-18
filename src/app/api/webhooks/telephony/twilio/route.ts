// =============================================================================
// POST /api/webhooks/telephony/twilio — webhook Twilio (PREPARADO).
// Público; autenticado por X-Twilio-Signature (doc pública). ?cid=<connectionId>.
// Confirmar conta/edge (HTTPS/proxy, JSON bodySHA256) antes de produção.
// =============================================================================

import { handleTelephonyWebhook } from '@/lib/telephony/webhook-handler'

export async function POST(req: Request) {
  return handleTelephonyWebhook(req, 'TWILIO')
}
