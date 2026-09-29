// POST /api/publications/package/<vehicleId>/video { template?, music? } — gera o
// vídeo vertical do carro (≈30–60 s) e devolve o id para baixar em partes.
import { NextResponse } from 'next/server'
import { bad, pubAuth } from '@/lib/publications/api'
import { packageVideo } from '@/lib/publications/package'
import { isArtTemplate } from '@/lib/publications/social/formats'
import { musicOf } from '@/lib/publications/social/music-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: Request, ctx: { params: Promise<{ vehicleId: string }> }) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as { template?: unknown; music?: unknown }
  try {
    const r = await packageVideo(a.tenantId, (await ctx.params).vehicleId, { template: isArtTemplate(b.template) ? b.template : 'OFERTA', music: musicOf(b.music) })
    return NextResponse.json({ success: true, ...r })
  } catch (e) { return bad((e as Error).message, 400) }
}
