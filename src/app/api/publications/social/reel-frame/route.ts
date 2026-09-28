// GET /api/publications/social/reel-frame?vehicleId=&template=&i=N — quadro
// parado da N-ª cena do Reels (o mesmo roteiro do vídeo), para a prévia tocável.
import { NextResponse } from 'next/server'
import { bad, pubAuth } from '@/lib/publications/api'
import { buildFor, loadVehicle } from '@/lib/publications/service'
import { isArtTemplate } from '@/lib/publications/social/formats'
import { reelPreviewFrame } from '@/lib/publications/social/studio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const sp = new URL(req.url).searchParams
  const template = sp.get('template')
  const v = await loadVehicle(a.tenantId, sp.get('vehicleId') ?? '')
  if (!v || !isArtTemplate(template)) return bad('Parâmetros inválidos.', 400)
  try {
    const p = await buildFor(a.tenantId, v, 'previa', null)
    const jpg = await reelPreviewFrame(a.tenantId, p, template, Number(sp.get('i') ?? 0) || 0)
    return new NextResponse(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=120' } })
  } catch (e) {
    console.error('[social/reel-frame]', e)
    return bad('Não foi possível gerar a cena.', 500)
  }
}
