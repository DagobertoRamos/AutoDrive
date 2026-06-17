// =============================================================================
// ai/adapters/base.ts — base que NEGA operações por padrão (segurança).
// Adapters concretos sobrescrevem só o que de fato suportam.
// =============================================================================

import type { AiProviderKind } from '@prisma/client'
import type { AiProviderAdapter, AiCapabilities, AiAdapterContext, AiTextResult, AiDocAnalysis } from './types'
import { AiNotSupportedError } from './types'

export abstract class BaseAiAdapter implements AiProviderAdapter {
  abstract readonly kind: AiProviderKind
  abstract readonly capabilities: AiCapabilities

  isReady(_ctx: AiAdapterContext): boolean { return false }

  async testConnection(_ctx: AiAdapterContext): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: 'Provedor não configurado.' }
  }
  async generateText(_p: string, _ctx: AiAdapterContext): Promise<AiTextResult> { throw new AiNotSupportedError('generateText') }
  async summarizeText(_t: string, _ctx: AiAdapterContext): Promise<AiTextResult> { throw new AiNotSupportedError('summarizeText') }
  async analyzeDocument(_i: { text?: string; mimeType?: string; base64?: string }, _ctx: AiAdapterContext): Promise<AiDocAnalysis> { throw new AiNotSupportedError('analyzeDocument') }
  async analyzeImage(_i: { base64: string; mimeType: string }, _ctx: AiAdapterContext): Promise<AiDocAnalysis> { throw new AiNotSupportedError('analyzeImage') }
  async extractStructuredData(_t: string, _s: string, _ctx: AiAdapterContext): Promise<Record<string, unknown>> { throw new AiNotSupportedError('extractStructuredData') }

  // Estimativa simples (~4 chars/token) — substituída por contagem real no provedor.
  countTokens(text: string): number { return Math.ceil((text || '').length / 4) }
}
