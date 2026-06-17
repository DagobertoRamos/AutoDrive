// =============================================================================
// ai/adapters/types.ts — contrato único dos provedores de IA (AiProviderAdapter).
// SÓ ESTRUTURA: nenhum adapter real chama API sem documentação + credenciais
// oficiais e variáveis de ambiente válidas. O contexto recebe a credencial já
// decifrada em runtime (nunca logada). A IA é controlada — sem ações sensíveis.
// =============================================================================

import type { AiProviderKind } from '@prisma/client'

export interface AiAdapterContext {
  providerId?: string
  model?: string | null
  baseUrl?: string | null
  /** Chave decifrada em runtime (nunca logar/retornar ao front). */
  apiKey?: string
  environment?: 'SANDBOX' | 'PRODUCAO'
  timeoutMs?: number
  maxTokens?: number | null
}

export interface AiTextResult {
  text: string
  tokenInput?: number
  tokenOutput?: number
}

export interface AiDocAnalysis {
  summary: string
  documentType?: string | null
  keyFields?: Record<string, unknown>
  legible: boolean
  needsHumanReview?: boolean
  note?: string
}

export interface AiCapabilities {
  text: boolean
  summarize: boolean
  document: boolean
  image: boolean
  structured: boolean
}

export interface AiProviderAdapter {
  readonly kind: AiProviderKind
  readonly capabilities: AiCapabilities
  /** true se o adapter está realmente pronto para operar no contexto dado. */
  isReady(ctx: AiAdapterContext): boolean
  testConnection(ctx: AiAdapterContext): Promise<{ ok: boolean; message: string }>
  generateText(prompt: string, ctx: AiAdapterContext): Promise<AiTextResult>
  summarizeText(text: string, ctx: AiAdapterContext): Promise<AiTextResult>
  analyzeDocument(input: { text?: string; mimeType?: string; base64?: string }, ctx: AiAdapterContext): Promise<AiDocAnalysis>
  analyzeImage(input: { base64: string; mimeType: string }, ctx: AiAdapterContext): Promise<AiDocAnalysis>
  extractStructuredData(text: string, schemaHint: string, ctx: AiAdapterContext): Promise<Record<string, unknown>>
  countTokens(text: string): number
}

export class AiAdapterError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = 'AiAdapterError' }
}
export class AiNotConfiguredError extends AiAdapterError {
  constructor(message = 'Provedor de IA não configurado: requer documentação e credenciais oficiais + variáveis de ambiente válidas.') {
    super(message, 'AI_NOT_CONFIGURED'); this.name = 'AiNotConfiguredError'
  }
}
export class AiNotSupportedError extends AiAdapterError {
  constructor(op: string) { super(`Operação não suportada por este provedor de IA: ${op}.`, 'AI_NOT_SUPPORTED'); this.name = 'AiNotSupportedError' }
}
