// =============================================================================
// Site da loja — logo do rodapé escuro gerada no servidor a partir da logo
// enviada (vale para toda loja, inclusive as antigas, sem reenviar nada).
// O plano vem dos pixels (theme-core.footerLogoPlan): original, versão branca,
// cartão branco ou como está. Resultado determinístico → cache imutável.
// =============================================================================

import { parseHex } from './brand-core'
import { footerLogoPlan, toWhiteMono, type FooterLogoPlan } from './theme-core'

export async function renderFooterLogo(input: Uint8Array, bgHex: string): Promise<{ body: Uint8Array<ArrayBuffer>; plan: FooterLogoPlan } | null> {
  try {
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length)
    const plan = footerLogoPlan(px, parseHex(`#${bgHex}`))
    const raw = { raw: { width: info.width, height: info.height, channels: 4 as const } }
    let out: Buffer
    if (plan === 'mono') {
      const copy = new Uint8ClampedArray(px)
      toWhiteMono(copy)
      out = await sharp(Buffer.from(copy.buffer), raw).png().toBuffer()
    } else if (plan === 'card') {
      const pad = Math.max(8, Math.round(Math.min(info.width, info.height) * 0.12))
      const w = info.width + pad * 2, h = info.height + pad * 2
      const r = Math.round(Math.min(w, h) * 0.14)
      const card = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`)
      out = await sharp(card).composite([{ input: await sharp(Buffer.from(px.buffer, px.byteOffset, px.length), raw).png().toBuffer(), left: pad, top: pad }]).png().toBuffer()
    } else {
      return { body: new Uint8Array(input), plan }
    }
    return { body: new Uint8Array(out), plan }
  } catch (e) {
    console.warn('[site/footer-logo]', e instanceof Error ? e.message : e)
    return null
  }
}
