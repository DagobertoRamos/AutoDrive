// =============================================================================
// telephony/adapters/types.ts — contrato dos adapters de telefonia.
// SÓ INBOUND nesta fase: o adapter (1) verifica a assinatura do webhook e
// (2) normaliza o payload do provedor num evento único. NENHUM adapter faz
// chamada de saída a provedor externo sem documentação/credenciais oficiais.
// =============================================================================

import type { CallDirection, CallStatus, TelephonyProviderKind } from '@prisma/client'

export interface TelephonyVerifyContext {
  headers: Headers
  rawBody: string
  url: string
  /** Segredo de webhook da conexão (decifrado em runtime; nunca logado). */
  secret?: string
}

export interface NormalizedRecording {
  url?: string
  fileName?: string
  mimeType?: string
  durationSec?: number
  sizeBytes?: number
  externalId?: string
}

export interface NormalizedTelephonyEvent {
  externalId?: string      // id do evento no provedor (auditoria/idempotência)
  providerCallId?: string  // id da chamada no provedor (chave p/ upsert da call)
  eventType?: string       // nome bruto do evento do provedor
  direction: CallDirection
  status: CallStatus
  fromNumber?: string
  toNumber?: string
  agentExtension?: string
  source?: string
  startedAt?: Date
  answeredAt?: Date
  endedAt?: Date
  durationSec?: number
  recording?: NormalizedRecording
}

export interface TelephonyAdapter {
  readonly kind: TelephonyProviderKind
  /** true se este adapter está pronto p/ uso real (assinatura + normalização confiáveis). */
  readonly ready: boolean
  /** Verifica autenticidade do webhook (assinatura/HMAC). false = rejeitar. */
  verifySignature(ctx: TelephonyVerifyContext): boolean
  /** Converte o payload já parseado no evento normalizado (null se não reconhecido). */
  normalize(payload: unknown, ctx: TelephonyVerifyContext): NormalizedTelephonyEvent | null
}

export class TelephonyAdapterError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = 'TelephonyAdapterError' }
}
