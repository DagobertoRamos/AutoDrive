// POST /api/publications/avulsa/<id>/retry — "Tentar de novo": volta para a
// fila só as redes que falharam (o que já foi publicado não é reenviado).
import { NextResponse } from 'next/server'
import { audit, bad, pubAuth } from '@/lib/publications/api'
import { retryAvulsa } from '@/lib/publications/social/avulsa'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await pubAuth(req, 'marketing.publications.publish')
  if (a instanceof NextResponse) return a
  const { id } = await ctx.params
  const r = await retryAvulsa(a.tenantId, id)
  if (!r.ok) return bad(r.error, 409)
  await audit(a, 'RETRY', 'SocialPost', id, { channels: r.channels })
  return NextResponse.json({ success: true, data: r })
}
