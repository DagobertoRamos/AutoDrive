// =============================================================================
// Status por dimensão da operação veicular e o STATUS GERAL que a tela mostra.
// Cada operação guarda dimensões independentes (comercial, financeiro, fiscal,
// RENAVE, transferência…); a interface mostra uma única frase: o que é, em que
// pé está, se há problema e qual a próxima ação. Puro — sem banco.
// =============================================================================

import { transferStageMessage, type TransferStage } from './transfer-core'

export type OperationKind = 'SALE' | 'PURCHASE' | 'CONSIGNMENT' | 'STORE_TRANSFER'

export type CommercialStatus = 'OPEN' | 'RESERVED' | 'SOLD' | 'ACQUIRED' | 'CANCELLED' | 'CLOSED'
export type FinancialStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'NOT_APPLICABLE'
export type FiscalStatus = 'NOT_STARTED' | 'NOT_REQUIRED' | 'PENDING' | 'PROCESSING' | 'UNKNOWN' | 'AUTHORIZED' | 'REJECTED' | 'CANCELLED'
export type RenaveStatus =
  | 'NOT_STARTED' | 'NOT_REQUIRED' | 'PENDING'
  | 'ENTRY_SUBMITTED' | 'ENTRY_CONFIRMED' | 'EXIT_SUBMITTED' | 'EXIT_CONFIRMED'
  | 'UNKNOWN' | 'REJECTED' | 'CANCELLED'
export type RestrictionStatus = 'CLEAR' | 'WARNING' | 'BLOCKED'
export type InspectionStatus = 'NOT_REQUIRED' | 'PENDING' | 'VALID' | 'EXPIRED' | 'REJECTED'
export type FinancingStatus = 'NOT_APPLICABLE' | 'PROPOSAL' | 'APPROVED' | 'CONTRACT_SIGNED' | 'LIEN_REGISTERED' | 'BANK_PAID' | 'CHARGEBACK'

export interface OperationDimensions {
  kind: OperationKind | string
  commercialStatus: string
  financialStatus: string
  fiscalStatus: string
  renaveStatus: string
  transferStatus: string
  inspectionStatus: string
  restrictionStatus: string
  documentStatus: string
  financingStatus: string
  cancelledAt?: Date | string | null
}

export type Tone = 'ok' | 'progress' | 'attention' | 'critical' | 'neutral'

export interface NextAction { key: string; label: string }

export interface OverallStatus {
  /** Rótulo curto em maiúsculas: VENDIDO, ESTOQUE, ATENÇÃO, CONCLUÍDO… */
  label: string
  /** Uma frase: "Aguardando assinatura do comprador." */
  message: string
  tone: Tone
  nextAction: NextAction | null
}

const KIND_LABEL: Record<string, string> = { SALE: 'Venda', PURCHASE: 'Entrada', CONSIGNMENT: 'Consignação', STORE_TRANSFER: 'Transferência entre lojas' }
export function kindLabel(kind: string): string { return KIND_LABEL[kind] ?? kind }

/** Texto amigável de cada valor de dimensão (para "Ver detalhes"). */
export const DIMENSION_TEXT: Record<string, Record<string, string>> = {
  commercialStatus: { OPEN: 'Em negociação', RESERVED: 'Reservado', SOLD: 'Vendido', ACQUIRED: 'Adquirido', CANCELLED: 'Cancelado', CLOSED: 'Concluído' },
  financialStatus: { PENDING: 'Aguardando pagamento', PARTIAL: 'Pago em parte', PAID: 'Pago', NOT_APPLICABLE: 'Não se aplica' },
  fiscalStatus: { NOT_STARTED: 'Não iniciado', NOT_REQUIRED: 'Não exigido', PENDING: 'Nota pendente', PROCESSING: 'Em processamento', UNKNOWN: 'Verificando', AUTHORIZED: 'NF-e autorizada', REJECTED: 'NF-e rejeitada', CANCELLED: 'NF-e cancelada' },
  renaveStatus: { NOT_STARTED: 'Não iniciado', NOT_REQUIRED: 'Não exigido', PENDING: 'Pendente', ENTRY_SUBMITTED: 'Entrada enviada', ENTRY_CONFIRMED: 'Entrada confirmada', EXIT_SUBMITTED: 'Saída enviada', EXIT_CONFIRMED: 'Saída confirmada', UNKNOWN: 'Verificando', REJECTED: 'Recusado', CANCELLED: 'Cancelado' },
  transferStatus: { NOT_APPLICABLE: 'Não se aplica' },
  inspectionStatus: { NOT_REQUIRED: 'Não exigida', PENDING: 'Pendente', VALID: 'Válida', EXPIRED: 'Vencida', REJECTED: 'Reprovada' },
  restrictionStatus: { CLEAR: 'Sem restrições', WARNING: 'Com observação', BLOCKED: 'Bloqueado' },
  documentStatus: { PENDING: 'Pendente', PARTIAL: 'Incompleta', COMPLETE: 'Regular' },
  financingStatus: { NOT_APPLICABLE: 'Sem financiamento', PROPOSAL: 'Proposta', APPROVED: 'Aprovado', CONTRACT_SIGNED: 'Contrato assinado', LIEN_REGISTERED: 'Gravame incluído', BANK_PAID: 'Pago pelo banco', CHARGEBACK: 'Estornado pelo banco' },
}

export const DIMENSION_LABEL: Record<string, string> = {
  commercialStatus: 'Comercial', financialStatus: 'Pagamento', fiscalStatus: 'Fiscal', renaveStatus: 'RENAVE',
  transferStatus: 'Transferência', inspectionStatus: 'Vistoria', restrictionStatus: 'Restrições',
  documentStatus: 'Documentação', financingStatus: 'Financiamento',
}

export function dimensionText(dim: string, value: string | null | undefined): string {
  if (!value) return '—'
  if (dim === 'transferStatus' && value !== 'NOT_APPLICABLE') return transferStageMessage(value as TransferStage)
  return DIMENSION_TEXT[dim]?.[value] ?? value
}

/** Dimensão "resolvida" (concluída ou não exigida). */
export function isDone(dim: keyof OperationDimensions, value: string): boolean {
  switch (dim) {
    case 'fiscalStatus': return value === 'AUTHORIZED' || value === 'NOT_REQUIRED'
    case 'financialStatus': return value === 'PAID' || value === 'NOT_APPLICABLE'
    case 'transferStatus': return value === 'CRLV_ISSUED' || value === 'NOT_APPLICABLE'
    case 'inspectionStatus': return value === 'VALID' || value === 'NOT_REQUIRED'
    case 'restrictionStatus': return value !== 'BLOCKED'
    case 'documentStatus': return value === 'COMPLETE'
    case 'financingStatus': return value === 'NOT_APPLICABLE' || value === 'BANK_PAID'
    default: return false
  }
}

function renaveDoneFor(kind: string, value: string): boolean {
  if (value === 'NOT_REQUIRED') return true
  return kind === 'SALE' ? value === 'EXIT_CONFIRMED' : value === 'ENTRY_CONFIRMED' || value === 'EXIT_CONFIRMED'
}

/**
 * Status geral de UMA operação. Ordem de prioridade: cancelamento com efeito
 * externo pendente → bloqueios/rejeições → incertezas → próxima etapa do fluxo.
 */
export function overallStatus(op: OperationDimensions): OverallStatus {
  const k = op.kind
  const sale = k === 'SALE'

  // 1) Cancelada: só pede ação se algo externo já foi feito e precisa ser desfeito.
  if (op.commercialStatus === 'CANCELLED' || op.cancelledAt) {
    if (op.fiscalStatus === 'AUTHORIZED') return { label: 'ATENÇÃO', tone: 'critical', message: 'Operação cancelada com NF-e autorizada. Cancele a nota.', nextAction: { key: 'fiscal.cancel', label: 'Cancelar NF-e' } }
    if (sale ? op.renaveStatus === 'EXIT_CONFIRMED' : op.renaveStatus === 'ENTRY_CONFIRMED') return { label: 'ATENÇÃO', tone: 'critical', message: 'Operação cancelada com registro no RENAVE. Cancele o registro.', nextAction: { key: 'renave.cancel', label: 'Cancelar no RENAVE' } }
    return { label: 'CANCELADO', tone: 'neutral', message: 'Operação cancelada.', nextAction: null }
  }

  // 2) Bloqueios e rejeições
  if (op.restrictionStatus === 'BLOCKED') return { label: 'ATENÇÃO', tone: 'critical', message: 'Existe uma restrição que impede a operação.', nextAction: { key: 'restriction.view', label: 'Ver pendência' } }
  if (op.fiscalStatus === 'REJECTED') return { label: 'ATENÇÃO', tone: 'critical', message: 'NF-e rejeitada.', nextAction: { key: 'fiscal.view', label: 'Ver motivo' } }
  if (op.renaveStatus === 'REJECTED') return { label: 'ATENÇÃO', tone: 'critical', message: 'O RENAVE recusou o registro.', nextAction: { key: 'renave.view', label: 'Ver motivo' } }
  if (op.financingStatus === 'CHARGEBACK') return { label: 'ATENÇÃO', tone: 'critical', message: 'O banco estornou o financiamento.', nextAction: { key: 'finance.view', label: 'Ver financiamento' } }

  // 3) Incertezas (timeout do provedor): nunca supor erro.
  if (op.fiscalStatus === 'UNKNOWN' || op.renaveStatus === 'UNKNOWN') return { label: 'VERIFICANDO', tone: 'attention', message: 'Estamos confirmando se a solicitação foi processada.', nextAction: null }

  // 4) Antes de fechar o negócio
  if (op.commercialStatus === 'OPEN') return { label: sale ? 'EM NEGOCIAÇÃO' : kindLabel(k).toUpperCase(), tone: 'progress', message: sale ? 'Negociação em andamento.' : 'Aguardando conclusão da negociação.', nextAction: null }
  if (op.commercialStatus === 'RESERVED') return { label: 'RESERVADO', tone: 'progress', message: 'Venda aprovada, aguardando finalização.', nextAction: null }

  // 5) Fluxo pós-fechamento, na ordem real de execução.
  if (sale) {
    if (!isDone('financialStatus', op.financialStatus)) return { label: 'VENDIDO', tone: 'progress', message: 'Aguardando pagamento.', nextAction: { key: 'finance.view', label: 'Ver pagamentos' } }
    if (op.financingStatus !== 'NOT_APPLICABLE' && op.financingStatus !== 'BANK_PAID' && op.financingStatus !== 'LIEN_REGISTERED') {
      return { label: 'VENDIDO', tone: 'progress', message: op.financingStatus === 'CONTRACT_SIGNED' ? 'Aguardando inclusão do gravame.' : 'Aguardando contrato do financiamento.', nextAction: { key: 'finance.view', label: 'Ver financiamento' } }
    }
    if (!isDone('fiscalStatus', op.fiscalStatus)) return { label: 'VENDIDO', tone: 'attention', message: op.fiscalStatus === 'PROCESSING' ? 'NF-e de saída em processamento.' : 'NF-e de saída pendente.', nextAction: op.fiscalStatus === 'PROCESSING' ? null : { key: 'fiscal.issue', label: 'Vincular NF-e' } }
    if (!renaveDoneFor(k, op.renaveStatus)) return { label: 'VENDIDO', tone: 'attention', message: op.renaveStatus === 'EXIT_SUBMITTED' ? 'Saída enviada ao RENAVE, aguardando confirmação.' : 'Saída no RENAVE pendente.', nextAction: op.renaveStatus === 'EXIT_SUBMITTED' ? null : { key: 'renave.exit', label: 'Registrar saída' } }
    if (!isDone('transferStatus', op.transferStatus)) {
      const stage = op.transferStatus as TransferStage
      const waitingBuyer = stage === 'SELLER_SIGNED'
      return { label: 'VENDIDO', tone: 'progress', message: transferStageMessage(stage), nextAction: waitingBuyer ? { key: 'transfer.instructions', label: 'Enviar instruções' } : { key: 'transfer.advance', label: stage === 'PENDING' ? 'Iniciar transferência' : 'Atualizar etapa' } }
    }
    return { label: 'CONCLUÍDO', tone: 'ok', message: 'Operação concluída.', nextAction: null }
  }

  if (k === 'STORE_TRANSFER') {
    if (!isDone('fiscalStatus', op.fiscalStatus)) return { label: 'TRANSFERÊNCIA', tone: 'attention', message: 'NF-e de transferência pendente.', nextAction: { key: 'fiscal.issue', label: 'Vincular NF-e' } }
    if (op.renaveStatus !== 'NOT_REQUIRED' && op.renaveStatus !== 'ENTRY_CONFIRMED') return { label: 'TRANSFERÊNCIA', tone: 'attention', message: 'Transferência no RENAVE pendente.', nextAction: { key: 'renave.transfer', label: 'Registrar no RENAVE' } }
    return { label: 'CONCLUÍDO', tone: 'ok', message: 'Transferência entre lojas concluída.', nextAction: null }
  }

  // Entrada (compra/troca) e consignação: o carro fica regular no estoque.
  if (!renaveDoneFor(k, op.renaveStatus)) return { label: 'ESTOQUE', tone: 'attention', message: op.renaveStatus === 'ENTRY_SUBMITTED' ? 'Entrada enviada ao RENAVE, aguardando confirmação.' : 'Entrada no RENAVE pendente.', nextAction: op.renaveStatus === 'ENTRY_SUBMITTED' ? null : { key: 'renave.entry', label: 'Registrar entrada' } }
  if (!isDone('fiscalStatus', op.fiscalStatus)) return { label: 'ESTOQUE', tone: 'attention', message: 'NF-e de entrada pendente.', nextAction: { key: 'fiscal.issue', label: 'Vincular NF-e' } }
  if (op.documentStatus === 'PENDING' || op.documentStatus === 'PARTIAL') return { label: 'ESTOQUE', tone: 'attention', message: 'Documentação incompleta.', nextAction: { key: 'documents.view', label: 'Ver documentos' } }
  return { label: 'ESTOQUE', tone: 'ok', message: 'Regularizado.', nextAction: null }
}

/** Tom → classes Tailwind (um lugar só). */
export const TONE_CLASSES: Record<Tone, { badge: string; dot: string; text: string }> = {
  ok:        { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  progress:  { badge: 'bg-blue-50 text-blue-700 border-blue-200',         dot: 'bg-blue-500',    text: 'text-blue-700' },
  attention: { badge: 'bg-amber-50 text-amber-800 border-amber-200',      dot: 'bg-amber-500',   text: 'text-amber-800' },
  critical:  { badge: 'bg-red-50 text-red-700 border-red-200',            dot: 'bg-red-500',     text: 'text-red-700' },
  neutral:   { badge: 'bg-gray-100 text-gray-600 border-gray-200',        dot: 'bg-gray-400',    text: 'text-gray-600' },
}
