// =============================================================================
// Entrada no estoque a partir da avaliação — regras PURAS (testadas).
//
// Fluxo:
//   LIBERADA + cliente ACEITA ──(vendedor devolve ao gestor)──► AGUARDANDO_ENTRADA
//   AGUARDANDO_ENTRADA ──(gestor confirma)──► NO_ESTOQUE (cria o Vehicle)
//   AGUARDANDO_ENTRADA ──(gestor devolve)──► LIBERADA
// O gestor também pode confirmar direto de LIBERADA + ACEITA.
// `status` da avaliação é String no banco: os valores novos não pedem migration.
// =============================================================================

export const EVAL_AWAITING_STOCK = 'AGUARDANDO_ENTRADA'
export const EVAL_IN_STOCK       = 'NO_ESTOQUE'

const RELEASED = new Set(['LIBERADA', 'APPROVED'])

export interface StockEntryState {
  status?:           string | null
  customerDecision?: string | null
  vehicleId?:        string | null
}

const up = (v: string | null | undefined) => (v ?? '').toUpperCase()

/** Motivo pelo qual a avaliação NÃO pode ser devolvida ao gestor (null = pode). */
export function blockRequestStockEntry(e: StockEntryState): string | null {
  if (e.vehicleId) return 'Esta avaliação já gerou um veículo no estoque.'
  if (up(e.status) === EVAL_AWAITING_STOCK) return 'A avaliação já está com o gestor aguardando a entrada no estoque.'
  if (!RELEASED.has(up(e.status))) return 'A avaliação precisa estar liberada pelo gerente.'
  if (up(e.customerDecision) !== 'ACEITA') return 'Registre primeiro que o cliente aceitou a proposta.'
  return null
}

/** Motivo pelo qual o gestor NÃO pode dar entrada no estoque (null = pode). */
export function blockConfirmStockEntry(e: StockEntryState): string | null {
  if (e.vehicleId) return 'Esta avaliação já gerou um veículo no estoque.'
  if (up(e.status) === EVAL_AWAITING_STOCK) return null
  if (!RELEASED.has(up(e.status))) return 'A avaliação precisa estar liberada pelo gerente.'
  if (up(e.customerDecision) !== 'ACEITA') return 'O cliente ainda não aceitou a proposta.'
  return null
}

export interface EntryService {
  description:    string
  serviceType?:   string | null
  estimatedCost?: number | string | null
  status?:        string | null
}

export interface EntryPendency {
  label:       string
  category:    string
  description: string
  notes:       string | null
}

export const PENDENCY_RECEIVE  = 'Recebimento do veículo'
export const PENDENCY_SERVICES = 'Serviços da avaliação'
export const PENDENCY_NOTES    = 'Pendências da avaliação'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Pendências que o veículo carrega ao entrar no estoque: o recebimento físico
 * (sempre) + o que a avaliação deixou em aberto (serviços previstos/em
 * andamento e as observações de pendência).
 */
export function buildEntryPendencies(input: {
  services:       EntryService[]
  pendencyNotes?: string | null
  receiveNotes?:  string | null
}): EntryPendency[] {
  const out: EntryPendency[] = [{
    label:       PENDENCY_RECEIVE,
    category:    'PREPARACAO',
    description: 'Veículo ainda não foi recebido fisicamente na loja.',
    notes:       input.receiveNotes?.trim() || 'Aguardando a chegada do veículo na loja.',
  }]

  const open = input.services.filter((s) => !['DONE', 'CANCELED'].includes(up(s.status)))
  if (open.length) {
    let total = 0
    const lines = open.map((s) => {
      const cost = Number(s.estimatedCost ?? 0)
      if (Number.isFinite(cost)) total += cost
      return `• ${s.description}${cost > 0 ? ` (${brl(cost)})` : ''}`
    })
    if (total > 0) lines.push(`Total previsto: ${brl(total)}`)
    out.push({ label: PENDENCY_SERVICES, category: 'PREPARACAO', description: 'Serviços apontados na avaliação.', notes: lines.join('\n') })
  }

  const notes = input.pendencyNotes?.trim()
  if (notes) out.push({ label: PENDENCY_NOTES, category: 'AVALIACAO', description: 'Pendências anotadas na avaliação.', notes })

  return out
}
