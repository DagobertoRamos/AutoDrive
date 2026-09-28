// GET /api/publications/avulsa/video?u=<uploadId>&n=<partes>&s=<tamanho> —
// toca na prévia o vídeo enviado em pedaços (rascunho/agendado), sem juntar o
// arquivo: responde por faixas (Range), um pedaço por vez (limite da Vercel).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pubAuth } from '@/lib/publications/api'
import { PART_BYTES } from '@/lib/publications/social/avulsa-core'
import { VIDEO_PART_KIND } from '@/lib/publications/social/avulsa'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const sp = new URL(req.url).searchParams
  const u = sp.get('u') ?? ''
  const size = Number(sp.get('s'))
  if (!/^[\w-]{8,64}$/.test(u) || !Number.isFinite(size) || size <= 0) return new NextResponse('Parâmetros inválidos.', { status: 400 })
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.get('range') ?? '')
  const start = m ? Math.min(Number(m[1]), size - 1) : 0
  const index = Math.floor(start / PART_BYTES)
  const rows = await prisma.$queryRaw<{ b64: string }[]>`SELECT encode(data, 'base64') AS b64 FROM site_assets WHERE "tenantId" = ${a.tenantId} AND kind = ${VIDEO_PART_KIND} AND sha256 = ${`${u}:${index}`} LIMIT 1`
  if (!rows[0]) return new NextResponse('Vídeo não encontrado (já publicado ou apagado).', { status: 404 })
  const part = Buffer.from(rows[0].b64, 'base64')
  const partStart = index * PART_BYTES
  const want = m?.[2] ? Number(m[2]) : size - 1
  const end = Math.min(want, partStart + part.length - 1)
  const body = part.subarray(start - partStart, end - partStart + 1)
  return new NextResponse(new Uint8Array(body), {
    status: 206,
    headers: { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(body.length), 'Cache-Control': 'private, max-age=300' },
  })
}
