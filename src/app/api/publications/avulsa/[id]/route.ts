// DELETE /api/publications/avulsa/<id> — cancela um post avulso ainda não publicado.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit, bad, pubAuth } from '@/lib/publications/api'
import { deleteVideoParts } from '@/lib/publications/social/avulsa'
import { sanitizeMedia } from '@/lib/publications/social/avulsa-core'

export const dynamic = 'force-dynamic'

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await pubAuth(req, 'marketing.publications.publish')
  if (a instanceof NextResponse) return a
  const { id } = await ctx.params
  const r = await prisma.socialPost.updateMany({ where: { id, tenantId: a.tenantId, status: { in: ['RASCUNHO', 'AGENDADO'] } }, data: { status: 'CANCELADO' } })
  if (!r.count) return bad('Só dá para cancelar rascunhos e agendados. O que já foi para as redes é apagado na própria rede.', 409)
  const post = await prisma.socialPost.findUnique({ where: { id }, select: { media: true } })
  if (post) await deleteVideoParts(a.tenantId, sanitizeMedia(post.media))
  await audit(a, 'CANCEL', 'SocialPost', id, {})
  return NextResponse.json({ success: true })
}
