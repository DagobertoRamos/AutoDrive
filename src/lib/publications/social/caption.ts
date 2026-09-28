// =============================================================================
// Estúdio social — gera a legenda com a IA configurada (troca de provedor
// automática). Sem IA real disponível, usa a legenda de reserva (modelo).
// =============================================================================

import { runAiWithFailover } from '@/lib/ai/resolve-ai-provider'
import { fuelLabel, gearLabel } from '../content-core'
import { autoSocialCaption, buildFor, loadVehicle, payloadContext } from '../service'
import { captionPrompt, fallbackCaption, finishCaption, type CaptionInput, type CaptionTone } from './caption-core'
import type { SocialFormat } from './formats'

export async function generateCaption(tenantId: string, vehicleId: string, format: SocialFormat, tone: CaptionTone): Promise<{ text: string; source: string; ai: boolean }> {
  const v = await loadVehicle(tenantId, vehicleId)
  if (!v) throw new Error('Veículo não encontrado nesta loja.')
  const ctx = await payloadContext(tenantId)
  const p = await buildFor(tenantId, v, 'legenda', null, ctx)
  const input: CaptionInput = {
    format, tone,
    brand: p.vehicle.brand, model: p.vehicle.model, version: p.vehicle.version, year: p.vehicle.year, modelYear: p.vehicle.modelYear, km: p.vehicle.km,
    gear: gearLabel(p.vehicle.transmission), fuel: fuelLabel(p.vehicle.fuel), color: p.vehicle.color, price: p.price, oldPrice: p.oldPrice,
    options: p.options, conditions: p.conditions, storeName: p.storeName, city: p.location.city,
    whatsapp: ctx.settings.contacts.whatsapp, instagram: ctx.settings.contacts.instagram, site: ctx.settings.contacts.site,
  }
  const r = await runAiWithFailover('social_caption', async (ai) => {
    if (ai.mock) throw new Error('Sem IA real configurada.')
    const out = await ai.adapter.generateText(captionPrompt(input), { ...ai.ctx, maxTokens: Math.min(ai.ctx.maxTokens ?? 800, 800) })
    if (!out.text?.trim()) throw new Error('A IA respondeu vazio.')
    return { text: out.text, name: ai.providerName }
  })
  if (r.ok) return { text: finishCaption(r.result.text, input), source: r.result.name, ai: true }
  if (format === 'STORY') return { text: fallbackCaption(input), source: 'modelo automático (sem IA configurada)', ai: false }
  return { text: autoSocialCaption(v, { ...p, social: { format, template: 'OFERTA' } }, ctx), source: 'modelo pronto (sem IA configurada)', ai: false }
}
