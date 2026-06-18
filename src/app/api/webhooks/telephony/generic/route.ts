// =============================================================================
// POST /api/webhooks/telephony/generic — webhook genérico (contrato AutoDrive).
// Público; autenticado por assinatura (HMAC-SHA256). ?cid=<connectionId>.
// =============================================================================

import { handleTelephonyWebhook } from '@/lib/telephony/webhook-handler'

export async function POST(req: Request) {
  return handleTelephonyWebhook(req, 'GENERIC_WEBHOOK')
}
