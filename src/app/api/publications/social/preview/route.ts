// GET /api/publications/social/preview?vehicleId=&format=&template= — prévia da
// arte (a mesma que vai para a rede), para a loja conferir antes de publicar.
//   &photo=N  → usa a N-ª foto (quadros do Reels); &video=1 → quadro de vídeo
//   (720×1280); &end=1 → quadro final do Reels (chamada para o WhatsApp).
import { NextResponse } from 'next/server'
import { bad, pubAuth } from '@/lib/publications/api'
import { buildFor, loadVehicle } from '@/lib/publications/service'
import { isArtTemplate, isSocialFormat } from '@/lib/publications/social/formats'
import { isDesignStyle } from '@/lib/publications/social/design-styles'
import { previewArt } from '@/lib/publications/social/studio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const sp = new URL(req.url).searchParams
  const vehicleId = sp.get('vehicleId') ?? ''
  const format = sp.get('format'); const template = sp.get('template')
  if (!vehicleId || !isSocialFormat(format) || !isArtTemplate(template)) return bad('Parâmetros inválidos.')
  const v = await loadVehicle(a.tenantId, vehicleId)
  if (!v) return bad('Veículo não encontrado nesta loja.', 404)
  try {
    const p = await buildFor(a.tenantId, v, 'previa', null)
    if (!p.photos.length) return bad('O veículo não tem fotos.')
    const n = Math.max(0, Math.min(p.photos.length - 1, Number(sp.get('photo') ?? 0) || 0))
    const jpg = await previewArt(a.tenantId, vehicleId, p.photos[n], format, template, p.price, p.oldPrice, { forVideo: sp.get('video') === '1', endCard: sp.get('end') === '1', design: isDesignStyle(sp.get('design')) ? (sp.get('design') as never) : null })
    return new NextResponse(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=60' } })
  } catch (e) {
    console.error('[social/preview]', e)
    return bad('Não foi possível gerar a prévia.', 500)
  }
}
