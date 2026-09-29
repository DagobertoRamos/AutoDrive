// POST /api/publications/social/post-preview — como o post do Estúdio vai
// aparecer: legenda FINAL do canal (a mesma que vai ser enviada) e as mídias
// (arte, fotos do carrossel, primeiro quadro do Reels, vídeo do carro).
// { vehicleId, connectionId, format, template, music?, caption? }
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { bad, pubAuth } from '@/lib/publications/api'
import { channelSpec } from '@/lib/publications/channels'
import { channelText } from '@/lib/publications/content-core'
import { buildFor, loadVehicle } from '@/lib/publications/service'
import { isArtTemplate, isSocialFormat } from '@/lib/publications/social/formats'
import { musicOf, musicPlan, MOOD_LABEL } from '@/lib/publications/social/music-core'
import { previewAudio } from '@/lib/publications/social/music'
import { reelPlanFor } from '@/lib/publications/social/studio'
import { classifyVideo } from '@/lib/publications/social/video-core'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (typeof b.vehicleId !== 'string' || typeof b.connectionId !== 'string' || !isSocialFormat(b.format)) return bad('Parâmetros inválidos.')
  const template = isArtTemplate(b.template) ? b.template : 'OFERTA'
  const music = musicOf(b.music)
  const [v, conn] = await Promise.all([
    loadVehicle(a.tenantId, b.vehicleId),
    prisma.publicationConnection.findFirst({ where: { id: b.connectionId, tenantId: a.tenantId }, select: { channel: true, label: true } }),
  ])
  if (!v || !conn) return bad('Veículo ou conta não encontrados nesta loja.', 404)
  const spec = channelSpec(conn.channel)
  if (!spec) return bad('Canal desconhecido.')
  const overrides = { social: { format: b.format, template, ...(music ? { music } : {}) }, ...(typeof b.caption === 'string' && b.caption.trim() ? { caption: b.caption.trim().slice(0, 2200) } : {}) }
  const p = await buildFor(a.tenantId, v, 'previa', overrides)
  const art = (format: string, extra: Record<string, string> = {}, tpl: string = template) => `/api/publications/social/preview?${new URLSearchParams({ vehicleId: v.id, format, template: tpl, ...extra })}`
  const format = b.format
  const network = conn.channel === 'INSTAGRAM' ? 'INSTAGRAM' : 'FACEBOOK'
  const plan = musicPlan(music, conn.channel, format)
  // Com música, Post e Story viram vídeo curto da arte (a prévia toca como vídeo).
  const clip = !!plan && (format === 'STORY' || format === 'POST')
  let slides: number[] | null = null
  let media: Array<{ type: 'image' | 'video'; url: string; note?: string }>
  if (format === 'REELS') {
    // As mesmas cenas do vídeo (gancho, fotos com a informação, preço, chamada), no mesmo tempo.
    const segs = reelPlanFor(p, template)
    media = segs.map((_, k) => ({ type: 'image' as const, url: `/api/publications/social/reel-frame?${new URLSearchParams({ vehicleId: v.id, template, i: String(k) })}` }))
    slides = segs.map((sg) => sg.seconds)
  } else if (format === 'POST') {
    media = [{ type: 'image', url: art('POST') }]
    if (clip) slides = [12]
  } else if (format === 'CARROSSEL') {
    media = [{ type: 'image', url: art('CARROSSEL'), ...(plan && network === 'INSTAGRAM' ? { note: 'Capa em vídeo com a música' } : {}) }, ...p.photos.slice(1, 10).map((_, k) => ({ type: 'image' as const, url: `/api/publications/social/photo?${new URLSearchParams({ vehicleId: v.id, photo: String(k + 1) })}` }))]
  } else if (format === 'STORY') {
    media = [{ type: 'image', url: art('STORY') }]
    slides = [clip ? 10 : 5]
  } else {
    const vid = classifyVideo(p.videoUrl)
    media = vid?.siteUrl && /\.(mp4|webm)|raw=1/i.test(vid.siteUrl) ? [{ type: 'video', url: vid.siteUrl }] : [{ type: 'image', url: p.photos[0] ?? art('REELS'), note: vid ? `Vídeo do carro (${vid.label})` : 'Carro sem vídeo cadastrado' }]
  }
  const caption = format === 'STORY' ? '' : channelText(p, spec).description
  const musicLabel = !music || format === 'VIDEO' ? null : music.mode === 'TRACK' ? `${music.title ?? 'Faixa escolhida'}${music.artist ? ` · ${music.artist}` : ''}` : `Música automática · ${MOOD_LABEL[music.mood]}`
  // Carrossel no Facebook é álbum de fotos: sem música.
  const audio = format === 'CARROSSEL' && network === 'FACEBOOK' ? null : await previewAudio(music, conn.channel, format, v.id)
  return NextResponse.json({ success: true, network, account: conn.label, format, media, caption, music: audio ? `${audio.title}${audio.artist ? ` · ${audio.artist}` : ''}` : musicLabel, audio, slides, musicNote: audio?.note ?? null })
}
