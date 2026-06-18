// =============================================================================
// telephony/adapters/manual.adapter.ts — registro MANUAL de ligação.
// Para lojas sem PABX/integração: a ligação é registrada por um usuário
// autenticado (endpoint interno futuro), NÃO por webhook público. Por isso
// verifySignature retorna false (não há fonte externa a autenticar).
// O normalize reaproveita o contrato genérico do AutoDrive.
// =============================================================================

import type { TelephonyAdapter, TelephonyVerifyContext, NormalizedTelephonyEvent } from './types'
import { str, int, toDate, coerceStatus, coerceDirection } from './base'

export class ManualCallAdapter implements TelephonyAdapter {
  readonly kind = 'MANUAL' as const
  readonly ready = true

  // Registro manual passa por endpoint autenticado, não por webhook → sem assinatura.
  verifySignature(_ctx: TelephonyVerifyContext): boolean {
    return false
  }

  normalize(payload: unknown): NormalizedTelephonyEvent | null {
    if (!payload || typeof payload !== 'object') return null
    const p = payload as Record<string, unknown>
    return {
      externalId:     str(p.id),
      providerCallId: str(p.callId),
      eventType:      'manual',
      direction:      coerceDirection(p.direction),
      status:         coerceStatus(p.status, 'COMPLETED'),
      fromNumber:     str(p.from),
      toNumber:       str(p.to),
      agentExtension: str(p.extension),
      source:         str(p.source) ?? 'manual',
      startedAt:      toDate(p.startedAt),
      answeredAt:     toDate(p.answeredAt),
      endedAt:        toDate(p.endedAt),
      durationSec:    int(p.durationSec),
    }
  }
}
