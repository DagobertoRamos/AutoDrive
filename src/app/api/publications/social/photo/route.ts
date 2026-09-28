// GET /api/publications/social/photo?vehicleId=&photo=N — a N-ª foto do carro
// como vai para a rede (tratada quando a loja deixa ligado), para a prévia.
import { NextResponse } from 'next/server'
import { bad, pubAuth } from '@/lib/publications/api'
import { buildFor, loadVehicle } from '@/lib/publications/service'
import { renderVariant } from '@/lib/publications/media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const ASSET = /\/api\/site\/assets\/([a-z0-9]{10,40})/i

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const sp = new URL(req.url).searchParams
  const v = await loadVehicle(a.tenantId, sp.get('vehicleId') ?? '')
  if (!v) return bad('Veículo não encontrado nesta loja.', 404)
  try {
    const p = await buildFor(a.tenantId, v, 'previa', null)
    const url = p.photos[Math.max(0, Math.min(p.photos.length - 1, Number(sp.get('photo') ?? 0) || 0))]
    if (!url) return bad('O veículo não tem fotos.')
    const m = ASSET.exec(url)
    const jpg = await renderVariant({ t: a.tenantId, ...(m ? { a: m[1] } : { u: url }), w: 1080 })
    return new NextResponse(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=60' } })
  } catch (e) {
    console.error('[social/photo]', e)
    return bad('Não foi possível abrir a foto.', 500)
  }
}
