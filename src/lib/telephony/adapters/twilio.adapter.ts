// =============================================================================
// telephony/adapters/twilio.adapter.ts — webhook da Twilio (PREPARADO).
// Mapeamento e validação de assinatura baseados na documentação PÚBLICA da
// Twilio (status callbacks form-encoded + X-Twilio-Signature = base64 HMAC-SHA1
// sobre URL + params ordenados, com o Auth Token como segredo).
// ⚠️ CONFIRMAR com a conta/instalação oficial antes de produção (edge cases:
// proxies/HTTPS, body JSON com bodySHA256, sub-accounts). NÃO faz chamada de saída.
// =============================================================================

import crypto from 'node:crypto'
import type { TelephonyAdapter, TelephonyVerifyContext, NormalizedTelephonyEvent } from './types'
import { safeEqual, str, int, coerceDirection } from './base'
import type { CallStatus } from '@prisma/client'

const STATUS_MAP: Record<string, CallStatus> = {
  queued: 'RINGING', initiated: 'RINGING', ringing: 'RINGING', 'in-progress': 'ANSWERED',
  completed: 'COMPLETED', busy: 'BUSY', failed: 'FAILED', 'no-answer': 'MISSED', canceled: 'CANCELED',
}

export class TwilioAdapter implements TelephonyAdapter {
  readonly kind = 'TWILIO' as const
  // Preparado a partir da doc pública; requer validação na conta real.
  readonly ready = false

  // X-Twilio-Signature: base64( HMAC-SHA1( authToken, URL + sort(k+v).join('') ) ).
  verifySignature(ctx: TelephonyVerifyContext): boolean {
    const sig = ctx.headers.get('x-twilio-signature')
    if (!sig || !ctx.secret) return false
    const params = new URLSearchParams(ctx.rawBody)
    const keys = [...params.keys()].sort()
    let data = ctx.url
    for (const k of keys) data += k + params.get(k)
    const expected = crypto.createHmac('sha1', ctx.secret).update(data, 'utf8').digest('base64')
    return safeEqual(sig, expected)
  }

  normalize(payload: unknown): NormalizedTelephonyEvent | null {
    if (!payload || typeof payload !== 'object') return null
    const p = payload as Record<string, unknown>
    const callStatus = String(p.CallStatus ?? '').toLowerCase()
    const recUrl = str(p.RecordingUrl)
    return {
      externalId:     str(p.CallSid),
      providerCallId: str(p.CallSid),
      eventType:      callStatus || 'twilio',
      direction:      coerceDirection(String(p.Direction ?? '').toLowerCase().startsWith('inbound') ? 'INBOUND' : 'OUTBOUND'),
      status:         STATUS_MAP[callStatus] ?? 'RINGING',
      fromNumber:     str(p.From) ?? str(p.Caller),
      toNumber:       str(p.To) ?? str(p.Called),
      durationSec:    int(p.CallDuration) ?? int(p.RecordingDuration),
      recording: recUrl ? { url: recUrl, externalId: str(p.RecordingSid), durationSec: int(p.RecordingDuration), mimeType: 'audio/mpeg' } : undefined,
    }
  }
}
