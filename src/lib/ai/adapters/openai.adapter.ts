// =============================================================================
// ai/adapters/openai.adapter.ts — adapter OpenAI (Chat Completions).
// A chave vem em ctx.apiKey (backend), enviada via header Authorization: Bearer
// — nunca em URL/log/front. isReady exige apiKey. Erros amigáveis (429/401/404).
// Visão (imagem) suportada; PDF não é aceito como image_url (cai no failover).
// =============================================================================

import type { AiProviderKind } from '@prisma/client'
import { BaseAiAdapter } from './base'
import type { AiCapabilities, AiAdapterContext, AiTextResult, AiDocAnalysis } from './types'
import { AiNotConfiguredError } from './types'

const DEFAULT_BASE = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'
const DEFAULT_TIMEOUT = 30000

type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

export class OpenAIAdapter extends BaseAiAdapter {
  readonly kind: AiProviderKind = 'OPENAI'
  readonly capabilities: AiCapabilities = { text: true, summarize: true, document: true, image: true, structured: true }

  isReady(ctx: AiAdapterContext): boolean { return !!ctx.apiKey && ctx.apiKey.trim().length > 0 }

  private base(ctx: AiAdapterContext): string { return (ctx.baseUrl?.trim() || DEFAULT_BASE).replace(/\/$/, '') }
  private requireKey(ctx: AiAdapterContext): string {
    const k = ctx.apiKey?.trim(); if (!k) throw new AiNotConfiguredError('OpenAI: chave de API ausente.'); return k
  }

  private async call(ctx: AiAdapterContext, path: string, init: RequestInit): Promise<Response> {
    const key = this.requireKey(ctx)
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), ctx.timeoutMs ?? DEFAULT_TIMEOUT)
    try {
      return await fetch(`${this.base(ctx)}${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...(init.headers ?? {}) }, signal: controller.signal })
    } finally { clearTimeout(t) }
  }

  async testConnection(ctx: AiAdapterContext): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await this.call(ctx, '/models', { method: 'GET' })
      if (res.ok) return { ok: true, message: 'Conexão com a OpenAI OK.' }
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'OpenAI recusou a chave (verifique OPENAI_API_KEY).' }
      if (res.status === 429) return { ok: false, message: 'OpenAI: limite/cota atingido.' }
      return { ok: false, message: `OpenAI respondeu HTTP ${res.status}.` }
    } catch (e) {
      return { ok: false, message: e instanceof Error && e.name === 'AbortError' ? 'Timeout ao conectar na OpenAI.' : 'Falha de rede ao conectar na OpenAI.' }
    }
  }

  private async chat(ctx: AiAdapterContext, content: string | Part[]): Promise<AiTextResult> {
    const model = ctx.model?.trim() || DEFAULT_MODEL
    const body: Record<string, unknown> = { model, messages: [{ role: 'user', content }] }
    if (ctx.maxTokens) body.max_tokens = ctx.maxTokens
    const res = await this.call(ctx, '/chat/completions', { method: 'POST', body: JSON.stringify(body) })
    if (!res.ok) {
      if (res.status === 429) throw new AiNotConfiguredError('OpenAI: limite/cota atingido (429)')
      if (res.status === 401 || res.status === 403) throw new AiNotConfiguredError('OpenAI: chave inválida ou sem acesso')
      if (res.status === 404) throw new AiNotConfiguredError(`OpenAI: modelo "${model}" indisponível`)
      throw new AiNotConfiguredError(`OpenAI: HTTP ${res.status}`)
    }
    const json = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } }
    return { text: (json.choices?.[0]?.message?.content ?? '').trim(), tokenInput: json.usage?.prompt_tokens, tokenOutput: json.usage?.completion_tokens }
  }

  async generateText(prompt: string, ctx: AiAdapterContext): Promise<AiTextResult> { return this.chat(ctx, prompt) }
  async summarizeText(text: string, ctx: AiAdapterContext): Promise<AiTextResult> {
    return this.chat(ctx, `Resuma de forma objetiva e profissional, em português, sem inventar. Texto:\n\n${text.slice(0, 14000)}`)
  }

  private readonly DOC_PROMPT = 'Analise este documento (português): (1) tipo provável; (2) resumo; (3) dados principais. Não invente; aponte se ilegível. Não substitui validação humana.'

  async analyzeDocument(input: { text?: string; mimeType?: string; base64?: string }, ctx: AiAdapterContext): Promise<AiDocAnalysis> {
    const text = (input.text ?? '').trim()
    if (text) {
      const r = await this.chat(ctx, `${this.DOC_PROMPT}\n\nConteúdo:\n\n${text.slice(0, 14000)}`)
      return { summary: r.text || 'Sem resposta.', legible: true, needsHumanReview: false, note: 'Análise por IA — confira dados sensíveis.' }
    }
    if (input.base64 && input.mimeType) return this.analyzeImage({ base64: input.base64, mimeType: input.mimeType }, ctx)
    return { summary: 'Documento sem texto legível — precisa de OCR/conferência humana.', legible: false, needsHumanReview: true }
  }

  async analyzeImage(input: { base64: string; mimeType: string }, ctx: AiAdapterContext): Promise<AiDocAnalysis> {
    if (!input.mimeType.startsWith('image/')) throw new AiNotConfiguredError('OpenAI: leitura de PDF por imagem não suportada neste adapter')
    const r = await this.chat(ctx, [
      { type: 'text', text: this.DOC_PROMPT },
      { type: 'image_url', image_url: { url: `data:${input.mimeType};base64,${input.base64}` } },
    ])
    const summary = r.text?.trim()
    if (!summary) return { summary: 'Não foi possível ler a imagem.', legible: false, needsHumanReview: true }
    return { summary, legible: true, needsHumanReview: false, note: 'Análise por IA (visão) — confira dados sensíveis.' }
  }

  async extractStructuredData(text: string, schemaHint: string, ctx: AiAdapterContext): Promise<Record<string, unknown>> {
    const r = await this.chat(ctx, `Extraia os campos (${schemaHint}) e responda APENAS JSON válido (sem markdown). Texto:\n\n${text.slice(0, 14000)}`)
    try { return JSON.parse(r.text.replace(/```json|```/g, '').trim()) as Record<string, unknown> } catch { return { _raw: r.text } }
  }
}
