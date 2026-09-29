// GET /api/publications/package/<vehicleId>/photo?i=N&treat=1&brand=DISCRETO|COMPLETO
import { NextResponse } from 'next/server'
import { bad, pubAuth } from '@/lib/publications/api'
import { packagePhoto } from '@/lib/publications/package'
import { isBrandMark } from '@/lib/publications/social/avulsa-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: Request, ctx: { params: Promise<{ vehicleId: string }> }) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const sp = new URL(req.url).searchParams
  const brand = sp.get('brand')
  try {
    const jpg = await packagePhoto(a.tenantId, (await ctx.params).vehicleId, Number(sp.get('i') ?? 0) || 0, { treat: sp.get('treat') === '1', brand: isBrandMark(brand) ? brand : null })
    return new NextResponse(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(jpg.length), 'Cache-Control': 'private, no-store' } })
  } catch (e) { return bad((e as Error).message, 400) }
}
