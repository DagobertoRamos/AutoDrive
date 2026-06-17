// =============================================================================
// ai/adapters/gemini.adapter.ts — adapter Gemini PREPARADO (sem integração real).
// Capacidades-alvo declaradas, porém TODA operação lança AiNotConfiguredError
// até existir documentação oficial + credenciais + variáveis de ambiente válidas.
// NÃO implementar chamada real sem isso (regra do prompt). Substituir os métodos
// pela API oficial quando homologado; a chave vem em ctx.apiKey (cifrada em repouso).
// =============================================================================

import type { AiProviderKind } from '@prisma/client'
import { BaseAiAdapter } from './base'
import type { AiCapabilities, AiAdapterContext, AiTextResult, AiDocAnalysis } from './types'
import { AiNotConfiguredError } from './types'

export class GeminiAdapter extends BaseAiAdapter {
  readonly kind: AiProviderKind = 'GEMINI'
  readonly capabilities: AiCapabilities = { text: true, summarize: true, document: true, image: true, structured: true }

  // Só estaria pronto com apiKey + mapeamento oficial homologado — mantido false nesta fase.
  isReady(_ctx: AiAdapterContext): boolean { return false }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: 'Gemini: integração não configurada (requer credenciais e documentação oficiais).' }
  }
  async generateText(_p: string, _ctx: AiAdapterContext): Promise<AiTextResult> { throw new AiNotConfiguredError('Gemini: generateText requer integração oficial.') }
  async summarizeText(_t: string, _ctx: AiAdapterContext): Promise<AiTextResult> { throw new AiNotConfiguredError('Gemini: summarizeText requer integração oficial.') }
  async analyzeDocument(_i: { text?: string; mimeType?: string; base64?: string }, _ctx: AiAdapterContext): Promise<AiDocAnalysis> { throw new AiNotConfiguredError('Gemini: analyzeDocument requer integração oficial.') }
  async analyzeImage(_i: { base64: string; mimeType: string }, _ctx: AiAdapterContext): Promise<AiDocAnalysis> { throw new AiNotConfiguredError('Gemini: analyzeImage requer integração oficial.') }
  async extractStructuredData(_t: string, _s: string, _ctx: AiAdapterContext): Promise<Record<string, unknown>> { throw new AiNotConfiguredError('Gemini: extractStructuredData requer integração oficial.') }
}
