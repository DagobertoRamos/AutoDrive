// =============================================================================
// telephony/adapters/threecx.adapter.ts — 3CX (PREPARADO).
// 3CX expõe Call Control API / webhooks variáveis conforme versão. Normalização
// best-effort sobre JSON; assinatura via HMAC-SHA256 genérico (header x-signature).
// ⚠️ ESTRUTURA PREPARADA — confirmar eventos e assinatura com a doc/instalação
// oficial do 3CX antes de produção. NÃO faz chamada de saída.
// =============================================================================

import type { TelephonyAdapter, TelephonyVerifyContext, NormalizedTelephonyEvent } from './types'
import { verifyHmacSha256Hex, str, int, toDate, coerceStatus, coerceDirection } from './base'

const EVENT_TO_STATUS: Record<string, string> = {
  ringing: 'RINGING', incoming: 'RINGING', established: 'ANSWERED', talking: 'ANSWERED',
  ended: 'COMPLETED', terminated: 'COMPLETED', missed: 'MISSED', busy: 'BUSY', failed: 'FAILED',
}

export class ThreeCxAdapter implements TelephonyAdapter {
  readonly kind = 'THREE_CX' as const
  readonly ready = false

  verifySignature(ctx: TelephonyVerifyContext): boolean {
    return verifyHmacSha256Hex(ctx.rawBody, ctx.secret, ctx.headers.get('x-signature'))
  }

  normalize(payload: unknown): NormalizedTelephonyEvent | null {
    if (!payload || typeof payload !== 'object') return null
    const p = payload as Record<string, unknown>
    const event = str(p.event) ?? str(p.status) ?? str(p.state)
    const status = p.status ? coerceStatus(p.status) : coerceStatus(EVENT_TO_STATUS[String(event ?? '').toLowerCase()] ?? 'RINGING')
    const rec = (p.recording && typeof p.recording === 'object') ? p.recording as Record<string, unknown> : null
    return {
      externalId:     str(p.id) ?? str(p.callId),
      providerCallId: str(p.callId) ?? str(p.callid) ?? str(p.id),
      eventType:      event ?? '3cx',
      direction:      coerceDirection(p.direction),
      status,
      fromNumber:     str(p.from) ?? str(p.caller),
      toNumber:       str(p.to) ?? str(p.callee),
      agentExtension: str(p.extension) ?? str(p.agent),
      startedAt:      toDate(p.startedAt) ?? toDate(p.start),
      endedAt:        toDate(p.endedAt) ?? toDate(p.end),
      durationSec:    int(p.duration),
      recording: rec ? { url: str(rec.url), fileName: str(rec.fileName), mimeType: str(rec.mimeType), durationSec: int(rec.duration) } : undefined,
    }
  }
}
