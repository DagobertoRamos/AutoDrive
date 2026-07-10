// =============================================================================
// seller-queue/participants.ts — Participação dos colaboradores na fila (Fase 2).
// Flags POR COLABORADOR guardadas no JSON SellerQueueUnitConfig.config
// .participants[sellerId] (sem migration). Sem registro = tudo liberado (padrão
// retrocompatível). `participates=false` barra o check-in (fica fora da fila).
// Os demais flags são de configuração/visibilidade e vão sendo aplicados no
// engine progressivamente (ver README LOG).
// =============================================================================

export interface ParticipantFlags {
  participates: boolean               // entra na fila (check-in)
  canBeVez: boolean                   // pode ser o vendedor da vez
  canReceivePorta: boolean            // cliente de porta
  canReceiveAgendamento: boolean      // agendamento
  canReceiveRetorno: boolean          // retorno
  canReceivePosVenda: boolean         // pós-venda
  canReceiveRetiradaEntrega: boolean  // retirada/entrega de carro
  individualQueue: boolean            // participa da fila individual
  escalatable: boolean                // pode ser escalonado
  canPullPersonalQueue: boolean       // pode OPERAR a fila individual (atender/transferir/finalizar) — inclusive de outros
}

export const PARTICIPANT_DEFAULTS: ParticipantFlags = {
  participates: true,
  canBeVez: true,
  canReceivePorta: true,
  canReceiveAgendamento: true,
  canReceiveRetorno: true,
  canReceivePosVenda: true,
  canReceiveRetiradaEntrega: true,
  individualQueue: true,
  escalatable: true,
  canPullPersonalQueue: false, // opt-in: por padrão só a gestão opera a fila individual de outros
}

const FLAG_KEYS = Object.keys(PARTICIPANT_DEFAULTS) as (keyof ParticipantFlags)[]

/** Mapa cru participants[sellerId] = { flags } do JSON de config. */
export function getParticipantsMap(config: unknown): Record<string, Partial<ParticipantFlags>> {
  const c = (config as Record<string, unknown> | null | undefined) ?? {}
  const p = c.participants
  return (p && typeof p === 'object') ? (p as Record<string, Partial<ParticipantFlags>>) : {}
}

/** Flags efetivas de um colaborador (padrão = tudo true). */
export function getParticipant(config: unknown, sellerId: string): ParticipantFlags {
  const raw = getParticipantsMap(config)[sellerId] ?? {}
  const out = { ...PARTICIPANT_DEFAULTS }
  for (const k of FLAG_KEYS) if (typeof raw[k] === 'boolean') out[k] = raw[k] as boolean
  return out
}

/** Sanitiza flags recebidas da UI (só booleanos conhecidos). */
export function coerceFlags(raw: unknown): Partial<ParticipantFlags> {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const out: Partial<ParticipantFlags> = {}
  for (const k of FLAG_KEYS) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean
  return out
}
