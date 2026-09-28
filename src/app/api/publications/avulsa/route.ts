// /api/publications/avulsa — posts avulsos (fotos/vídeos da loja) no Instagram/Facebook.
//   GET  últimos posts (com resultado por conta)
//   POST { title, format, caption, media, connectionIds, mode: AGORA|AGENDAR|RASCUNHO, scheduledLocal }
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit, bad, permissions, pubAuth } from '@/lib/publications/api'
import { localToUtc, validateSchedule } from '@/lib/publications/schedule-core'
import { loadPublicationSettings } from '@/lib/publications/settings'
import { AVULSA_FORMATS, type AvulsaFormat } from '@/lib/publications/social/avulsa-core'
import { createAvulsa } from '@/lib/publications/social/avulsa'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const posts = await prisma.socialPost.findMany({ where: { tenantId: a.tenantId }, orderBy: { createdAt: 'desc' }, take: 50 })
  return NextResponse.json({ success: true, data: posts, can: await permissions(a.user) })
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const mode = b.mode === 'AGENDAR' ? 'AGENDAR' : b.mode === 'RASCUNHO' ? 'RASCUNHO' : 'AGORA'
  const a = await pubAuth(req, mode === 'RASCUNHO' ? 'marketing.publications.prepare' : 'marketing.publications.publish')
  if (a instanceof NextResponse) return a
  const format = (AVULSA_FORMATS as readonly string[]).includes(String(b.format)) ? (b.format as AvulsaFormat) : null
  if (!format) return bad('Escolha o formato.')
  let scheduledAt: Date | null = null
  if (mode === 'AGENDAR') {
    const settings = await loadPublicationSettings(a.tenantId)
    scheduledAt = typeof b.scheduledLocal === 'string' ? localToUtc(b.scheduledLocal, settings.timezone) : null
    const err = validateSchedule(scheduledAt)
    if (err) return bad(err)
  }
  try {
    const post = await createAvulsa(a.tenantId, {
      title: typeof b.title === 'string' ? b.title : undefined, format, caption: typeof b.caption === 'string' ? b.caption : '', media: b.media,
      connectionIds: Array.isArray(b.connectionIds) ? b.connectionIds.filter((x): x is string => typeof x === 'string').slice(0, 10) : [],
      scheduledAt, draft: mode === 'RASCUNHO',
    }, { id: a.user.id, name: a.user.name ?? null })
    await audit(a, mode === 'AGENDAR' ? 'SCHEDULE' : mode === 'RASCUNHO' ? 'DRAFT' : 'PUBLISH', 'SocialPost', post.id, { format, scheduledAt })
    return NextResponse.json({ success: true, data: post, message: mode === 'RASCUNHO' ? 'Rascunho salvo.' : mode === 'AGENDAR' ? 'Agendado.' : 'Na fila: publica em até 1 minuto (vídeo pode levar alguns minutos para processar).' })
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'Não foi possível salvar.')
  }
}
