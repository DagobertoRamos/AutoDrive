// =============================================================================
// Etapas da transferência de propriedade após a venda (puro).
//   intenção de venda → ATPV-e → assinatura vendedor → assinatura comprador →
//   [saída no RENAVE] → vistoria → taxas → transferência → novo CRLV-e
// (Resoluções Contran 1.026/2026 e 1.027/2026: a saída do estoque exige NF-e
// + ATPV-e assinada; a comunicação de venda nasce com as duas assinaturas.)
// O status guardado é a ÚLTIMA etapa concluída; a tela mostra o que falta.
// =============================================================================

export const TRANSFER_STAGES = [
  'PENDING',
  'INTENT_REGISTERED',
  'ATPV_ISSUED',
  'SELLER_SIGNED',
  'BUYER_SIGNED',
  'INSPECTION_DONE',
  'FEES_PAID',
  'TRANSFER_DONE',
  'CRLV_ISSUED',
] as const
export type TransferStage = typeof TRANSFER_STAGES[number]

/** Nome da etapa concluída (linha do tempo / "Ver etapas"). */
export const STAGE_DONE_LABEL: Record<TransferStage, string> = {
  PENDING: 'Venda finalizada',
  INTENT_REGISTERED: 'Intenção de venda registrada',
  ATPV_ISSUED: 'ATPV-e emitida',
  SELLER_SIGNED: 'Assinatura do vendedor',
  BUYER_SIGNED: 'Assinatura do comprador',
  INSPECTION_DONE: 'Vistoria aprovada',
  FEES_PAID: 'Taxas pagas',
  TRANSFER_DONE: 'Transferência efetivada',
  CRLV_ISSUED: 'Novo CRLV-e emitido',
}

/** O que a tela diz enquanto a transferência está PARADA nesta etapa. */
const WAITING_MESSAGE: Record<TransferStage, string> = {
  PENDING: 'Aguardando intenção de venda (ATPV-e).',
  INTENT_REGISTERED: 'Aguardando emissão da ATPV-e.',
  ATPV_ISSUED: 'Aguardando assinatura do vendedor.',
  SELLER_SIGNED: 'Aguardando assinatura do comprador.',
  BUYER_SIGNED: 'ATPV-e assinada. Aguardando vistoria.',
  INSPECTION_DONE: 'Aguardando pagamento das taxas.',
  FEES_PAID: 'Transferência em andamento.',
  TRANSFER_DONE: 'Aguardando o novo CRLV-e.',
  CRLV_ISSUED: 'Transferência concluída.',
}

export function isTransferStage(v: unknown): v is TransferStage {
  return typeof v === 'string' && (TRANSFER_STAGES as readonly string[]).includes(v)
}

export function transferStageMessage(stage: TransferStage | string): string {
  return isTransferStage(stage) ? WAITING_MESSAGE[stage] : 'Transferência em andamento.'
}

export interface TransferRules { inspectionRequired: boolean }

/** Etapas na ordem, sem a vistoria quando a UF dispensa. */
export function stagesFor(rules: TransferRules): TransferStage[] {
  return TRANSFER_STAGES.filter((s) => s !== 'INSPECTION_DONE' || rules.inspectionRequired)
}

/** Próxima etapa a concluir (null = concluída). */
export function nextStage(current: string, rules: TransferRules): TransferStage | null {
  const list = stagesFor(rules)
  const i = list.indexOf(current as TransferStage)
  if (i < 0) return list[1] ?? null
  return list[i + 1] ?? null
}

/**
 * Pode marcar `target` como concluída a partir de `current`? Só avança (nunca
 * volta) e não pula etapas — exceto a vistoria quando dispensada.
 */
export function canAdvance(current: string, target: string, rules: TransferRules): { ok: true } | { ok: false; reason: string } {
  if (!isTransferStage(target) || target === 'PENDING') return { ok: false, reason: 'Etapa inválida.' }
  if (current === 'CRLV_ISSUED') return { ok: false, reason: 'A transferência já foi concluída.' }
  const expected = nextStage(current, rules)
  if (target !== expected) return { ok: false, reason: expected ? `Próxima etapa: ${STAGE_DONE_LABEL[expected]}.` : 'A transferência já foi concluída.' }
  return { ok: true }
}

/** Etapas para "Ver etapas": concluída / atual / futura. */
export function stageTimeline(current: string, rules: TransferRules): { stage: TransferStage; label: string; state: 'done' | 'current' | 'todo' }[] {
  const list = stagesFor(rules)
  const i = Math.max(0, list.indexOf(current as TransferStage))
  return list.slice(1).map((stage, idx) => {
    const pos = idx + 1
    return { stage, label: STAGE_DONE_LABEL[stage], state: pos <= i ? 'done' : pos === i + 1 ? 'current' : 'todo' }
  })
}

/** Texto das instruções ao comprador (enviado pelo WhatsApp do próprio usuário). */
export function buyerInstructions(p: { buyerName?: string | null; vehicle: string; plate?: string | null; storeName?: string | null }): string {
  const first = (p.buyerName ?? '').trim().split(/\s+/)[0]
  return [
    `Olá${first ? `, ${first}` : ''}! Aqui é da ${p.storeName ?? 'loja'}.`,
    `Para concluir a transferência do ${p.vehicle}${p.plate ? ` (${p.plate})` : ''} para o seu nome:`,
    '1. Abra o app Carteira Digital de Trânsito (CDT) com a sua conta gov.br.',
    '2. Em "Veículos", abra a ATPV-e pendente e confira os dados.',
    '3. Assine a ATPV-e digitalmente.',
    'Depois disso cuidamos da vistoria e das taxas e avisamos quando o novo CRLV-e estiver disponível.',
  ].join('\n')
}
