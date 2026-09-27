// POST /api/publications/social/caption — legenda para Instagram/Facebook
// { vehicleId, format, tone } → { text, source, ai } (IA configurada ou modelo).
import { NextResponse } from 'next/server'
import { bad, pubAuth } from '@/lib/publications/api'
import { generateCaption } from '@/lib/publications/social/caption'
import { CAPTION_TONES, type CaptionTone } from '@/lib/publications/social/caption-core'
import { isSocialFormat } from '@/lib/publications/social/formats'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as { vehicleId?: unknown; format?: unknown; tone?: unknown }
  if (typeof b.vehicleId !== 'string') return bad('Informe o veículo.')
  const format = isSocialFormat(b.format) ? b.format : 'POST'
  const tone: CaptionTone = (CAPTION_TONES as readonly string[]).includes(String(b.tone)) ? (b.tone as CaptionTone) : 'VENDEDOR'
  try {
    return NextResponse.json({ success: true, ...(await generateCaption(a.tenantId, b.vehicleId, format, tone)) })
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'Não foi possível gerar a legenda.')
  }
}
