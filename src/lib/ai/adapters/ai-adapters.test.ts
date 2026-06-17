// =============================================================================
// Testes da camada de adapters de IA (fundação — só estrutura).
// =============================================================================

import { describe, it, expect } from 'vitest'
import { getAiAdapter } from './registry'
import { MockAiAdapter } from './mock-ai.adapter'
import { GeminiAdapter } from './gemini.adapter'
import { AiNotConfiguredError, type AiAdapterContext } from './types'

const ctx: AiAdapterContext = { environment: 'SANDBOX' }

describe('registry', () => {
  it('CUSTOM → MockAiAdapter; reais → seus adapters', () => {
    expect(getAiAdapter('CUSTOM')).toBeInstanceOf(MockAiAdapter)
    expect(getAiAdapter('GEMINI')).toBeInstanceOf(GeminiAdapter)
  })
})

describe('MockAiAdapter (testes sem API real)', () => {
  const a = new MockAiAdapter()
  it('está pronto e testa conexão', async () => {
    expect(a.isReady(ctx)).toBe(true)
    expect((await a.testConnection()).ok).toBe(true)
  })
  it('resume texto de forma marcada (sem inventar decisão)', async () => {
    const r = await a.summarizeText('Texto de contrato com várias cláusulas relevantes para resumo.')
    expect(r.text).toContain('[MockAI]')
  })
  it('marca documento ilegível como needsHumanReview', async () => {
    const r = await a.analyzeDocument({ text: '' })
    expect(r.legible).toBe(false)
    expect(r.needsHumanReview).toBe(true)
  })
})

describe('Provedores reais — preparados, não configurados', () => {
  it('Gemini não está pronto e bloqueia operação', async () => {
    const g = new GeminiAdapter()
    expect(g.isReady(ctx)).toBe(false)
    await expect(g.generateText('oi', ctx)).rejects.toBeInstanceOf(AiNotConfiguredError)
  })
})
