// GET /api/publications/social/music?source=FREESOUND|IG&mood=&q= — músicas sem
// risco de direito autoral para os vídeos: Freesound só CC0 (domínio público)
// e a biblioteca oficial do Instagram (Audio API, autorizada para terceiros).
import { NextResponse } from 'next/server'
import { pubAuth } from '@/lib/publications/api'
import { freesoundKey, searchFreesound, searchIgLibrary } from '@/lib/publications/social/music'
import { MUSIC_MOODS, type MusicMood } from '@/lib/publications/social/music-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const sp = new URL(req.url).searchParams
  const source = sp.get('source') === 'IG' ? 'IG' : 'FREESOUND'
  const mood = (MUSIC_MOODS as readonly string[]).includes(sp.get('mood') ?? '') ? (sp.get('mood') as MusicMood) : 'ANIMADA'
  const q = (sp.get('q') ?? '').slice(0, 80)
  const freesoundConfigured = !!(await freesoundKey())
  if (sp.get('check') === '1') return NextResponse.json({ success: true, freesoundConfigured, tracks: [] })
  try {
    const tracks = source === 'IG' ? await searchIgLibrary(a.tenantId, q) : freesoundConfigured ? await searchFreesound({ mood, q }) : []
    return NextResponse.json({ success: true, source, freesoundConfigured, tracks })
  } catch (e) {
    return NextResponse.json({ success: true, source, freesoundConfigured, tracks: [], warning: e instanceof Error ? e.message : 'Busca indisponível.' })
  }
}
