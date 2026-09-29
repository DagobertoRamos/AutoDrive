// =============================================================================
// Textos do anúncio (servidor): descrição e condições com os dados do sistema.
// IA configurada = texto escrito pela IA com os fatos; sem IA = modelo pronto.
// =============================================================================

import { runAiWithFailover } from '@/lib/ai/resolve-ai-provider'
import { effectiveOrigin } from '@/lib/stock/origin-core'
import { fuelLabel, gearLabel } from '../content-core'
import { buildFor, loadVehicle, payloadContext } from '../service'
import { descriptionPrompt, descriptionTemplate, finishDescription, hasTerms, sanitizeTerms, SUGGESTED_TERMS, termsBlock, type DescStyle, type StoreTerms, type TextInput, type TermsStyle } from './text-core'
export { sanitizeTerms }

export async function textInput(tenantId: string, vehicleId: string): Promise<TextInput> {
  const v = await loadVehicle(tenantId, vehicleId)
  if (!v) throw new Error('Veículo não encontrado nesta loja.')
  const ctx = await payloadContext(tenantId)
  const p = await buildFor(tenantId, v, 'texto', null, ctx)
  return {
    brand: v.brand, model: v.model, version: v.version, year: v.year, modelYear: v.modelYear, km: v.km,
    gear: gearLabel(v.transmission), fuel: fuelLabel(v.fuel), color: v.color, doors: v.doors, engine: v.engine,
    price: p.price, oldPrice: p.oldPrice, options: p.options,
    origin: effectiveOrigin(v), inspected: v.cautelarStatus === 'APROVADA', isNew: p.isNew,
    storeName: p.storeName, city: p.location.city, terms: ctx.settings.terms,
    vehicleType: v.vehicleType, bodyType: v.bodyType, seed: v.id,
  }
}

export async function generateDescription(tenantId: string, vehicleId: string, style: DescStyle, useAi = true): Promise<{ text: string; ai: boolean; source: string }> {
  const i = await textInput(tenantId, vehicleId)
  if (useAi) {
    const r = await runAiWithFailover('social_caption', async (ai) => {
      if (ai.mock) throw new Error('Sem IA real configurada.')
      const out = await ai.adapter.generateText(descriptionPrompt(i, style), { ...ai.ctx, maxTokens: Math.min(ai.ctx.maxTokens ?? 1200, 1200) })
      if (!out.text?.trim()) throw new Error('A IA respondeu vazio.')
      return { text: out.text, name: ai.providerName }
    })
    if (r.ok) return { text: finishDescription(r.result.text), ai: true, source: r.result.name }
  }
  return { text: descriptionTemplate(i, style), ai: false, source: 'modelo pronto' }
}

export async function generateConditions(tenantId: string, vehicleId: string, override?: StoreTerms, style: TermsStyle = 'CONSULTIVO'): Promise<{ text: string; empty: boolean; configured: boolean; terms: StoreTerms }> {
  const i = await textInput(tenantId, vehicleId)
  const terms = override ?? i.terms
  const text = termsBlock({ terms, inspected: i.inspected, storeName: i.storeName }, style)
  return { text, empty: !text, configured: hasTerms(i.terms), terms: hasTerms(i.terms) ? i.terms : SUGGESTED_TERMS }
}
