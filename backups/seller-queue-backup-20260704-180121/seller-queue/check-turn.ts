// =============================================================================
// seller-queue/check-turn.ts — lógica PURA do "Verificar vez".
// Dado o estado da fila (entries) e o solicitante, calcula quem é o vendedor da
// vez, a posição do solicitante, a elegibilidade (e o motivo) e as ações
// disponíveis. Sem acesso a banco → testável. A rota só busca os dados e chama.
// =============================================================================

export interface CheckTurnEntry {
  sellerId: string
  status: string // WAITING | NEXT | PAUSED | CALLED | ACCEPTED | IN_ATTENDANCE | BLOCKED | ...
  blocked: boolean
}

export interface CheckTurnResult {
  eligible: boolean
  reason: string | null
  isCurrentTurn: boolean
  userPosition: number
  currentSeller: { id: string; name: string } | null
  counts: { available: number; paused: number; attending: number; waiting: number }
  nextUp: Array<{ name: string; position: number }>
  canStartAttendance: boolean
  canCallCurrentSeller: boolean
  canManage: boolean
  message: string
}

const ATTENDING = ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE']

export function computeCheckTurn(opts: {
  entries: CheckTurnEntry[]
  userId: string
  nameOf: (id: string) => string
  canCheckIn: boolean
  canManage: boolean
}): CheckTurnResult {
  const { entries, userId, nameOf, canCheckIn, canManage } = opts

  // Fila de espera (cliente de porta): WAITING/NEXT, não bloqueados, na ordem.
  const waitingLine = entries.filter((e) => (e.status === 'WAITING' || e.status === 'NEXT') && !e.blocked)
  const vendedorDaVez = waitingLine[0] ?? null
  const currentSeller = vendedorDaVez ? { id: vendedorDaVez.sellerId, name: nameOf(vendedorDaVez.sellerId) } : null

  const counts = {
    available: waitingLine.length,
    paused: entries.filter((e) => e.status === 'PAUSED').length,
    attending: entries.filter((e) => ATTENDING.includes(e.status)).length,
    waiting: waitingLine.length,
  }
  const nextUp = waitingLine.slice(0, 5).map((e, i) => ({ name: nameOf(e.sellerId), position: i + 1 }))

  const me = entries.find((e) => e.sellerId === userId) ?? null
  let eligible = false
  let reason: string | null = null
  if (!me) {
    reason = canCheckIn ? 'Você não está na fila. Entre na fila para atender clientes de porta.' : 'Você não participa da fila de atendimento.'
  } else if (me.blocked || me.status === 'BLOCKED') {
    reason = 'Você está bloqueado na fila no momento.'
  } else if (me.status === 'PAUSED') {
    reason = 'Você está pausado. Retome para voltar à fila.'
  } else if (ATTENDING.includes(me.status)) {
    reason = 'Você está em atendimento.'
  } else {
    eligible = true
  }

  const userPosition = eligible ? waitingLine.findIndex((e) => e.sellerId === userId) + 1 : 0
  const isCurrentTurn = eligible && !!vendedorDaVez && vendedorDaVez.sellerId === userId

  let message: string
  if (!eligible) message = reason ?? 'Você não está elegível para atendimento de porta.'
  else if (isCurrentTurn) message = 'Você é o vendedor da vez.'
  else if (currentSeller) message = userPosition > 0
    ? `Você é o ${userPosition}º na fila. O vendedor da vez é ${currentSeller.name}.`
    : `O vendedor da vez é ${currentSeller.name}.`
  else message = 'Não há vendedor disponível na fila no momento.'

  return {
    eligible, reason,
    isCurrentTurn, userPosition,
    currentSeller,
    counts, nextUp,
    canStartAttendance: isCurrentTurn,
    canCallCurrentSeller: !!currentSeller && !isCurrentTurn,
    canManage,
    message,
  }
}
