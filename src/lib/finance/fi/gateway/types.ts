// =============================================================================
// F&I — GATEWAY DE BANCOS: contrato único (BankProvider).
//
// As telas, o CRM, o financeiro e os relatórios NUNCA falam com um banco.
// Só o orquestrador (fi/orchestrator.ts) chama o gateway, e o gateway escolhe o
// conector (BV, PAN, Santander… ou um agregador). Trocar um banco do agregador
// por integração direta é só trocar o `adapterKey` do banco — nada mais muda.
//
// Proibido: integração falsa, RPA/automação de tela de banco, resposta inventada.
// Sem API oficial + credencial da loja → "Banco ainda não integrado".
// =============================================================================

import type { AttemptStatus } from '../status-core'

export type BankChannel = 'DIRETO' | 'AGREGADOR' | 'TESTE'
export type BankEnvironment = 'HOMOLOGACAO' | 'PRODUCAO'

export interface BankCapabilities {
  simulate: boolean
  preAnalyze: boolean
  submit: boolean
  update: boolean
  status: boolean
  documents: boolean
  formalize: boolean
  contract: boolean
  funding: boolean
  cancel: boolean
  webhook: boolean
}
export const NO_CAPABILITIES: BankCapabilities = {
  simulate: false, preAnalyze: false, submit: false, update: false, status: false, documents: false,
  formalize: false, contract: false, funding: false, cancel: false, webhook: false,
}

/** Contexto da chamada: credenciais DA LOJA, decifradas só no momento (BYOC). */
export interface BankContext {
  tenantId: string
  environment: BankEnvironment
  credentials: Record<string, string>
  storeCode?: string | null
  baseUrl?: string | null
  correlationId: string
  /** Chave de idempotência da tentativa — repassada ao banco quando a API aceita. */
  idempotencyKey?: string
  /** Agregador: código do banco final atendido pelo agregador. */
  routedBankCode?: string | null
}

export interface ApplicantPayload {
  personType: 'PF' | 'PJ'
  /** Dados da ficha universal (mapeados pelo conector para o formato do banco). */
  data: Record<string, unknown>
  coBuyer?: { personType: 'PF' | 'PJ'; data: Record<string, unknown> } | null
}

export interface ProposalTerms {
  vehicleValue: number | null
  downPayment: number | null
  amount: number | null
  installments: number | null
  vehicle?: { description?: string | null; plate?: string | null; year?: number | null; fipeCode?: string | null } | null
  products?: { name: string; value: number }[]
}

export interface BankOffer {
  approvedAmount?: number | null
  downPayment?: number | null
  installments?: number | null
  installmentValue?: number | null
  rateMonthly?: number | null
  cetMonthly?: number | null
  cetYearly?: number | null
  totalAmount?: number | null
  tacValue?: number | null
  expiresAt?: string | null
}

export interface PendingItem { key: string; label: string; kind: 'DOCUMENTO' | 'CAMPO' | 'OUTRO' }

/** Resposta NORMALIZADA de qualquer banco. */
export interface BankDecision {
  externalId?: string | null
  requestId?: string | null
  status: AttemptStatus
  reason?: string | null
  offer?: BankOffer | null
  pendingItems?: PendingItem[]
}

export interface SimulationQuote { installments: number; installmentValue: number; rateMonthly?: number | null; cetMonthly?: number | null }

export interface FundingInfo { status: 'AGUARDANDO' | 'ENVIADO_PAGAMENTO' | 'COM_PENDENCIA' | 'PAGO' | 'PAGO_PARCIAL' | 'BLOQUEADO'; amount?: number | null; paidAt?: string | null; reason?: string | null }
export interface ContractInfo { contractNumber?: string | null; documentUrl?: string | null; signed?: boolean }

export interface WebhookEvent {
  eventId: string | null
  externalId: string | null
  decision: BankDecision | null
  funding?: FundingInfo | null
  raw: unknown
}

export interface BankProvider {
  readonly key: string
  readonly name: string
  readonly channel: BankChannel
  readonly capabilities: BankCapabilities
  /** Existe implementação OFICIAL (API contratada/homologada) para este conector? */
  readonly official: boolean
  /** true só com implementação OFICIAL + credencial completa da loja. */
  isIntegrated(ctx: BankContext): boolean
  /** Campos extras exigidos pelo banco (null = usar a configuração da loja). */
  getRequiredFields(): string[] | null

  simulate(terms: ProposalTerms, ctx: BankContext): Promise<SimulationQuote[]>
  preAnalyze(applicant: ApplicantPayload, terms: ProposalTerms, ctx: BankContext): Promise<BankDecision>
  submitProposal(applicant: ApplicantPayload, terms: ProposalTerms, ctx: BankContext): Promise<BankDecision>
  updateProposal(externalId: string, terms: ProposalTerms, ctx: BankContext): Promise<BankDecision>
  getStatus(externalId: string, ctx: BankContext): Promise<BankDecision>
  /** Busca uma proposta pela chave de idempotência (antes de reenviar após timeout). */
  findByIdempotencyKey(key: string, ctx: BankContext): Promise<BankDecision | null>
  getPendingDocuments(externalId: string, ctx: BankContext): Promise<PendingItem[]>
  sendDocument(externalId: string, doc: { type: string; fileName: string; mimeType: string; content: Uint8Array }, ctx: BankContext): Promise<void>
  formalize(externalId: string, ctx: BankContext): Promise<ContractInfo>
  getContract(externalId: string, ctx: BankContext): Promise<ContractInfo>
  getFundingStatus(externalId: string, ctx: BankContext): Promise<FundingInfo>
  cancel(externalId: string, reason: string, ctx: BankContext): Promise<void>
  /** Verifica acesso com a credencial da loja (sem enviar dado de cliente). */
  testConnection(ctx: BankContext): Promise<void>
  verifyWebhook(rawBody: string, headers: Record<string, string>, secret: string): boolean
  parseWebhook(payload: unknown): WebhookEvent[]
}

// ── Erros do gateway (em português, já prontos para a interface) ─────────────
export type GatewayErrorCode = 'NAO_INTEGRADO' | 'NAO_SUPORTADO' | 'CREDENCIAL' | 'INDISPONIVEL' | 'TEMPO_ESGOTADO' | 'REJEITADO' | 'AMBIENTE'

export class BankGatewayError extends Error {
  constructor(
    message: string,
    readonly code: GatewayErrorCode,
    /** O pedido pode ter chegado ao banco? 'NAO' permite tentar de novo; 'TALVEZ' exige verificar antes. */
    readonly delivered: 'NAO' | 'TALVEZ' = 'NAO',
  ) { super(message); this.name = 'BankGatewayError' }
}
export const notIntegrated = () => new BankGatewayError('Banco ainda não integrado.', 'NAO_INTEGRADO')
export const notSupported = (what: string) => new BankGatewayError(`Este banco não oferece ${what} pela integração.`, 'NAO_SUPORTADO')
