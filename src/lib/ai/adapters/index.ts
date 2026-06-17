// =============================================================================
// ai/adapters — barrel. Camada de provedores de IA (controlada). Só MockAI
// opera; provedores reais exigem integração oficial + env válidas.
// =============================================================================

export * from './types'
export { BaseAiAdapter } from './base'
export { MockAiAdapter } from './mock-ai.adapter'
export { GeminiAdapter } from './gemini.adapter'
export { OpenAIAdapter } from './openai.adapter'
export { AnthropicAdapter } from './anthropic.adapter'
export { getAiAdapter } from './registry'
