// GET /api/integrations/publications/media/<token>.jpg|.mp4 — mídia para os canais.
// Pública, mas só com link ASSINADO (HMAC, validade) gerado pelo AutoDrive:
// não dá para listar nem trocar a foto; foto de lead nunca é servida.
//   .jpg sem arte → variante JPEG da foto; .jpg com arte → arte do estúdio
//   social desenhada na hora; .mp4 → vídeo do Reels já gerado.
import { NextResponse } from 'next/server'
import { verifyMedia } from '@/lib/publications/media-token'
import { MediaNotFound, renderVariant } from '@/lib/publications/media'
import { readSiteAsset } from '@/lib/site/assets'
import { artFromClaims, SOCIAL_VIDEO_KIND } from '@/lib/publications/social/studio'
import { streamBytes } from '@/lib/http/stream-bytes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HEADERS = { 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" }

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params
  const claims = verifyMedia(file.replace(/\.(jpg|mp4)$/i, ''))
  if (!claims) return new NextResponse('Link inválido ou expirado.', { status: 404 })
  try {
    if (claims.m === 'mp4') {
      const asset = await readSiteAsset(claims.a!)
      if (!asset || asset.tenantId !== claims.t || asset.kind !== SOCIAL_VIDEO_KIND) throw new MediaNotFound('Vídeo não encontrado.')
      return new NextResponse(streamBytes(new Uint8Array(asset.data)), { headers: { ...HEADERS, 'Content-Type': 'video/mp4', 'Content-Length': String(asset.data.length), 'Accept-Ranges': 'none' } })
    }
    const body = claims.x ? await artFromClaims(claims) : await renderVariant(claims)
    return new NextResponse(new Uint8Array(body), { headers: { ...HEADERS, 'Content-Type': 'image/jpeg', 'Content-Length': String(body.length) } })
  } catch (e) {
    if (e instanceof MediaNotFound) return new NextResponse('Não encontrado.', { status: 404 })
    console.error('[publications/media]', e)
    // 503: o canal tenta de novo; nunca responde uma imagem vazia.
    return new NextResponse('Indisponível no momento.', { status: 503, headers: { 'Retry-After': '60' } })
  }
}
