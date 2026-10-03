// GET /api/publications/avulsa/<id>/download?i=<n> — arquivo original da mídia
// n do post (vídeo/foto) para baixar e postar fora. Sem ?i: lista as mídias
// e a legenda.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { bad, pubAuth } from '@/lib/publications/api'
import { avulsaMediaFile } from '@/lib/publications/social/avulsa'
import { plainCaption, sanitizeMedia } from '@/lib/publications/social/avulsa-core'
import { streamBytes } from '@/lib/http/stream-bytes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const { id } = await ctx.params
  const post = await prisma.socialPost.findFirst({ where: { id, tenantId: a.tenantId }, select: { title: true, caption: true, media: true } })
  if (!post) return bad('Post não encontrado.', 404)
  const media = sanitizeMedia(post.media).filter((m) => m.type !== 'link')
  const i = new URL(req.url).searchParams.get('i')
  if (i == null) {
    return NextResponse.json({ success: true, data: { caption: plainCaption(post.caption ?? ''), files: media.map((m, n) => ({ index: n, type: m.type })) } })
  }
  const m = media[Number(i)]
  if (!m) return bad('Mídia não encontrada.', 404)
  const f = await avulsaMediaFile(a.tenantId, m)
  if (!f) return bad('Este arquivo não está mais guardado.', 410)
  if ('redirect' in f) return NextResponse.redirect(f.redirect)
  const base = (post.title || 'post').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'post'
  return new NextResponse(streamBytes(f.bytes), {
    headers: {
      'Content-Type': f.mime,
      'Content-Length': String(f.bytes.length),
      'Content-Disposition': `attachment; filename="${base}-${Number(i) + 1}.${f.ext}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
