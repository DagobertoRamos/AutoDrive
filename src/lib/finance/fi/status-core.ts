// =============================================================================
// F&I Core — núcleo PURO de estados (sem Prisma). Testado em status-core.test.ts.
//
//   Ficha (FinanceProposal)            → situação consolidada das tentativas
//   Tentativa por banco (Submission)   → máquina de estados com transições válidas
//   Formalização / Gravame / Pagamento → máquinas de estados independentes
//
// Regras de ouro:
//   • Transição inválida é rejeitada (ex.: RECUSADA → PAGO não existe).
//   • Repetir o mesmo status é idempotente (webhook duplicado não muda nada).
//   • Status desconhecido nunca vira sucesso.
//   • Tudo que aparece ao usuário está em português (rótulos aqui).
// =============================================================================

export type Tone = 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger'
/** Ícone sugerido (lucide) — o status nunca depende só de cor. */
export type StatusIcon = 'circle' | 'clock' | 'search' | 'check' | 'check-double' | 'x' | 'alert' | 'ban' | 'send' | 'hourglass' | 'file' | 'pen' | 'lock' | 'wallet' | 'refresh'
export interface StatusMeta { label: string; tone: Tone; icon: StatusIcon }

// ── Ficha (situação consolidada) ─────────────────────────────────────────────
export const PROPOSAL_STATUS = ['SIMULACAO', 'PREENCHENDO', 'ENVIADA', 'EM_ANALISE', 'PRE_APROVADA', 'APROVADA', 'RECUSADA', 'EXPIRADA', 'CANCELADA'] as const
export type ProposalStatus = (typeof PROPOSAL_STATUS)[number]
export const PROPOSAL_STATUS_META: Record<ProposalStatus, StatusMeta> = {
  SIMULACAO:    { label: 'Rascunho', tone: 'neutral', icon: 'circle' },
  PREENCHENDO:  { label: 'Preenchendo', tone: 'neutral', icon: 'pen' },
  ENVIADA:      { label: 'Enviada', tone: 'info', icon: 'send' },
  EM_ANALISE:   { label: 'Em análise', tone: 'progress', icon: 'search' },
  PRE_APROVADA: { label: 'Pré-aprovada', tone: 'success', icon: 'check' },
  APROVADA:     { label: 'Aprovada', tone: 'success', icon: 'check-double' },
  RECUSADA:     { label: 'Recusada', tone: 'danger', icon: 'x' },
  EXPIRADA:     { label: 'Expirada', tone: 'warning', icon: 'hourglass' },
  CANCELADA:    { label: 'Cancelada', tone: 'neutral', icon: 'ban' },
}

// ── Tentativa por banco ───────────────────────────────────────────────────────
export const ATTEMPT_STATUS = [
  'ENVIANDO', 'VERIFICANDO', 'FALHA_ENVIO', 'ENVIADA', 'EM_ANALISE', 'PENDENTE',
  'PRE_APROVADA', 'APROVADA', 'RECUSADA', 'EXPIRADA', 'CANCELADA', 'SUBSTITUIDA',
] as const
export type AttemptStatus = (typeof ATTEMPT_STATUS)[number]
export const ATTEMPT_STATUS_META: Record<AttemptStatus, StatusMeta> = {
  ENVIANDO:     { label: 'Enviando', tone: 'progress', icon: 'send' },
  VERIFICANDO:  { label: 'Verificando resposta do banco', tone: 'warning', icon: 'refresh' },
  FALHA_ENVIO:  { label: 'Não foi possível enviar', tone: 'danger', icon: 'alert' },
  ENVIADA:      { label: 'Aguardando o banco', tone: 'info', icon: 'clock' },
  EM_ANALISE:   { label: 'Em análise', tone: 'progress', icon: 'search' },
  PENDENTE:     { label: 'Com pendência', tone: 'warning', icon: 'file' },
  PRE_APROVADA: { label: 'Pré-aprovada', tone: 'success', icon: 'check' },
  APROVADA:     { label: 'Aprovada', tone: 'success', icon: 'check-double' },
  RECUSADA:     { label: 'Recusada', tone: 'danger', icon: 'x' },
  EXPIRADA:     { label: 'Expirada', tone: 'warning', icon: 'hourglass' },
  CANCELADA:    { label: 'Cancelada', tone: 'neutral', icon: 'ban' },
  SUBSTITUIDA:  { label: 'Substituída por nova versão', tone: 'neutral', icon: 'refresh' },
}

const ATTEMPT_DECISIONS: AttemptStatus[] = ['ENVIADA', 'EM_ANALISE', 'PENDENTE', 'PRE_APROVADA', 'APROVADA', 'RECUSADA', 'EXPIRADA', 'CANCELADA']
const ATTEMPT_TRANSITIONS: Record<AttemptStatus, AttemptStatus[]> = {
  ENVIANDO:     ['VERIFICANDO', 'FALHA_ENVIO', ...ATTEMPT_DECISIONS],
  VERIFICANDO:  ['FALHA_ENVIO', ...ATTEMPT_DECISIONS],
  FALHA_ENVIO:  ['CANCELADA'],
  ENVIADA:      ['EM_ANALISE', 'PENDENTE', 'PRE_APROVADA', 'APROVADA', 'RECUSADA', 'EXPIRADA', 'CANCELADA'],
  EM_ANALISE:   ['PENDENTE', 'PRE_APROVADA', 'APROVADA', 'RECUSADA', 'EXPIRADA', 'CANCELADA'],
  PENDENTE:     ['EM_ANALISE', 'PRE_APROVADA', 'APROVADA', 'RECUSADA', 'EXPIRADA', 'CANCELADA'],
  PRE_APROVADA: ['EM_ANALISE', 'PENDENTE', 'APROVADA', 'RECUSADA', 'EXPIRADA', 'CANCELADA'],
  APROVADA:     ['PENDENTE', 'EXPIRADA', 'CANCELADA'],
  RECUSADA:     [],
  EXPIRADA:     [],
  CANCELADA:    [],
  SUBSTITUIDA:  [],
}
/** Estados em que a tentativa ainda pode mudar (e ser substituída por "Ajustar proposta"). */
export const ATTEMPT_OPEN: AttemptStatus[] = ['ENVIANDO', 'VERIFICANDO', 'ENVIADA', 'EM_ANALISE', 'PENDENTE', 'PRE_APROVADA', 'APROVADA']
export const ATTEMPT_FINAL: AttemptStatus[] = ['FALHA_ENVIO', 'RECUSADA', 'EXPIRADA', 'CANCELADA', 'SUBSTITUIDA']

export const isAttemptStatus = (s: unknown): s is AttemptStatus => typeof s === 'string' && (ATTEMPT_STATUS as readonly string[]).includes(s)

export type TransitionCheck = { ok: true; noop: boolean } | { ok: false; reason: string }

/** Valida a mudança de status de uma tentativa. Mesmo status = no-op idempotente. */
export function checkAttemptTransition(from: string, to: string): TransitionCheck {
  if (!isAttemptStatus(to)) return { ok: false, reason: 'Situação informada não é reconhecida.' }
  // Legado: submissões antigas podem ter status fora do conjunto atual.
  const src: AttemptStatus = isAttemptStatus(from) ? from : 'ENVIADA'
  if (src === to) return { ok: true, noop: true }
  if (to === 'SUBSTITUIDA') {
    return ATTEMPT_OPEN.includes(src) ? { ok: true, noop: false } : { ok: false, reason: 'Esta proposta já foi encerrada.' }
  }
  if (!ATTEMPT_TRANSITIONS[src].includes(to)) {
    return { ok: false, reason: `Não é possível passar de "${ATTEMPT_STATUS_META[src].label}" para "${ATTEMPT_STATUS_META[to].label}".` }
  }
  return { ok: true, noop: false }
}

/**
 * Situação consolidada da ficha a partir das tentativas ATIVAS (versão atual de
 * cada banco). Cancelamento manual da ficha é preservado.
 */
export function deriveProposalStatus(current: string, attempts: { status: string; active?: boolean }[]): ProposalStatus {
  if (current === 'CANCELADA') return 'CANCELADA'
  const act = attempts.filter((a) => a.active !== false).map((a) => (isAttemptStatus(a.status) ? a.status : 'ENVIADA'))
  if (act.length === 0) return current === 'PREENCHENDO' ? 'PREENCHENDO' : 'SIMULACAO'
  const has = (...s: AttemptStatus[]) => act.some((x) => s.includes(x))
  if (has('APROVADA')) return 'APROVADA'
  if (has('PRE_APROVADA')) return 'PRE_APROVADA'
  if (has('EM_ANALISE', 'PENDENTE')) return 'EM_ANALISE'
  if (has('ENVIADA', 'ENVIANDO', 'VERIFICANDO')) return 'ENVIADA'
  if (has('RECUSADA')) return 'RECUSADA'
  if (act.every((x) => x === 'EXPIRADA')) return 'EXPIRADA'
  if (act.every((x) => x === 'CANCELADA')) return 'CANCELADA'
  if (has('EXPIRADA')) return 'EXPIRADA'
  // Só falhas de envio: nada chegou ao banco → continua rascunho.
  return 'SIMULACAO'
}

// ── Formalização / Gravame / Pagamento do banco / Retorno ────────────────────
export const FORMALIZATION_STATUS = ['NAO_INICIADA', 'EM_ANDAMENTO', 'AGUARDANDO_DOCUMENTOS', 'AGUARDANDO_ASSINATURA', 'ASSINADA', 'CONCLUIDA', 'COM_PENDENCIA'] as const
export type FormalizationStatus = (typeof FORMALIZATION_STATUS)[number]
export const FORMALIZATION_META: Record<FormalizationStatus, StatusMeta> = {
  NAO_INICIADA:          { label: 'Não iniciada', tone: 'neutral', icon: 'circle' },
  EM_ANDAMENTO:          { label: 'Em andamento', tone: 'progress', icon: 'clock' },
  AGUARDANDO_DOCUMENTOS: { label: 'Aguardando documentos', tone: 'warning', icon: 'file' },
  AGUARDANDO_ASSINATURA: { label: 'Aguardando assinatura', tone: 'warning', icon: 'pen' },
  ASSINADA:              { label: 'Assinada', tone: 'success', icon: 'check' },
  CONCLUIDA:             { label: 'Concluída', tone: 'success', icon: 'check-double' },
  COM_PENDENCIA:         { label: 'Com pendência', tone: 'danger', icon: 'alert' },
}
const FORMALIZATION_TRANSITIONS: Record<FormalizationStatus, FormalizationStatus[]> = {
  NAO_INICIADA:          ['EM_ANDAMENTO', 'AGUARDANDO_DOCUMENTOS', 'AGUARDANDO_ASSINATURA'],
  EM_ANDAMENTO:          ['AGUARDANDO_DOCUMENTOS', 'AGUARDANDO_ASSINATURA', 'ASSINADA', 'COM_PENDENCIA'],
  AGUARDANDO_DOCUMENTOS: ['EM_ANDAMENTO', 'AGUARDANDO_ASSINATURA', 'COM_PENDENCIA'],
  AGUARDANDO_ASSINATURA: ['EM_ANDAMENTO', 'ASSINADA', 'COM_PENDENCIA'],
  ASSINADA:              ['CONCLUIDA', 'COM_PENDENCIA'],
  CONCLUIDA:             ['COM_PENDENCIA'],
  COM_PENDENCIA:         ['EM_ANDAMENTO', 'AGUARDANDO_DOCUMENTOS', 'AGUARDANDO_ASSINATURA', 'ASSINADA'],
}

export const LIEN_STATUS = ['NAO_INICIADO', 'SOLICITADO', 'REGISTRADO', 'COM_PENDENCIA', 'BAIXADO'] as const
export type LienStatus = (typeof LIEN_STATUS)[number]
export const LIEN_META: Record<LienStatus, StatusMeta> = {
  NAO_INICIADO:  { label: 'Não iniciado', tone: 'neutral', icon: 'circle' },
  SOLICITADO:    { label: 'Solicitado', tone: 'progress', icon: 'clock' },
  REGISTRADO:    { label: 'Registrado', tone: 'success', icon: 'lock' },
  COM_PENDENCIA: { label: 'Com pendência', tone: 'danger', icon: 'alert' },
  BAIXADO:       { label: 'Baixado', tone: 'neutral', icon: 'check' },
}
const LIEN_TRANSITIONS: Record<LienStatus, LienStatus[]> = {
  NAO_INICIADO:  ['SOLICITADO', 'REGISTRADO'],
  SOLICITADO:    ['REGISTRADO', 'COM_PENDENCIA'],
  COM_PENDENCIA: ['SOLICITADO', 'REGISTRADO'],
  REGISTRADO:    ['BAIXADO', 'COM_PENDENCIA'],
  BAIXADO:       [],
}

export const FUNDING_STATUS = ['NAO_ESPERADO', 'AGUARDANDO', 'ENVIADO_PAGAMENTO', 'COM_PENDENCIA', 'PAGO', 'PAGO_PARCIAL', 'BLOQUEADO'] as const
export type FundingStatus = (typeof FUNDING_STATUS)[number]
export const FUNDING_META: Record<FundingStatus, StatusMeta> = {
  NAO_ESPERADO:      { label: 'Ainda não esperado', tone: 'neutral', icon: 'circle' },
  AGUARDANDO:        { label: 'Aguardando', tone: 'info', icon: 'clock' },
  ENVIADO_PAGAMENTO: { label: 'Enviado para pagamento', tone: 'progress', icon: 'send' },
  COM_PENDENCIA:     { label: 'Com pendência', tone: 'danger', icon: 'alert' },
  PAGO:              { label: 'Pago', tone: 'success', icon: 'wallet' },
  PAGO_PARCIAL:      { label: 'Pago parcialmente', tone: 'warning', icon: 'wallet' },
  BLOQUEADO:         { label: 'Bloqueado', tone: 'danger', icon: 'lock' },
}
const FUNDING_TRANSITIONS: Record<FundingStatus, FundingStatus[]> = {
  NAO_ESPERADO:      ['AGUARDANDO'],
  AGUARDANDO:        ['ENVIADO_PAGAMENTO', 'COM_PENDENCIA', 'PAGO', 'PAGO_PARCIAL', 'BLOQUEADO', 'NAO_ESPERADO'],
  ENVIADO_PAGAMENTO: ['COM_PENDENCIA', 'PAGO', 'PAGO_PARCIAL', 'BLOQUEADO'],
  COM_PENDENCIA:     ['AGUARDANDO', 'ENVIADO_PAGAMENTO', 'PAGO', 'PAGO_PARCIAL', 'BLOQUEADO'],
  BLOQUEADO:         ['AGUARDANDO', 'COM_PENDENCIA'],
  PAGO_PARCIAL:      ['PAGO', 'COM_PENDENCIA'],
  PAGO:              [],
}

export const RETURN_STATUS_META: Record<'PREVISTO' | 'RECEBIDO' | 'CONCILIADO' | 'ESTORNADO', StatusMeta> = {
  PREVISTO:   { label: 'Previsto', tone: 'info', icon: 'clock' },
  RECEBIDO:   { label: 'Recebido', tone: 'success', icon: 'wallet' },
  CONCILIADO: { label: 'Conciliado', tone: 'success', icon: 'check-double' },
  ESTORNADO:  { label: 'Estornado', tone: 'danger', icon: 'refresh' },
}

function simpleCheck<T extends string>(table: Record<T, T[]>, meta: Record<T, StatusMeta>, from: string, to: string): TransitionCheck {
  if (!(to in table)) return { ok: false, reason: 'Situação informada não é reconhecida.' }
  if (!(from in table)) return { ok: false, reason: 'Situação atual não reconhecida.' }
  if (from === to) return { ok: true, noop: true }
  if (!table[from as T].includes(to as T)) {
    return { ok: false, reason: `Não é possível passar de "${meta[from as T].label}" para "${meta[to as T].label}".` }
  }
  return { ok: true, noop: false }
}

export interface PostApprovalContext { proposalStatus: string; hasSelectedOffer: boolean; formalizationStatus: string }

/** Formalização só começa com proposta aprovada e escolhida. */
export function checkFormalizationTransition(from: string, to: string, ctx: PostApprovalContext): TransitionCheck {
  if (to !== 'NAO_INICIADA' && (ctx.proposalStatus !== 'APROVADA' || !ctx.hasSelectedOffer)) {
    return { ok: false, reason: 'A formalização começa depois de escolher uma proposta aprovada.' }
  }
  return simpleCheck(FORMALIZATION_TRANSITIONS, FORMALIZATION_META, from, to)
}

export function checkLienTransition(from: string, to: string, ctx: PostApprovalContext): TransitionCheck {
  if (ctx.proposalStatus !== 'APROVADA' || !ctx.hasSelectedOffer) {
    return { ok: false, reason: 'O gravame só existe para uma proposta aprovada e escolhida.' }
  }
  return simpleCheck(LIEN_TRANSITIONS, LIEN_META, from, to)
}

const SIGNED: string[] = ['ASSINADA', 'CONCLUIDA']
/** Pagamento do banco: nunca a partir de proposta recusada; pagamento exige contrato assinado. */
export function checkFundingTransition(from: string, to: string, ctx: PostApprovalContext): TransitionCheck {
  if (to !== 'NAO_ESPERADO' && (ctx.proposalStatus !== 'APROVADA' || !ctx.hasSelectedOffer)) {
    return { ok: false, reason: 'O pagamento do banco só é esperado para uma proposta aprovada e escolhida.' }
  }
  if (['ENVIADO_PAGAMENTO', 'PAGO', 'PAGO_PARCIAL'].includes(to) && !SIGNED.includes(ctx.formalizationStatus)) {
    return { ok: false, reason: 'O contrato precisa estar assinado antes do pagamento do banco.' }
  }
  return simpleCheck(FUNDING_TRANSITIONS, FUNDING_META, from, to)
}

// ── Próxima ação (o que o usuário faz agora) ─────────────────────────────────
export type NextActionKey =
  | 'COMPLETAR_FICHA' | 'ENVIAR_BANCOS' | 'AGUARDAR_BANCOS' | 'VERIFICAR_RESPOSTA' | 'REGISTRAR_RESPOSTA'
  | 'SOLICITAR_DOCUMENTOS' | 'ESCOLHER_PROPOSTA' | 'AJUSTAR_PROPOSTA' | 'INICIAR_FORMALIZACAO'
  | 'COLETAR_ASSINATURA' | 'RESOLVER_PENDENCIA' | 'SOLICITAR_GRAVAME' | 'AGUARDAR_PAGAMENTO' | 'CONCLUIDO' | 'NENHUMA'

export interface NextAction { key: NextActionKey; label: string; tone: Tone }

export interface NextActionInput {
  status: string
  missingFields: number
  attempts: { status: string; active?: boolean; mode?: string; pendingCount?: number }[]
  hasSelectedOffer: boolean
  formalizationStatus: string
  lienStatus: string
  fundingStatus: string
}

export function nextAction(i: NextActionInput): NextAction {
  const act = i.attempts.filter((a) => a.active !== false)
  if (i.status === 'CANCELADA') return { key: 'NENHUMA', label: 'Ficha cancelada', tone: 'neutral' }
  if (i.fundingStatus === 'PAGO') return { key: 'CONCLUIDO', label: 'Banco pagou — financiamento concluído', tone: 'success' }
  if (i.hasSelectedOffer && i.status === 'APROVADA') {
    if (i.formalizationStatus === 'COM_PENDENCIA') return { key: 'RESOLVER_PENDENCIA', label: 'Resolver pendência da formalização', tone: 'danger' }
    if (i.formalizationStatus === 'NAO_INICIADA') return { key: 'INICIAR_FORMALIZACAO', label: 'Iniciar a formalização', tone: 'info' }
    if (i.formalizationStatus === 'AGUARDANDO_DOCUMENTOS') return { key: 'SOLICITAR_DOCUMENTOS', label: 'Enviar documentos da formalização', tone: 'warning' }
    if (!SIGNED.includes(i.formalizationStatus)) return { key: 'COLETAR_ASSINATURA', label: 'Coletar a assinatura do contrato', tone: 'warning' }
    if (i.lienStatus === 'NAO_INICIADO') return { key: 'SOLICITAR_GRAVAME', label: 'Solicitar o gravame', tone: 'info' }
    if (i.lienStatus === 'COM_PENDENCIA') return { key: 'RESOLVER_PENDENCIA', label: 'Resolver pendência do gravame', tone: 'danger' }
    if (i.fundingStatus === 'COM_PENDENCIA' || i.fundingStatus === 'BLOQUEADO') return { key: 'RESOLVER_PENDENCIA', label: 'Resolver pendência do pagamento do banco', tone: 'danger' }
    return { key: 'AGUARDAR_PAGAMENTO', label: 'Aguardar o pagamento do banco', tone: 'info' }
  }
  if (act.length === 0) {
    if (i.missingFields > 0) return { key: 'COMPLETAR_FICHA', label: i.missingFields === 1 ? 'Completar 1 informação da ficha' : `Completar ${i.missingFields} informações da ficha`, tone: 'warning' }
    return { key: 'ENVIAR_BANCOS', label: 'Enviar a ficha aos bancos', tone: 'info' }
  }
  if (act.some((a) => a.status === 'APROVADA' || a.status === 'PRE_APROVADA')) return { key: 'ESCOLHER_PROPOSTA', label: 'Escolher a melhor proposta', tone: 'success' }
  if (act.some((a) => a.status === 'PENDENTE')) return { key: 'SOLICITAR_DOCUMENTOS', label: 'O banco pediu mais informações', tone: 'warning' }
  if (act.some((a) => a.status === 'VERIFICANDO')) return { key: 'VERIFICAR_RESPOSTA', label: 'Verificando resposta do banco', tone: 'warning' }
  if (act.some((a) => a.status === 'ENVIADA' && a.mode === 'MANUAL')) return { key: 'REGISTRAR_RESPOSTA', label: 'Registrar a resposta do banco', tone: 'info' }
  if (act.some((a) => ['ENVIANDO', 'ENVIADA', 'EM_ANALISE'].includes(a.status))) return { key: 'AGUARDAR_BANCOS', label: 'Aguardando os bancos', tone: 'progress' }
  if (act.every((a) => ['RECUSADA', 'EXPIRADA', 'FALHA_ENVIO', 'CANCELADA'].includes(a.status))) return { key: 'AJUSTAR_PROPOSTA', label: 'Ajustar a proposta e tentar de novo', tone: 'danger' }
  return { key: 'NENHUMA', label: 'Sem ação pendente', tone: 'neutral' }
}

// ── Ofertas: organização (nunca confunde "melhor p/ cliente" com "melhor p/ loja") ──
export interface Offer {
  submissionId: string; bankName: string; status: string
  downPayment: number | null; installments: number | null; installmentValue: number | null
  amount: number | null; cetMonthly: number | null; returnPercent: number | null
}
export type OfferRanking = 'MELHOR_PARCELA' | 'MENOR_ENTRADA' | 'MENOR_PRAZO' | 'MENOR_CUSTO' | 'MELHOR_RETORNO_LOJA'
export const OFFER_RANKING_LABEL: Record<OfferRanking, string> = {
  MELHOR_PARCELA: 'Melhor parcela', MENOR_ENTRADA: 'Menor entrada', MENOR_PRAZO: 'Menor prazo',
  MENOR_CUSTO: 'Menor custo (CET)', MELHOR_RETORNO_LOJA: 'Melhor retorno para a loja',
}

const usable = (o: Offer) => o.status === 'APROVADA' || o.status === 'PRE_APROVADA'
function pickMin(list: Offer[], f: (o: Offer) => number | null): Offer | null {
  let best: Offer | null = null
  for (const o of list) { const v = f(o); if (v == null) continue; const b = best ? f(best) : null; if (b == null || v < b) best = o }
  return best
}

/**
 * Destaques entre as ofertas utilizáveis. `includeStoreReturn` só para quem pode
 * ver retorno — e nunca aparece para o cliente.
 */
export function rankOffers(offers: Offer[], includeStoreReturn: boolean): Partial<Record<OfferRanking, string>> {
  const list = offers.filter(usable)
  const out: Partial<Record<OfferRanking, string>> = {}
  const set = (k: OfferRanking, o: Offer | null) => { if (o) out[k] = o.submissionId }
  set('MELHOR_PARCELA', pickMin(list, (o) => o.installmentValue))
  set('MENOR_ENTRADA', pickMin(list, (o) => o.downPayment))
  set('MENOR_PRAZO', pickMin(list, (o) => o.installments))
  set('MENOR_CUSTO', pickMin(list, (o) => o.cetMonthly))
  if (includeStoreReturn) set('MELHOR_RETORNO_LOJA', pickMin(list, (o) => (o.returnPercent == null ? null : -o.returnPercent)))
  return out
}

// ── Utilidades ────────────────────────────────────────────────────────────────
export function metaOf(kind: 'proposal' | 'attempt' | 'formalization' | 'lien' | 'funding', status: string): StatusMeta {
  const table: Record<string, StatusMeta> =
    kind === 'proposal' ? PROPOSAL_STATUS_META
      : kind === 'attempt' ? ATTEMPT_STATUS_META
        : kind === 'formalization' ? FORMALIZATION_META
          : kind === 'lien' ? LIEN_META : FUNDING_META
  return table[status] ?? { label: 'Situação desconhecida', tone: 'neutral', icon: 'circle' }
}

/** FI-2026-000381 */
export function formatFiCode(year: number, seq: number): string {
  return `FI-${year}-${String(seq).padStart(6, '0')}`
}
export function parseFiCodeSeq(code: string | null | undefined): number | null {
  const m = /^FI-\d{4}-(\d{6,})$/.exec(code ?? '')
  return m ? Number(m[1]) : null
}
