// =============================================================================
// ai/adapters/gemini.adapter.ts — adapter Gemini (Google Generative Language).
// A chave vem SEMPRE em ctx.apiKey (backend), enviada à API do Google via header
// `x-goog-api-key` — NUNCA em URL/query, nunca logada, nunca devolvida ao front.
// isReady exige apiKey. Sem chave → operações lançam AiNotConfiguredError.
// =============================================================================

import type { AiProviderKind } from '@prisma/client'
import { BaseAiAdapter } from './base'
import type { AiCapabilities, AiAdapterContext, AiTextResult, AiDocAnalysis } from './types'
import { AiNotConfiguredError } from './types'

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = 'gemini-2.0-flash'
const DEFAULT_TIMEOUT = 30000

export class GeminiAdapter extends BaseAiAdapter {
  readonly kind: AiProviderKind = 'GEMINI'
  readonly capabilities: AiCapabilities = { text: true, summarize: true, document: true, image: false, structured: true }

  isReady(ctx: AiAdapterContext): boolean {
    return !!ctx.apiKey && ctx.apiKey.trim().length > 0
  }

  private base(ctx: AiAdapterContext): string {
    return (ctx.baseUrl?.trim() || DEFAULT_BASE).replace(/\/$/, '')
  }

  private requireKey(ctx: AiAdapterContext): string {
    const key = ctx.apiKey?.trim()
    if (!key) throw new AiNotConfiguredError('Gemini: chave de API ausente (defina GEMINI_API_KEY no servidor).')
    return key
  }

  // fetch com timeout; a chave vai SÓ no header (nunca na URL/log).
  private async call(ctx: AiAdapterContext, path: string, init: RequestInit): Promise<Response> {
    const key = this.requireKey(ctx)
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), ctx.timeoutMs ?? DEFAULT_TIMEOUT)
    try {
      return await fetch(`${this.base(ctx)}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key, ...(init.headers ?? {}) },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(t)
    }
  }

  async testConnection(ctx: AiAdapterContext): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await this.call(ctx, '/models', { method: 'GET' })
      if (res.ok) {
        const json = await res.json().catch(() => ({}))
        const n = Array.isArray((json as { models?: unknown[] })?.models) ? (json as { models: unknown[] }).models.length : 0
        return { ok: true, message: `Conexão com o Gemini OK${n ? ` (${n} modelos disponíveis)` : ''}.` }
      }
      if (res.status === 400 || res.status === 401 || res.status === 403) return { ok: false, message: 'Gemini recusou a chave (verifique GEMINI_API_KEY).' }
      return { ok: false, message: `Gemini respondeu HTTP ${res.status}.` }
    } catch (e) {
      const msg = e instanceof Error && e.name === 'AbortError' ? 'Timeout ao conectar no Gemini.' : 'Falha de rede ao conectar no Gemini.'
      return { ok: false, message: msg }
    }
  }

  private async generate(ctx: AiAdapterContext, prompt: string, parts?: Record<string, unknown>[]): Promise<AiTextResult> {
    const model = ctx.model?.trim() || DEFAULT_MODEL
    const allParts = parts ? [...parts, { text: prompt }] : [{ text: prompt }]
    const body = {
      contents: [{ parts: allParts }],
      generationConfig: ctx.maxTokens ? { maxOutputTokens: ctx.maxTokens } : undefined,
    }
    const res = await this.call(ctx, `/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', body: JSON.stringify(body) })
    if (!res.ok) {
      if (res.status === 400 || res.status === 401 || res.status === 403) throw new AiNotConfiguredError('Gemini: chave inválida ou sem acesso ao modelo.')
      throw new AiNotConfiguredError(`Gemini: HTTP ${res.status}.`)
    }
    const json = (await res.json().catch(() => ({}))) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
    const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
    return { text, tokenInput: json.usageMetadata?.promptTokenCount, tokenOutput: json.usageMetadata?.candidatesTokenCount }
  }

  async generateText(prompt: string, ctx: AiAdapterContext): Promise<AiTextResult> {
    return this.generate(ctx, prompt)
  }

  async summarizeText(text: string, ctx: AiAdapterContext): Promise<AiTextResult> {
    const prompt = `Resuma de forma objetiva e profissional, em português, o documento a seguir. Não invente informações; se algo estiver ilegível, diga. Texto:\n\n${text.slice(0, 12000)}`
    return this.generate(ctx, prompt)
  }

  private readonly DOC_PROMPT = `Analise este documento (português). Responda em texto corrido e objetivo: (1) tipo provável do documento; (2) resumo; (3) dados principais identificados. NÃO invente nada; se algo estiver ilegível, diga. NÃO substitui validação jurídica/contábil/financeira por um responsável humano.`

  async analyzeDocument(input: { text?: string; mimeType?: string; base64?: string }, ctx: AiAdapterContext): Promise<AiDocAnalysis> {
    const text = (input.text ?? '').trim()
    if (text) {
      const r = await this.generate(ctx, `${this.DOC_PROMPT}\n\nConteúdo:\n\n${text.slice(0, 14000)}`)
      return { summary: r.text || 'Sem resposta do modelo.', legible: true, needsHumanReview: false, note: 'Análise por IA — confira dados sensíveis manualmente.' }
    }
    // Sem texto, mas com arquivo (imagem/PDF escaneado) → multimodal.
    if (input.base64 && input.mimeType) {
      return this.analyzeImage({ base64: input.base64, mimeType: input.mimeType }, ctx)
    }
    return { summary: 'Documento sem texto legível — precisa de OCR/conferência humana.', legible: false, needsHumanReview: true }
  }

  // Multimodal: lê imagem/PDF escaneado direto (inlineData).
  async analyzeImage(input: { base64: string; mimeType: string }, ctx: AiAdapterContext): Promise<AiDocAnalysis> {
    const r = await this.generate(ctx, this.DOC_PROMPT, [{ inlineData: { mimeType: input.mimeType, data: input.base64 } }])
    const summary = r.text?.trim()
    if (!summary) return { summary: 'Não foi possível ler o documento (ilegível ou bloqueado).', legible: false, needsHumanReview: true }
    return { summary, legible: true, needsHumanReview: false, note: 'Análise por IA (visão) — confira dados sensíveis manualmente.' }
  }

  async extractStructuredData(text: string, schemaHint: string, ctx: AiAdapterContext): Promise<Record<string, unknown>> {
    const prompt = `Extraia os campos a seguir do texto e responda APENAS um JSON válido (sem markdown). Campos desejados: ${schemaHint}. Texto:\n\n${text.slice(0, 12000)}`
    const r = await this.generate(ctx, prompt)
    try {
      const clean = r.text.replace(/```json|```/g, '').trim()
      return JSON.parse(clean) as Record<string, unknown>
    } catch {
      return { _raw: r.text }
    }
  }
}
