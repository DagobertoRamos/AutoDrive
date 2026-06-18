// =============================================================================
// ai/resolve-ai-provider.ts — escolhe provedor(es) de IA por recurso (feature),
// com FAILOVER POR PRIORIDADE: se um provedor falhar, tenta o próximo conectado.
// Ordem dos candidatos:
//   1) AiProvider(s) ativos com a capacidade e adapter "pronto", por priority asc
//      (1 = tentado primeiro); chave salva (cifrada) ou, p/ GEMINI, env;
//   2) fallback: Gemini do servidor (process.env.GEMINI_API_KEY);
//   3) fallback final: MockAI (sempre responde — marcado como mock).
// Resiliente: se a tabela AiProvider não existir (migration pendente), usa só os
// fallbacks. A chave NUNCA vai ao front/log.
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

/** Lista ordenada de candidatos (prioridade asc) + fallbacks. */
export async function resolveAiCandidates(feature: AiFeature): Promise<ResolvedAi[]> {
  const candidates: ResolvedAi[] = []
  try {
    const providers = await prisma.aiProvider.findMany({ where: { active: true }, orderBy: [{ priority: 'asc' }, { environment: 'desc' }, { updatedAt: 'desc' }] })
    for (const p of providers) {
      if (!capabilityOk(p, feature)) continue
      const secrets = isAiCryptoConfigured() ? decryptSecrets(p.secretsEncrypted) : {}
      const apiKey = secrets.apiKey || (p.kind === 'GEMINI' ? (process.env.GEMINI_API_KEY || undefined) : undefined)
      const adapter = getAiAdapter(p.kind)
      const ctx: AiAdapterContext = { providerId: p.id, model: p.model, baseUrl: p.baseUrl, apiKey, environment: p.environment, timeoutMs: p.timeoutMs ?? undefined, maxTokens: p.maxTokensPerRequest }
      if (adapter.isReady(ctx)) candidates.push({ adapter, ctx, providerId: p.id, providerName: p.name, mock: false })
    }
  } catch {
    // Tabela ausente (migration pendente) → segue só com fallbacks.
  }
  const env = envGemini()
  // Evita duplicar o Gemini do servidor se já houver um provedor Gemini com a mesma chave.
  if (env && !candidates.some((c) => !c.mock && c.ctx.apiKey === env.ctx.apiKey)) candidates.push(env)
  candidates.push(mock())
  return candidates
}

/** Compat: primeiro candidato (sem failover). */
export async function resolveAiProvider(feature: AiFeature): Promise<ResolvedAi> {
  return (await resolveAiCandidates(feature))[0]
}

export type FailoverResult<T> =
  | { ok: true; result: T; provider: ResolvedAi; attempts: number }
  | { ok: false; error: string; provider: ResolvedAi | null; attempts: number }

/**
 * Executa `run` no 1º candidato; se lançar, tenta o próximo por prioridade.
 * Retorna no primeiro sucesso. O MockAI (último) garante uma resposta final.
 */
export async function runAiWithFailover<T>(feature: AiFeature, run: (r: ResolvedAi) => Promise<T>): Promise<FailoverResult<T>> {
  const candidates = await resolveAiCandidates(feature)
  let error = 'Nenhum provedor de IA disponível.'
  let provider: ResolvedAi | null = null
  let attempts = 0
  for (const c of candidates) {
    provider = c
    attempts++
    try {
      const result = await run(c)
      return { ok: true, result, provider: c, attempts }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Falha na IA.'
    }
  }
  return { ok: false, error, provider, attempts }
}
