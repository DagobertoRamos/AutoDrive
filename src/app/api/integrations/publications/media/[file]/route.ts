// GET /api/integrations/publications/media/<token>.jpg — foto para os canais.
// Pública, mas só com link ASSINADO (HMAC, validade) gerado pelo AutoDrive:
// não dá para listar nem trocar a foto; foto de lead nunca é servida.
import { NextResponse } from 'next/server'
import { verifyMedia } from '@/lib/publications/media-token'
import { MediaNotFound, renderVariant } from '@/lib/publications/media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params
  const claims = verifyMedia(file.replace(/\.jpg$/i, ''))
  if (!claims) return new NextResponse('Link inválido ou expirado.', { status: 404 })
  try {
    const body = await renderVariant(claims)
    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': 'image/jpeg', 'Content-Length': String(body.length),
        'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'",
      },
    })
  } catch (e) {
    if (e instanceof MediaNotFound) return new NextResponse('Não encontrado.', { status: 404 })
    console.error('[publications/media]', e)
    // 503: o canal tenta de novo; nunca responde uma imagem vazia.
    return new NextResponse('Indisponível no momento.', { status: 503, headers: { 'Retry-After': '60' } })
  }
}
