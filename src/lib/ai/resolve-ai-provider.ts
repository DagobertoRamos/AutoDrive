// =============================================================================
// ai/resolve-ai-provider.ts — escolhe o provedor de IA para um recurso (feature)
// e monta o contexto (com a chave decifrada em runtime). Ordem:
//   1) AiProvider ativo com a capacidade e adapter "pronto" (chave salva ou,
//      para GEMINI, process.env.GEMINI_API_KEY);
//   2) fallback: Gemini do servidor (process.env.GEMINI_API_KEY), sem registro;
//   3) fallback final: MockAI (responde sem custo / sem API real).
// Resiliente: se a tabela AiProvider ainda não existir (migration pendente),
// cai direto no Gemini do servidor ou MockAI. A chave NUNCA vai ao front/log.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { getAiAdapter, type AiProviderAdapter, type AiAdapterContext } from './adapters'
import { decryptSecrets, isAiCryptoConfigured } from './crypto'

export type AiFeature = 'help_chat' | 'analyze_document' | 'summarize_report'

export interface ResolvedAi {
  adapter: AiProviderAdapter
  ctx: AiAdapterContext
  providerId: string | null
  providerName: string
  mock: boolean
}

function capabilityOk(p: { allowHelpChat: boolean; allowDocAnalysis: boolean; allowReports: boolean }, feature: AiFeature): boolean {
  if (feature === 'help_chat') return p.allowHelpChat
  if (feature === 'analyze_document') return p.allowDocAnalysis
  return p.allowReports
}

function envGemini(): ResolvedAi | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) return null
  return {
    adapter: getAiAdapter('GEMINI'),
    ctx: { apiKey, model: process.env.GEMINI_MODEL || 'gemini-2.0-flash', environment: 'PRODUCAO', timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30000), maxTokens: Number(process.env.AI_MAX_TOKENS ?? 4000) || null },
    providerId: null,
    providerName: 'Gemini (servidor)',
    mock: false,
  }
}

function mock(): ResolvedAi {
  return { adapter: getAiAdapter('CUSTOM'), ctx: { environment: 'SANDBOX' }, providerId: null, providerName: 'MockAI', mock: true }
}

export async function resolveAiProvider(feature: AiFeature): Promise<ResolvedAi> {
  try {
    const providers = await prisma.aiProvider.findMany({ where: { active: true }, orderBy: [{ environment: 'desc' }, { updatedAt: 'desc' }] })
    for (const p of providers) {
      if (!capabilityOk(p, feature)) continue
      const secrets = isAiCryptoConfigured() ? decryptSecrets(p.secretsEncrypted) : {}
      const apiKey = secrets.apiKey || (p.kind === 'GEMINI' ? (process.env.GEMINI_API_KEY || undefined) : undefined)
      const adapter = getAiAdapter(p.kind)
      const ctx: AiAdapterContext = { providerId: p.id, model: p.model, baseUrl: p.baseUrl, apiKey, environment: p.environment, timeoutMs: p.timeoutMs ?? undefined, maxTokens: p.maxTokensPerRequest }
      if (adapter.isReady(ctx)) return { adapter, ctx, providerId: p.id, providerName: p.name, mock: false }
    }
  } catch {
    // Tabela ausente (migration pendente) ou erro de leitura → usa fallback.
  }
  return envGemini() ?? mock()
}
