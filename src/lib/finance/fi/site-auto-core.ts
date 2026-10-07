// =============================================================================
// F&I — simulação automática do site. Regras PURAS (testadas).
// Resultado guardado em FinanceProposal.simulationResult:
//   { status, at, terms, quotes[], pending[], failed[], history[] }
//   COTADO             → todos os bancos conectados responderam;
//   PARCIAL            → ao menos um respondeu, outros ainda aguardando;
//   AGUARDANDO_ANALISE → nenhum respondeu (sem banco conectado ou erro): equipe F&I analisa.
// Estimativa nunca é aprovação: quem aprova é o banco.
// =============================================================================

export type AutoSimStatus = 'COTADO' | 'PARCIAL' | 'AGUARDANDO_ANALISE'

export interface Terms { vehicleValue: number; downPayment: number; installments: number }
export interface BankQuote { bankId: string; bank: string; installments: number; installmentValue: number; rateMonthly: number | null; cetMonthly: number | null }
export interface PendingBank { bankId: string; bank: string; reason: 'MANUAL' | 'ERRO' }

export interface AutoSimResult {
  status: AutoSimStatus
  at: string
  terms: Terms
  quotes: BankQuote[]
  pending: PendingBank[]
  /** Histórico das simulações do cliente nesta ficha (mais recente por último). */
  history: { at: string; terms: Terms; status: AutoSimStatus; bestInstallment: number | null; banks: number }[]
}

export const MAX_HISTORY = 30

/** Cotação do banco mais próxima do prazo pedido (o banco pode devolver vários prazos). */
export function pickQuote(quotes: { installments: number; installmentValue: number; rateMonthly?: number | null; cetMonthly?: number | null }[], wanted: number) {
  const valid = quotes.filter((q) => q && q.installments > 0 && q.installmentValue > 0)
  if (!valid.length) return null
  return valid.reduce((best, q) => (Math.abs(q.installments - wanted) < Math.abs(best.installments - wanted) ? q : best))
}

export function statusOf(quotes: number, pending: number): AutoSimStatus {
  if (!quotes) return 'AGUARDANDO_ANALISE'
  return pending ? 'PARCIAL' : 'COTADO'
}

/** Junta a nova rodada ao histórico (mesma condição repetida só atualiza a última). */
export function withHistory(prev: unknown, next: Omit<AutoSimResult, 'history'>): AutoSimResult {
  const old = readResult(prev)?.history ?? []
  const best = next.quotes.length ? Math.min(...next.quotes.map((q) => q.installmentValue)) : null
  const entry = { at: next.at, terms: next.terms, status: next.status, bestInstallment: best, banks: next.quotes.length }
  const last = old[old.length - 1]
  const same = last && last.terms.vehicleValue === entry.terms.vehicleValue && last.terms.downPayment === entry.terms.downPayment && last.terms.installments === entry.terms.installments
  const history = same ? [...old.slice(0, -1), entry] : [...old, entry]
  return { ...next, history: history.slice(-MAX_HISTORY) }
}

export function readResult(v: unknown): AutoSimResult | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Partial<AutoSimResult>
  if (!o.status || !o.terms || !Array.isArray(o.quotes)) return null
  return { status: o.status, at: o.at ?? '', terms: o.terms, quotes: o.quotes, pending: Array.isArray(o.pending) ? o.pending : [], history: Array.isArray(o.history) ? o.history : [] }
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Frase para o cliente (site / minha ficha). */
export function customerMessage(r: AutoSimResult): { headline: string; detail: string } {
  if (r.status === 'COTADO') return { headline: r.quotes.length === 1 ? 'O banco respondeu à sua simulação.' : `${r.quotes.length} bancos responderam à sua simulação.`, detail: 'Valores sujeitos à análise de crédito. Nossa equipe vai falar com você.' }
  if (r.status === 'PARCIAL') return { headline: `${r.quotes.length === 1 ? '1 banco já respondeu' : `${r.quotes.length} bancos já responderam`}.`, detail: `Aguardando ${r.pending.length === 1 ? 'mais 1 banco' : `mais ${r.pending.length} bancos`}. Avisamos por aqui quando chegar.` }
  return { headline: 'Recebemos sua simulação.', detail: 'Nossa equipe de financiamento está consultando os bancos. Você acompanha tudo por aqui.' }
}

/** Texto para o lead / timeline interna. */
export function internalSummary(r: AutoSimResult): string {
  const t = r.terms
  const head = `Simulação automática do site: ${brl(t.vehicleValue)}, entrada ${brl(t.downPayment)}, ${t.installments}x.`
  const quotes = r.quotes.map((q) => `${q.bank}: ${q.installments}x de ${brl(q.installmentValue)}${q.rateMonthly != null ? ` (${q.rateMonthly.toFixed(2)}% a.m.)` : ''}`)
  const waiting = r.pending.length ? [`Aguardando análise manual: ${r.pending.map((p) => p.bank).join(', ')}.`] : []
  const status = r.status === 'AGUARDANDO_ANALISE' ? ['Nenhum banco respondeu automaticamente: aguardando análise da equipe F&I.'] : []
  return [head, ...quotes, ...waiting, ...status].join('\n')
}

/** Simulação do site parada sem ação da equipe (para o alerta). */
export function isStalled(p: { status: string; hasActiveSubmission: boolean; updatedAt: Date; lastAlertAt: string | null }, now: Date, stalledMin = 30, realertHours = 12): boolean {
  if (!['SIMULACAO', 'PREENCHENDO'].includes(p.status) || p.hasActiveSubmission) return false
  if (now.getTime() - p.updatedAt.getTime() < stalledMin * 60_000) return false
  if (p.lastAlertAt && now.getTime() - Date.parse(p.lastAlertAt) < realertHours * 3_600_000) return false
  return true
}
