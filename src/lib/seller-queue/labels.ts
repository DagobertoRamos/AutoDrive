// =============================================================================
// Rótulos em PORTUGUÊS dos status da fila de atendimento (entry, atendimento e
// chegada do cliente). Usado em todas as telas para não mostrar o código cru.
// =============================================================================

const LABELS: Record<string, string> = {
  // Vendedor na fila (SellerQueueEntry)
  WAITING: 'Aguardando a vez',
  NEXT: 'Próximo',
  CALLED: 'Chamado',
  ACCEPTED: 'Aceito',
  IN_ATTENDANCE: 'Em atendimento',
  PAUSED: 'Pausado',
  LEFT: 'Fora da fila',
  SKIPPED: 'Perdeu a vez',
  BLOCKED: 'Bloqueado',
  // Atendimento (SellerQueueAttendance)
  FINISHED: 'Finalizado',
  CANCELED: 'Cancelado',
  EXPIRED: 'Não respondeu',
  // Chegada do cliente (SellerQueueCustomerArrival)
  PENDING: 'Aguardando',
  CALLING: 'Chamando',
  ASSIGNED: 'Em atendimento',
  DONE: 'Concluído',
}

export function queueStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return LABELS[status] ?? status
}
