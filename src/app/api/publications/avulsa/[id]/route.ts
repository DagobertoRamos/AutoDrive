// DELETE /api/publications/avulsa/<id> — exclui um post avulso:
//   rascunho/agendado → cancelado (sai da fila); com erro/cancelado → apagado.
//   O que já foi para as redes é apagado na própria rede.
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
  const post = await prisma.socialPost.findFirst({ where: { id, tenantId: a.tenantId }, select: { status: true, media: true } })
  if (!post) return bad('Post não encontrado.', 404)
  if (post.status === 'RASCUNHO' || post.status === 'AGENDADO') {
    const r = await prisma.socialPost.updateMany({ where: { id, tenantId: a.tenantId, status: { in: ['RASCUNHO', 'AGENDADO'] } }, data: { status: 'CANCELADO' } })
    if (!r.count) return bad('O post acabou de ir para a fila; atualize a tela.', 409)
  } else if (post.status === 'FALHA' || post.status === 'CANCELADO') {
    await prisma.socialPost.delete({ where: { id } })
  } else {
    return bad('Este post já foi para as redes: apague-o no próprio Instagram/Facebook.', 409)
  }
  await deleteVideoParts(a.tenantId, sanitizeMedia(post.media))
  await audit(a, 'CANCEL', 'SocialPost', id, { status: post.status })
  return NextResponse.json({ success: true })
}
