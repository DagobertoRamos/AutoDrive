// =============================================================================
// telephony/adapters/generic.adapter.ts — webhook genérico (contrato AutoDrive).
// FUNCIONAL: definimos o contrato, então é seguro implementar por completo.
// Assinatura: header `x-autodrive-signature` = HMAC-SHA256(rawBody) em hex.
// Payload JSON esperado (todos opcionais exceto from/to p/ vincular lead):
// { event, callId, direction, status, from, to, extension, source,
//   startedAt, answeredAt, endedAt, durationSec,
//   recording: { url, fileName, mimeType, durationSec, sizeBytes, id } }
// =============================================================================

import type { TelephonyAdapter, TelephonyVerifyContext, NormalizedTelephonyEvent } from './types'
import { verifyHmacSha256Hex, str, int, toDate, coerceStatus, coerceDirection } from './base'

// Mapeia nomes de evento amigáveis → status, quando `status` não vem explícito.
const EVENT_TO_STATUS: Record<string, string> = {
  started: 'RINGING', ringing: 'RINGING', answered: 'ANSWERED', 'in-progress': 'ANSWERED',
  completed: 'COMPLETED', hangup: 'COMPLETED', missed: 'MISSED', 'no-answer': 'MISSED',
  busy: 'BUSY', failed: 'FAILED', voicemail: 'VOICEMAIL', canceled: 'CANCELED',
  recording: 'COMPLETED', recording_ready: 'COMPLETED',
}

export class GenericWebhookAdapter implements TelephonyAdapter {
  readonly kind = 'GENERIC_WEBHOOK' as const
  readonly ready = true

  verifySignature(ctx: TelephonyVerifyContext): boolean {
    return verifyHmacSha256Hex(ctx.rawBody, ctx.secret, ctx.headers.get('x-autodrive-signature'))
  }

  normalize(payload: unknown): NormalizedTelephonyEvent | null {
    if (!payload || typeof payload !== 'object') return null
    const p = payload as Record<string, unknown>
    const event = str(p.event)
    const status = p.status ? coerceStatus(p.status) : coerceStatus(EVENT_TO_STATUS[String(event ?? '').toLowerCase()] ?? 'RINGING')
    const rec = (p.recording && typeof p.recording === 'object') ? p.recording as Record<string, unknown> : null
    return {
      externalId:     str(p.eventId) ?? str(p.id),
      providerCallId: str(p.callId) ?? str(p.callSid),
      eventType:      event ?? str(p.status),
      direction:      coerceDirection(p.direction),
      status,
      fromNumber:     str(p.from),
      toNumber:       str(p.to),
      agentExtension: str(p.extension) ?? str(p.agent),
      source:         str(p.source),
      startedAt:      toDate(p.startedAt),
      answeredAt:     toDate(p.answeredAt),
      endedAt:        toDate(p.endedAt),
      durationSec:    int(p.durationSec),
      recording: rec ? {
        url: str(rec.url), fileName: str(rec.fileName), mimeType: str(rec.mimeType),
        durationSec: int(rec.durationSec), sizeBytes: int(rec.sizeBytes), externalId: str(rec.id),
      } : undefined,
    }
  }
}
