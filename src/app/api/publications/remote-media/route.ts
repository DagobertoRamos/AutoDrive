// POST /api/publications/remote-media — "Ver como ficou": busca na rede a
// mídia REAL publicada (vídeo tocável, fotos do carrossel, legenda e link).
//   { publicationId } ou { socialPostId, connectionId }
// Story com mais de 24 h some da rede: responde { data: null } e a tela remonta.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { bad, pubAuth } from '@/lib/publications/api'
import { connectorContext } from '@/lib/publications/worker'
import { remoteMedia } from '@/lib/publications/connectors/meta'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  let connectionId: string | null = null
  let remoteId: string | null = null
  if (typeof b.publicationId === 'string') {
    const p = await prisma.publication.findFirst({ where: { id: b.publicationId, tenantId: a.tenantId }, select: { connectionId: true, remoteId: true } })
    connectionId = p?.connectionId ?? null; remoteId = p?.remoteId ?? null
  } else if (typeof b.socialPostId === 'string' && typeof b.connectionId === 'string') {
    const p = await prisma.socialPost.findFirst({ where: { id: b.socialPostId, tenantId: a.tenantId }, select: { results: true } })
    const r = (p?.results as Record<string, { remoteId?: string }> | null)?.[b.connectionId]
    connectionId = b.connectionId; remoteId = r?.remoteId ?? null
  } else return bad('Parâmetros inválidos.')
  if (!connectionId || !remoteId) return NextResponse.json({ success: true, data: null, reason: 'Ainda não publicado.' })
  const conn = await prisma.publicationConnection.findFirst({ where: { id: connectionId, tenantId: a.tenantId } })
  if (!conn || (conn.channel !== 'INSTAGRAM' && conn.channel !== 'META_PAGE')) return NextResponse.json({ success: true, data: null, reason: 'Canal sem prévia da rede.' })
  try {
    const data = await remoteMedia(await connectorContext(conn, {}), conn.channel, remoteId)
    return NextResponse.json({ success: true, data, network: conn.channel === 'INSTAGRAM' ? 'INSTAGRAM' : 'FACEBOOK', account: conn.label, reason: data ? null : 'A rede não devolveu a mídia (Story some depois de 24 h).' })
  } catch (e) {
    return NextResponse.json({ success: true, data: null, reason: `A rede não devolveu o post: ${(e as Error).message}` })
  }
}
