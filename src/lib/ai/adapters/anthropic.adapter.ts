// =============================================================================
// ai/adapters/anthropic.adapter.ts — adapter Anthropic/Claude (Messages API).
// Chave em ctx.apiKey (backend), header x-api-key + anthropic-version — nunca em
// URL/log/front. isReady exige apiKey. Suporta imagem e PDF (document block).
// max_tokens é obrigatório na API (default 1024 ou ctx.maxTokens).
// =============================================================================

import type { AiProviderKind } from '@prisma/client'
import { BaseAiAdapter } from './base'
import type { AiCapabilities, AiAdapterContext, AiTextResult, AiDocAnalysis } from './types'
import { AiNotConfiguredError } from './types'

const DEFAULT_BASE = 'https://api.anthropic.com/v1'
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_TIMEOUT = 30000
const API_VERSION = '2023-06-01'

type Block = Record<string, unknown>

export class AnthropicAdapter extends BaseAiAdapter {
  readonly kind: AiProviderKind = 'ANTHROPIC'
  readonly capabilities: AiCapabilities = { text: true, summarize: true, document: true, image: true, structured: true }

  isReady(ctx: AiAdapterContext): boolean { return !!ctx.apiKey && ctx.apiKey.trim().length > 0 }

  private base(ctx: AiAdapterContext): string { return (ctx.baseUrl?.trim() || DEFAULT_BASE).replace(/\/$/, '') }
  private requireKey(ctx: AiAdapterContext): string {
    const k = ctx.apiKey?.trim(); if (!k) throw new AiNotConfiguredError('Anthropic: chave de API ausente.'); return k
  }

  private async call(ctx: AiAdapterContext, path: string, init: RequestInit): Promise<Response> {
    const key = this.requireKey(ctx)
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), ctx.timeoutMs ?? DEFAULT_TIMEOUT)
    try {
      return await fetch(`${this.base(ctx)}${path}`, { ...init, headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': API_VERSION, ...(init.headers ?? {}) }, signal: controller.signal })
    } finally { clearTimeout(t) }
  }

  async testConnection(ctx: AiAdapterContext): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await this.call(ctx, '/models', { method: 'GET' })
      if (res.ok) return { ok: true, message: 'Conexão com o Claude (Anthropic) OK.' }
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'Anthropic recusou a chave (verifique ANTHROPIC_API_KEY).' }
      if (res.status === 429) return { ok: false, message: 'Anthropic: limite/cota atingido.' }
      return { ok: false, message: `Anthropic respondeu HTTP ${res.status}.` }
    } catch (e) {
      return { ok: false, message: e instanceof Error && e.name === 'AbortError' ? 'Timeout ao conectar no Claude.' : 'Falha de rede ao conectar no Claude.' }
    }
  }

  private async message(ctx: AiAdapterContext, content: string | Block[]): Promise<AiTextResult> {
    const model = ctx.model?.trim() || DEFAULT_MODEL
    const body = { model, max_tokens: ctx.maxTokens ?? 1024, messages: [{ role: 'user', content }] }
    const res = await this.call(ctx, '/messages', { method: 'POST', body: JSON.stringify(body) })
    if (!res.ok) {
      if (res.status === 429) throw new AiNotConfiguredError('Anthropic: limite/cota atingido (429)')
      if (res.status === 401 || res.status === 403) throw new AiNotConfiguredError('Anthropic: chave inválida ou sem acesso')
      if (res.status === 404) throw new AiNotConfiguredError(`Anthropic: modelo "${model}" indisponível`)
      throw new AiNotConfiguredError(`Anthropic: HTTP ${res.status}`)
    }
    const json = (await res.json().catch(() => ({}))) as { content?: { type?: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } }
    const text = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim()
    return { text, tokenInput: json.usage?.input_tokens, tokenOutput: json.usage?.output_tokens }
  }

  async generateText(prompt: string, ctx: AiAdapterContext): Promise<AiTextResult> { return this.message(ctx, prompt) }
  async summarizeText(text: string, ctx: AiAdapterContext): Promise<AiTextResult> {
    return this.message(ctx, `Resuma de forma objetiva e profissional, em português, sem inventar. Texto:\n\n${text.slice(0, 14000)}`)
  }

  private readonly DOC_PROMPT = 'Analise este documento (português): (1) tipo provável; (2) resumo; (3) dados principais. Não invente; aponte se ilegível. Não substitui validação humana.'

  async analyzeDocument(input: { text?: string; mimeType?: string; base64?: string }, ctx: AiAdapterContext): Promise<AiDocAnalysis> {
    const text = (input.text ?? '').trim()
    if (text) {
      const r = await this.message(ctx, `${this.DOC_PROMPT}\n\nConteúdo:\n\n${text.slice(0, 14000)}`)
      return { summary: r.text || 'Sem resposta.', legible: true, needsHumanReview: false, note: 'Análise por IA — confira dados sensíveis.' }
    }
    if (input.base64 && input.mimeType) return this.analyzeImage({ base64: input.base64, mimeType: input.mimeType }, ctx)
    return { summary: 'Documento sem texto legível — precisa de OCR/conferência humana.', legible: false, needsHumanReview: true }
  }

  async analyzeImage(input: { base64: string; mimeType: string }, ctx: AiAdapterContext): Promise<AiDocAnalysis> {
    const isPdf = input.mimeType === 'application/pdf'
    const fileBlock: Block = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: input.mimeType, data: input.base64 } }
    const r = await this.message(ctx, [fileBlock, { type: 'text', text: this.DOC_PROMPT }])
    const summary = r.text?.trim()
    if (!summary) return { summary: 'Não foi possível ler o documento.', legible: false, needsHumanReview: true }
    return { summary, legible: true, needsHumanReview: false, note: 'Análise por IA (visão) — confira dados sensíveis.' }
  }

  async extractStructuredData(text: string, schemaHint: string, ctx: AiAdapterContext): Promise<Record<string, unknown>> {
    const r = await this.message(ctx, `Extraia os campos (${schemaHint}) e responda APENAS JSON válido (sem markdown). Texto:\n\n${text.slice(0, 14000)}`)
    try { return JSON.parse(r.text.replace(/```json|```/g, '').trim()) as Record<string, unknown> } catch { return { _raw: r.text } }
  }
}
