// =============================================================================
// ai/adapters/registry.ts — resolve o adapter de IA pelo AiProviderKind.
// CUSTOM → MockAiAdapter (testa telas/fluxo sem API real). Os provedores reais
// (Gemini/OpenAI/Anthropic) ficam "preparados" até integração oficial.
// =============================================================================

import type { AiProviderKind } from '@prisma/client'
import type { AiProviderAdapter } from './types'
import { MockAiAdapter } from './mock-ai.adapter'
import { GeminiAdapter } from './gemini.adapter'
import { OpenAIAdapter } from './openai.adapter'
import { AnthropicAdapter } from './anthropic.adapter'

const mock = new MockAiAdapter()
const gemini = new GeminiAdapter()
const openai = new OpenAIAdapter()
const anthropic = new AnthropicAdapter()

/** Adapter por kind. Default seguro: MockAiAdapter (sem custo, sem ação real). */
export function getAiAdapter(kind: AiProviderKind): AiProviderAdapter {
  switch (kind) {
    case 'GEMINI': return gemini
    case 'OPENAI': return openai
    case 'ANTHROPIC': return anthropic
    case 'CUSTOM':
    default: return mock
  }
}
