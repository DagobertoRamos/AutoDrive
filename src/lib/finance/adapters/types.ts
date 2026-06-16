// =============================================================================
// F&I — Camada de adapters de provedores de financiamento (Fase 5).
// Tipos de I/O + contrato. SÓ ESTRUTURA: nenhum adapter faz chamada real a
// banco sem documentação/credencial oficial. PROIBIDO automação oculta /
// RPA que imita humano em tela de banco — apenas API oficial / webhook /
// integração homologada / registro manual supervisionado.
// Esta camada é PURA (sem Prisma/efeitos): a orquestração e persistência
// ficam nos serviços/rotas das fases seguintes (simulação/fichas).
// =============================================================================

import type { FinanceProviderKind, FinanceEnvironment } from '@prisma/client'

// ── Contexto de execução (preenchido pela orquestração) ──────────────────────
export interface AdapterContext {
  tenantId: string
  environment: FinanceEnvironment
  /** URL base oficial do provedor para o ambiente (homolog/prod). */
  baseUrl?: string | null
  apiVersion?: string | null
  /** Segredos JÁ DECIFRADOS pela orquestração (nunca logar). */
  credentials?: Record<string, string>
  /** Código da loja no provedor, quando aplicável. */
  storeCode?: string | null
}

// ── Simulação ────────────────────────────────────────────────────────────────
export interface SimulationInput {
  bankId?: string | null
  vehicle?: string | null
  vehicleValue?: number | null
  downPayment?: number | null
  financedAmount?: number | null
  installments?: number | null
}
export interface SimulationOptionResult {
  bankId?: string | null
  bankName?: string | null
  installments?: number | null
  installmentValue?: number | null
  rate?: number | null
  cet?: number | null
  estimatedReturn?: number | null
  status?: string | null
}
export interface SimulationResult {
  options: SimulationOptionResult[]
  /** Marca quando a simulação não foi automática (ex.: registro manual). */
  manual?: boolean
}

// ── Submissão de ficha ────────────────────────────────────────────────────────
export interface SubmissionInput {
  proposalId: string
  bankId?: string | null
  proponent: Record<string, unknown>
  vehicle?: string | null
  amountRequested?: number | null
  downPayment?: number | null
  installments?: number | null
}
export interface SubmissionResult {
  /** Id da proposta no provedor (null para registro manual). */
  externalId: string | null
  status: string            // ex.: ENVIADA | EM_ANALISE | APROVADA | RECUSADA
  source: 'MANUAL' | 'API'
  requestPayload?: unknown
  responsePayload?: unknown
  message?: string
}

// ── Consulta de status ────────────────────────────────────────────────────────
export interface StatusResult {
  externalId: string | null
  status: string
  source: 'MANUAL' | 'API' | 'WEBHOOK'
  message?: string
  raw?: unknown
}

// ── Webhook ────────────────────────────────────────────────────────────────────
export interface WebhookParseResult {
  externalId: string | null
  status: string | null
  signatureValid: boolean | null
  message?: string
  raw: unknown
}

// ── Capacidades declaradas do adapter ─────────────────────────────────────────
export interface AdapterCapabilities {
  simulate: boolean
  submit: boolean
  status: boolean
  webhook: boolean
}

// ── Contrato do adapter ────────────────────────────────────────────────────────
export interface FinancingProviderAdapter {
  readonly kind: FinanceProviderKind
  readonly capabilities: AdapterCapabilities
  /** true se o adapter está pronto para operar de verdade no contexto dado. */
  isReady(ctx: AdapterContext): boolean
  simulate(input: SimulationInput, ctx: AdapterContext): Promise<SimulationResult>
  submit(input: SubmissionInput, ctx: AdapterContext): Promise<SubmissionResult>
  getStatus(externalId: string, ctx: AdapterContext): Promise<StatusResult>
  parseWebhook(payload: unknown, headers: Record<string, string>, ctx: AdapterContext): Promise<WebhookParseResult>
}

// ── Erros ──────────────────────────────────────────────────────────────────────
export class AdapterError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = 'AdapterError' }
}
/** Operação válida, mas o adapter não está configurado (faltam credenciais/doc oficial). */
export class AdapterNotConfiguredError extends AdapterError {
  constructor(message = 'Integração não configurada: requer credenciais e documentação oficiais do provedor.') {
    super(message, 'ADAPTER_NOT_CONFIGURED'); this.name = 'AdapterNotConfiguredError'
  }
}
/** O provedor não suporta esta operação. */
export class AdapterNotSupportedError extends AdapterError {
  constructor(op: string) { super(`Operação não suportada por este provedor: ${op}.`, 'ADAPTER_NOT_SUPPORTED'); this.name = 'AdapterNotSupportedError' }
}
