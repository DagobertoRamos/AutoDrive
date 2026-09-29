// GET /api/publications/resume?ids=<publicationIds> — "Retomar" do Painel:
// remonta o estado da Nova publicação a partir dos rascunhos salvos (veículos,
// contas, campanha, formatos, modelo da arte, música e legenda de cada formato),
// para continuar exatamente de onde parou (etapa Revisão).
import { isDesignStyle, isVideoSeconds } from '@/lib/publications/social/design-styles'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { bad, pubAuth } from '@/lib/publications/api'
import { isArtTemplate, isSocialFormat, SOCIAL_FORMATS, type SocialFormat } from '@/lib/publications/social/formats'
import { musicOf } from '@/lib/publications/social/music-core'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter((x) => /^[\w-]{8,40}$/.test(x)).slice(0, 60)
  if (!ids.length) return bad('Nada para retomar.')
  const pubs = await prisma.publication.findMany({ where: { tenantId: a.tenantId, id: { in: ids } }, select: { vehicleId: true, connectionId: true, campaignKey: true, overrides: true } })
  if (!pubs.length) return bad('Esses rascunhos não existem mais (rascunhos são apagados após 2 dias).', 404)
  const formats = new Set<SocialFormat>()
  const captions: Record<string, string> = {}
  let template: string | null = null
  let design: string | null = null
  let seconds: number | null = null
  let music: unknown = undefined
  let campaign = 'principal'
  for (const p of pubs) {
    const o = (p.overrides ?? {}) as { social?: { format?: unknown; template?: unknown; music?: unknown; design?: unknown; seconds?: unknown }; caption?: unknown }
    const f = o.social?.format
    if (isSocialFormat(f)) {
      formats.add(f)
      if (isArtTemplate(o.social?.template)) template = o.social.template
      if (isDesignStyle(o.social?.design)) design = o.social.design
      if (isVideoSeconds(o.social?.seconds)) seconds = Number(o.social.seconds)
      if (music === undefined) music = o.social && 'music' in o.social ? musicOf(o.social.music) : null
      if (typeof o.caption === 'string' && o.caption.trim()) captions[`${p.vehicleId}:${f}`] = o.caption
    } else if (p.campaignKey !== 'principal') campaign = p.campaignKey
  }
  return NextResponse.json({
    success: true,
    data: {
      step: 5,
      selected: [...new Set(pubs.map((p) => p.vehicleId))],
      targets: [...new Set(pubs.map((p) => p.connectionId).filter(Boolean))],
      campaign,
      social: { ...(formats.size ? { formats: SOCIAL_FORMATS.filter((f) => formats.has(f)) } : {}), ...(template ? { template } : {}), ...(design ? { design } : {}), ...(seconds ? { seconds } : {}), ...(music !== undefined ? { music } : {}), captions },
    },
  })
}
