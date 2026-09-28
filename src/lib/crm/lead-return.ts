// Retorno de cliente em atendimento: quando um cliente com lead aberto faz um
// novo pedido (site, canais), o lead ganha o selo "Voltou a pedir" até o
// responsável abrir o lead. Dados em metadata (sem coluna nova). PURO.

export interface LeadReturn { at: string; count: number; from: string | null; vehicle: string | null }

const obj = (m: unknown) => (m && typeof m === 'object' && !Array.isArray(m) ? m as Record<string, unknown> : {})

/** Retorno ainda não visto pelo responsável; null quando não há. */
export function unseenReturn(metadata: unknown): LeadReturn | null {
  const m = obj(metadata)
  if (typeof m.lastReturnAt !== 'string' || m.returnSeenAt) return null
  return {
    at: m.lastReturnAt,
    count: typeof m.returnCount === 'number' ? m.returnCount : 1,
    from: typeof m.lastReturnFrom === 'string' ? m.lastReturnFrom : null,
    vehicle: typeof m.lastReturnVehicle === 'string' ? m.lastReturnVehicle : null,
  }
}

/** Quem "vê" o retorno ao abrir o lead: o responsável; sem responsável, qualquer um. */
export function clearsReturn(lead: { assignedToUserId: string | null }, userId: string): boolean {
  return !lead.assignedToUserId || lead.assignedToUserId === userId
}
