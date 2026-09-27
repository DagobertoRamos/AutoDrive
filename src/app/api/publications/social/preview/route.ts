// GET /api/publications/social/preview?vehicleId=&format=&template= — prévia da
// arte (a mesma que vai para a rede), para a loja conferir antes de publicar.
import { NextResponse } from 'next/server'
import { bad, pubAuth } from '@/lib/publications/api'
import { buildFor, loadVehicle } from '@/lib/publications/service'
import { isArtTemplate, isSocialFormat } from '@/lib/publications/social/formats'
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
    const jpg = await previewArt(a.tenantId, vehicleId, p.photos[0], format, template, p.price, p.oldPrice)
    return new NextResponse(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=60' } })
  } catch (e) {
    console.error('[social/preview]', e)
    return bad('Não foi possível gerar a prévia.', 500)
  }
}
