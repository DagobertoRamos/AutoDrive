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

import { GATE_EVALUATION, GATE_INSPECTION, GATE_NEGOTIATION, GATE_RECEIVE, INFO_NOTES, inspectionOk, STAGE_SERVICES } from '@/lib/stock/intake-core'

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
  /** Já nasce resolvida (ex.: Avaliação, Perícia com status). */
  resolved:    boolean
}

export const PENDENCY_RECEIVE  = GATE_RECEIVE
export const PENDENCY_SERVICES = STAGE_SERVICES
export const PENDENCY_NOTES    = INFO_NOTES

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const CAUTELAR_LABEL: Record<string, string> = {
  APROVADA: 'aprovada', REPROVADA: 'reprovada', PENDENTE: 'pendente (laudo em andamento)', COM_APONTAMENTO: 'com apontamento',
}

/**
 * Pendências com que o veículo entra no estoque — os 4 portões da esteira
 * (Avaliação já resolvida; Perícia resolvida se tiver status; Negociação
 * resolvida se a negociação vinculada já foi concluída; Recebimento sempre
 * pendente) + serviços em aberto + observações da avaliação.
 */
export function buildEntryPendencies(input: {
  services:           EntryService[]
  pendencyNotes?:     string | null
  receiveNotes?:      string | null
  evaluationNote?:    string | null
  cautelarStatus?:    string | null
  negotiationLabel?:  string | null
  negotiationClosed?: boolean
}): EntryPendency[] {
  const cautelar = String(input.cautelarStatus ?? '').toUpperCase()
  const out: EntryPendency[] = [
    { label: GATE_EVALUATION, category: 'AVALIACAO', description: 'Avaliação concluída e liberada pelo gestor.', notes: input.evaluationNote?.trim() || 'Veio da avaliação liberada.', resolved: true },
    {
      label: GATE_NEGOTIATION, category: 'DOCUMENTACAO', description: 'Negociação de compra/troca/consignação com o cliente concluída.',
      notes: input.negotiationLabel ? `Negociação ${input.negotiationLabel}${input.negotiationClosed ? ' concluída.' : ' em andamento.'}` : 'Confirme a negociação de entrada (compra, troca ou consignação).',
      resolved: !!input.negotiationClosed,
    },
    {
      label: GATE_INSPECTION, category: 'DOCUMENTACAO', description: 'Perícia/cautelar registrada (pode estar pendente; não pode ser "sem perícia").',
      notes: inspectionOk(cautelar) ? `Perícia ${CAUTELAR_LABEL[cautelar] ?? cautelar.toLowerCase()}.` : 'Sem perícia registrada: solicite a cautelar.',
      resolved: inspectionOk(cautelar),
    },
    { label: GATE_RECEIVE, category: 'PREPARACAO', description: 'Veículo recebido fisicamente na loja.', notes: input.receiveNotes?.trim() || 'Aguardando a chegada do veículo na loja.', resolved: false },
  ]

  const open = input.services.filter((s) => !['DONE', 'CANCELED'].includes(up(s.status)))
  if (open.length) {
    let total = 0
    const lines = open.map((s) => {
      const cost = Number(s.estimatedCost ?? 0)
      if (Number.isFinite(cost)) total += cost
      return `• ${s.description}${cost > 0 ? ` (${brl(cost)})` : ''}`
    })
    if (total > 0) lines.push(`Total previsto: ${brl(total)}`)
    out.push({ label: STAGE_SERVICES, category: 'PREPARACAO', description: 'Serviços apontados na avaliação.', notes: lines.join('\n'), resolved: false })
  }

  const notes = input.pendencyNotes?.trim()
  if (notes) out.push({ label: INFO_NOTES, category: 'AVALIACAO', description: 'Pendências anotadas na avaliação.', notes, resolved: false })

  return out
}
