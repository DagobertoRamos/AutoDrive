// GET /api/integrations/foto?u=<url>&w=<320|640|1280> — foto de parceiro servida
// pelo app (ver lib/partner-photo). Pública (site e painel), mas só para os hosts
// de parceiro da lista; download com proteção SSRF e IPv4 primeiro. A resposta
// fica na CDN da Vercel: as URLs dos parceiros não mudam de conteúdo.
import { NextResponse } from 'next/server'
import { isPartnerPhotoUrl, snapPhotoWidth } from '@/lib/partner-photo'
import { fetchImageSafely } from '@/lib/publications/safe-fetch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BASE = { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" }
const CACHE_OK = 'public, max-age=604800, s-maxage=31536000, immutable'

function fail(status: number, msg: string, cacheSeconds: number) {
  return new NextResponse(msg, { status, headers: { ...BASE, 'Cache-Control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}` } })
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const url = sp.get('u') ?? ''
  if (!isPartnerPhotoUrl(url)) return fail(400, 'Endereço não permitido.', 86400)
  const w = snapPhotoWidth(Number(sp.get('w')))
  let img
  try {
    img = await fetchImageSafely(url, { timeoutMs: 12_000, maxBytes: 20 * 1024 * 1024 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    // Foto apagada no parceiro: a tela cai na imagem padrão. Cache curto, pois
    // o parceiro pode voltar a publicar no mesmo endereço.
    if (/HTTP (403|404|410)/.test(msg)) return fail(404, 'Foto não encontrada no parceiro.', 3600)
    console.error('[foto-parceiro]', url, msg)
    return fail(504, 'Parceiro não respondeu.', 60)
  }
  let body: Buffer = img.bytes
  let type = img.contentType
  if (w) {
    try {
      const sharp = (await import('sharp')).default
      body = await sharp(img.bytes).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
      type = 'image/webp'
    } catch { /* formato que o sharp não lê: entrega o original */ }
  }
  return new NextResponse(new Uint8Array(body), { headers: { ...BASE, 'Content-Type': type, 'Content-Length': String(body.length), 'Cache-Control': CACHE_OK } })
}
