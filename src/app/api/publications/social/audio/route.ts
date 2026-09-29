// GET /api/publications/social/audio?id=<audio_id>&t=<título> — toca na prévia
// a faixa da biblioteca do Instagram escolhida (o link da Meta expira e não
// abre direto no navegador; o servidor busca um link novo e entrega o áudio).
import { NextResponse } from 'next/server'
import { bad, pubAuth } from '@/lib/publications/api'
import { igTrackAudio } from '@/lib/publications/social/music'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const sp = new URL(req.url).searchParams
  const id = sp.get('id') ?? ''
  if (!/^[\w-]{1,64}$/.test(id)) return bad('Faixa inválida.')
  const audio = await igTrackAudio(a.tenantId, id, (sp.get('t') ?? '').slice(0, 120))
  if (!audio) return bad('Não foi possível tocar esta faixa agora.', 404)
  return new NextResponse(new Uint8Array(audio.bytes), { headers: { 'Content-Type': audio.type, 'Content-Length': String(audio.bytes.length), 'Cache-Control': 'private, max-age=1800' } })
}
