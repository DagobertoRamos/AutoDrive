// =============================================================================
// Tratamento automático das fotos (servidor, sharp). Plano em enhance-core.ts.
// Liga/desliga por loja em Publicações › Configurações (padrão: ligado).
// =============================================================================

import { enhancePlan, photoStats, type EnhancePlan } from './enhance-core'
import { loadPublicationSettings } from '../settings'

async function sharpLib() {
  return (await import('sharp')).default
}

/** Foto tratada em JPEG (orientação corrigida). Falhou = devolve a original. */
export async function enhancePhoto(input: Buffer): Promise<{ bytes: Buffer; plan: EnhancePlan | null }> {
  const sharp = await sharpLib()
  try {
    const sample = await sharp(input, { failOn: 'none' }).rotate().resize(96, 96, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const plan = enhancePlan(photoStats(sample.data, sample.info.channels))
    let img = sharp(input, { failOn: 'none' }).rotate().removeAlpha()
    if (plan.stretch) img = img.normalise({ lower: 1, upper: 99 })
    if (plan.clahe) img = img.clahe({ width: 64, height: 64, maxSlope: plan.clahe })
    // Curva de tons (clareia meios-tons sem estourar as luzes) + brilho, por tabela.
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
    const lut = new Uint8Array(256)
    for (let v = 0; v < 256; v++) lut[v] = Math.min(255, Math.round(255 * Math.pow(v / 255, plan.gamma) * plan.brightness))
    for (let i = 0; i < data.length; i++) data[i] = lut[data[i]]
    const bytes = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .modulate({ saturation: plan.saturation })
      .sharpen({ sigma: plan.sharpen })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer()
    return { bytes, plan }
  } catch (e) {
    console.error('[publications] tratamento da foto', (e as Error).message)
    return { bytes: input, plan: null }
  }
}

const cache = new Map<string, { on: boolean; exp: number }>()
/** Tratamento ligado nesta loja? (cache de 10 s por loja). */
export async function enhanceOn(tenantId: string): Promise<boolean> {
  const c = cache.get(tenantId)
  if (c && c.exp > Date.now()) return c.on
  const on = (await loadPublicationSettings(tenantId).catch(() => null))?.photoEnhance ?? true
  cache.set(tenantId, { on, exp: Date.now() + 10_000 })
  return on
}

/** Trata a foto se a loja deixou ligado. */
export async function maybeEnhance(tenantId: string, input: Buffer): Promise<Buffer> {
  return (await enhanceOn(tenantId)) ? (await enhancePhoto(input)).bytes : input
}
