// =============================================================================
// ai/adapters/mock-ai.adapter.ts — provedor MOCK (sem API real).
// Permite testar telas e fluxo de ponta a ponta SEM consumir provedor pago.
// Respostas determinísticas/derivadas do input, claramente marcadas como mock.
// Não inventa aprovação/crédito/decisão — apenas resume/explica de forma neutra.
// =============================================================================

import type { AiProviderKind } from '@prisma/client'
import { BaseAiAdapter } from './base'
import type { AiCapabilities, AiAdapterContext, AiTextResult, AiDocAnalysis } from './types'

const TAG = '[MockAI]'

function summarize(text: string): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return `${TAG} Sem conteúdo para resumir.`
  const head = clean.slice(0, 280)
  return `${TAG} Resumo (simulado): ${head}${clean.length > 280 ? '…' : ''}`
}

export class MockAiAdapter extends BaseAiAdapter {
  readonly kind: AiProviderKind = 'CUSTOM'
  readonly capabilities: AiCapabilities = { text: true, summarize: true, document: true, image: false, structured: true }

  isReady(_ctx: AiAdapterContext): boolean { return true } // mock sempre pronto

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: `${TAG} Conexão simulada OK (provedor mock para testes).` }
  }

  async generateText(prompt: string): Promise<AiTextResult> {
    const text = `${TAG} Resposta simulada para: "${(prompt || '').slice(0, 120)}". Configure um provedor real para respostas de verdade.`
    return { text, tokenInput: this.countTokens(prompt), tokenOutput: this.countTokens(text) }
  }

  async summarizeText(text: string): Promise<AiTextResult> {
    const out = summarize(text)
    return { text: out, tokenInput: this.countTokens(text), tokenOutput: this.countTokens(out) }
  }

  async analyzeDocument(input: { text?: string; mimeType?: string }): Promise<AiDocAnalysis> {
    const t = input.text ?? ''
    const legible = t.replace(/\s+/g, '').length >= 20
    return {
      summary: legible ? summarize(t) : `${TAG} Documento sem texto legível — precisa de OCR/conferência humana.`,
      documentType: null,
      legible,
      needsHumanReview: !legible,
      note: 'Análise simulada (MockAI). Não substitui validação jurídica/contábil/financeira.',
    }
  }

  async extractStructuredData(text: string): Promise<Record<string, unknown>> {
    return { _mock: true, chars: (text || '').length, note: `${TAG} extração estruturada simulada` }
  }
}
