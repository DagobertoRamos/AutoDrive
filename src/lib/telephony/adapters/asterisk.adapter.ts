// =============================================================================
// telephony/adapters/asterisk.adapter.ts — Asterisk/ARI (PREPARADO).
// Asterisk normalmente expõe eventos via AMI/ARI (não um webhook padrão), então
// assume-se um repassador enviando JSON. Normalização best-effort sobre campos
// comuns; assinatura via HMAC-SHA256 genérico (header x-signature).
// ⚠️ ESTRUTURA PREPARADA — confirmar o mapeamento de eventos e o esquema de
// assinatura com a instalação/doc oficial antes de produção. NÃO faz saída.
// =============================================================================

import type { TelephonyAdapter, TelephonyVerifyContext, NormalizedTelephonyEvent } from './types'
import { verifyHmacSha256Hex, str, int, toDate, coerceStatus, coerceDirection } from './base'

// Eventos ARI/AMI comuns → status (best-effort).
const EVENT_TO_STATUS: Record<string, string> = {
  StasisStart: 'RINGING', Ringing: 'RINGING', Up: 'ANSWERED', Answer: 'ANSWERED',
  Hangup: 'COMPLETED', StasisEnd: 'COMPLETED', NoAnswer: 'MISSED', Busy: 'BUSY', Congestion: 'FAILED',
}

export class AsteriskAdapter implements TelephonyAdapter {
  readonly kind = 'ASTERISK' as const
  readonly ready = false

  verifySignature(ctx: TelephonyVerifyContext): boolean {
    return verifyHmacSha256Hex(ctx.rawBody, ctx.secret, ctx.headers.get('x-signature'))
  }

  normalize(payload: unknown): NormalizedTelephonyEvent | null {
    if (!payload || typeof payload !== 'object') return null
    const p = payload as Record<string, unknown>
    const event = str(p.type) ?? str(p.Event) ?? str(p.event)
    const status = p.status ? coerceStatus(p.status) : coerceStatus(EVENT_TO_STATUS[String(event ?? '')] ?? 'RINGING')
    return {
      externalId:     str(p.id) ?? str(p.Uniqueid),
      providerCallId: str(p.linkedid) ?? str(p.Linkedid) ?? str(p.Uniqueid) ?? str(p.channelId),
      eventType:      event ?? 'asterisk',
      direction:      coerceDirection(p.direction),
      status,
      fromNumber:     str(p.callerIdNum) ?? str(p.CallerIDNum) ?? str(p.from),
      toNumber:       str(p.connectedLineNum) ?? str(p.ConnectedLineNum) ?? str(p.exten) ?? str(p.to),
      agentExtension: str(p.exten) ?? str(p.Exten),
      startedAt:      toDate(p.startedAt),
      endedAt:        toDate(p.endedAt),
      durationSec:    int(p.duration) ?? int(p.Duration),
    }
  }
}
