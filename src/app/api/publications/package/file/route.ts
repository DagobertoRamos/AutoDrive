// GET /api/publications/package/file?asset=<id> — baixa o vídeo gerado em
// partes (Range, até 3 MB por resposta: limite do servidor).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { bad, pubAuth } from '@/lib/publications/api'
import { SOCIAL_VIDEO_KIND } from '@/lib/publications/social/studio'

export const dynamic = 'force-dynamic'
const CHUNK = 3_000_000

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const id = new URL(req.url).searchParams.get('asset') ?? ''
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return bad('Arquivo inválido.')
  const meta = await prisma.siteAsset.findFirst({ where: { id, tenantId: a.tenantId, kind: SOCIAL_VIDEO_KIND }, select: { fileSize: true } })
  if (!meta) return bad('Vídeo não encontrado.', 404)
  const size = meta.fileSize
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.get('range') ?? '')
  const start = m ? Math.min(Number(m[1]), size - 1) : 0
  const end = Math.min(m?.[2] ? Number(m[2]) : size - 1, start + CHUNK - 1, size - 1)
  const rows = await prisma.$queryRaw<{ b64: string }[]>`SELECT encode(substring(data from ${start + 1}::int for ${end - start + 1}::int), 'base64') AS b64 FROM site_assets WHERE id = ${id} LIMIT 1`
  const body = Buffer.from(rows[0]?.b64 ?? '', 'base64')
  return new NextResponse(new Uint8Array(body), { status: 206, headers: { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${start + body.length - 1}/${size}`, 'Content-Length': String(body.length), 'Cache-Control': 'private, no-store' } })
}
