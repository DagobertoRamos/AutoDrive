// =============================================================================
// "Banco de testes" — SÓ desenvolvimento/homologação/testes automatizados.
// Em produção é recusado (isSandboxAllowed() = false) e nunca aparece como
// resposta de banco real. Comportamento escolhido na credencial de teste
// (`comportamento`): aprova | recusa | pendencia | lento | indisponivel | sem_resposta.
// =============================================================================

import { NotIntegratedBank } from './base'
import {
  BankGatewayError,
  type ApplicantPayload, type BankCapabilities, type BankChannel, type BankContext, type BankDecision,
  type FundingInfo, type ProposalTerms, type SimulationQuote, type WebhookEvent,
} from './types'

export function isSandboxAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL_ENV === 'production') return false
  if (env.NODE_ENV === 'production' && env.FI_SANDBOX !== '1') return false
  return env.NODE_ENV === 'test' || env.FI_SANDBOX === '1'
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const round2 = (n: number) => Math.round(n * 100) / 100
export function priceInstallment(pv: number, ratePct: number, n: number): number {
  const i = ratePct / 100
  if (n <= 0) return 0
  if (i === 0) return round2(pv / n)
  return round2((pv * i) / (1 - Math.pow(1 + i, -n)))
}

export class SandboxBankAdapter extends NotIntegratedBank {
  readonly key = 'teste'
  readonly name = 'Banco de testes'
  readonly channel: BankChannel = 'TESTE'
  readonly capabilities: BankCapabilities = {
    simulate: true, preAnalyze: true, submit: true, update: true, status: true, documents: false,
    formalize: false, contract: false, funding: true, cancel: true, webhook: true,
  }
  private store = new Map<string, BankDecision>()

  isIntegrated(_ctx: BankContext): boolean { return isSandboxAllowed() }

  private guard() { if (!isSandboxAllowed()) throw new BankGatewayError('Banco de testes indisponível neste ambiente.', 'AMBIENTE') }

  private async behave(ctx: BankContext) {
    const b = ctx.credentials.comportamento ?? 'aprova'
    if (b === 'lento') await sleep(Number(ctx.credentials.atrasoMs ?? 1500))
    if (b === 'indisponivel') throw new BankGatewayError('O banco está fora do ar no momento.', 'INDISPONIVEL', 'NAO')
    if (b === 'sem_resposta') throw new BankGatewayError('O banco não respondeu a tempo.', 'TEMPO_ESGOTADO', 'TALVEZ')
    return b
  }

  private decide(b: string, terms: ProposalTerms, ctx: BankContext): BankDecision {
    const amount = terms.amount ?? Math.max(0, (terms.vehicleValue ?? 0) - (terms.downPayment ?? 0))
    const n = terms.installments ?? 48
    const rate = 1.79
    const externalId = `TESTE-${ctx.idempotencyKey ?? ctx.correlationId}`
    if (b === 'recusa') return { externalId, status: 'RECUSADA', reason: 'Recusada pela política de crédito (teste).' }
    const offer = { approvedAmount: amount, downPayment: terms.downPayment, installments: n, installmentValue: priceInstallment(amount, rate, n), rateMonthly: rate, cetMonthly: 2.05, cetYearly: 27.5, totalAmount: round2(priceInstallment(amount, rate, n) * n) }
    if (b === 'pendencia') return { externalId, status: 'PENDENTE', offer, pendingItems: [{ key: 'COMPROVANTE_RENDA', label: 'Comprovante de renda', kind: 'DOCUMENTO' }] }
    if (b === 'pre') return { externalId, status: 'PRE_APROVADA', offer }
    return { externalId, status: 'APROVADA', offer }
  }

  async simulate(terms: ProposalTerms, ctx: BankContext): Promise<SimulationQuote[]> {
    this.guard(); await this.behave(ctx)
    const amount = terms.amount ?? Math.max(0, (terms.vehicleValue ?? 0) - (terms.downPayment ?? 0))
    return [24, 36, 48, 60].map((n) => ({ installments: n, installmentValue: priceInstallment(amount, 1.79, n), rateMonthly: 1.79, cetMonthly: 2.05 }))
  }
  async preAnalyze(_a: ApplicantPayload, terms: ProposalTerms, ctx: BankContext): Promise<BankDecision> {
    this.guard(); const b = await this.behave(ctx); return this.decide(b === 'aprova' ? 'pre' : b, terms, ctx)
  }
  async submitProposal(_a: ApplicantPayload, terms: ProposalTerms, ctx: BankContext): Promise<BankDecision> {
    this.guard(); const b = await this.behave(ctx); const d = this.decide(b, terms, ctx)
    if (ctx.idempotencyKey) this.store.set(ctx.idempotencyKey, d)
    return d
  }
  async updateProposal(externalId: string, terms: ProposalTerms, ctx: BankContext): Promise<BankDecision> {
    this.guard(); const b = await this.behave(ctx); return { ...this.decide(b, terms, ctx), externalId }
  }
  async getStatus(externalId: string, ctx: BankContext): Promise<BankDecision> {
    this.guard()
    for (const d of this.store.values()) if (d.externalId === externalId) return d
    return { externalId, status: ctx.credentials.statusConsulta === 'nao_recebida' ? 'FALHA_ENVIO' : 'EM_ANALISE' }
  }
  async findByIdempotencyKey(key: string, _ctx: BankContext): Promise<BankDecision | null> { this.guard(); return this.store.get(key) ?? null }
  async getFundingStatus(_e: string, _ctx: BankContext): Promise<FundingInfo> { this.guard(); return { status: 'AGUARDANDO' } }
  async cancel(_e: string, _r: string, _ctx: BankContext): Promise<void> { this.guard() }
  async testConnection(ctx: BankContext): Promise<void> { this.guard(); await this.behave(ctx) }

  parseWebhook(payload: unknown): WebhookEvent[] {
    const p = (payload ?? {}) as Record<string, unknown>
    const status = typeof p.status === 'string' ? p.status : null
    return [{
      eventId: typeof p.eventId === 'string' ? p.eventId : null,
      externalId: typeof p.externalId === 'string' ? p.externalId : null,
      decision: status ? { status: status as BankDecision['status'], reason: typeof p.reason === 'string' ? p.reason : null } : null,
      raw: payload,
    }]
  }
}
