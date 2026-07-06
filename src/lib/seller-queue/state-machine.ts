// =============================================================================
// seller-queue/state-machine.ts — validação central de transições da fila.
// Mantém um mapa explícito de estados válidos para reduzir inconsistências e
// deixar o fluxo mais profissional e previsível.
// =============================================================================

import type { SellerQueueEntryStatus } from '@prisma/client'

const STATE_TRANSITIONS: Record<string, string[]> = {
  WAITING: ['CALLED', 'NEXT', 'PAUSED', 'BLOCKED', 'LEFT'],
  NEXT: ['CALLED', 'PAUSED', 'BLOCKED', 'LEFT', 'WAITING'],
  CALLED: ['ACCEPTED', 'IN_ATTENDANCE', 'WAITING', 'EXPIRED', 'LEFT'],
  ACCEPTED: ['IN_ATTENDANCE', 'WAITING', 'LEFT'],
  IN_ATTENDANCE: ['WAITING', 'LEFT', 'PAUSED', 'BLOCKED'],
  PAUSED: ['WAITING', 'LEFT', 'BLOCKED'],
  SKIPPED: ['WAITING', 'LEFT'],
  LEFT: [],
  EXPIRED: ['WAITING', 'LEFT'],
  BLOCKED: ['WAITING', 'LEFT'],
}

export function canTransitionQueueEntryStatus(from: string | null | undefined, to: string | null | undefined): boolean {
  if (!from || !to) return false
  const normalizedFrom = from.toUpperCase()
  const normalizedTo = to.toUpperCase()
  return (STATE_TRANSITIONS[normalizedFrom] ?? []).includes(normalizedTo)
}

export function normalizeQueueEntryStatus(status: string | null | undefined): SellerQueueEntryStatus | null {
  if (!status) return null
  const normalized = status.toUpperCase()
  const valid = Object.keys(STATE_TRANSITIONS).find((key) => key === normalized)
  return valid ? (valid as SellerQueueEntryStatus) : null
}
