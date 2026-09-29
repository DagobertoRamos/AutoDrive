// POST /api/publications/avulsa/batch — posts avulsos EM LOTE.
// { items: [{ title?, format, caption, media }], connectionIds, startLocal? }
// Cada post ganha o seu horário pela agenda inteligente: entre 07:00 e 20:00,
// sem repetir horário com NADA da agenda (anúncios e outros avulsos), com
// intervalo por conta e dentro da quantidade segura por dia.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { audit, bad, pubAuth } from '@/lib/publications/api'
import { AVULSA_FORMATS, FACEBOOK_ONLY, type AvulsaFormat } from '@/lib/publications/social/avulsa-core'
import { createAvulsa } from '@/lib/publications/social/avulsa'
import { allocateSlots } from '@/lib/publications/social/cadence'
import type { SocialFormat } from '@/lib/publications/social/formats'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.publish')
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as { items?: unknown; connectionIds?: unknown; startLocal?: unknown }
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30) as Array<Record<string, unknown>>
  if (!items.length) return bad('Adicione ao menos um post ao lote.')
  const ids = Array.isArray(b.connectionIds) ? b.connectionIds.filter((x): x is string => typeof x === 'string').slice(0, 10) : []
  const conns = await prisma.publicationConnection.findMany({ where: { tenantId: a.tenantId, id: { in: ids }, channel: { in: ['INSTAGRAM', 'META_PAGE'] } }, select: { id: true, channel: true } })
  if (!conns.length) return bad('Escolha ao menos uma conta do Instagram ou do Facebook.')

  // Contas de cada post (link só vai para a Página do Facebook).
  const plan = items.map((it, n) => {
    const format = (AVULSA_FORMATS as readonly string[]).includes(String(it.format)) ? (it.format as AvulsaFormat) : null
    const accounts = conns.filter((c) => !format || !FACEBOOK_ONLY.includes(format) || c.channel === 'META_PAGE').map((c) => c.id)
    return { n, it, format, accounts }
  })
  const bad1 = plan.find((p) => !p.format)
  if (bad1) return bad(`Post ${bad1.n + 1}: escolha o formato.`)
  const reqs = plan.filter((p) => p.accounts.length).map((p) => ({ key: String(p.n), connectionId: p.accounts[0], also: p.accounts.slice(1), format: (p.format === 'LINK' ? 'POST' : p.format) as SocialFormat }))
  const slots = await allocateSlots(a.tenantId, reqs, typeof b.startLocal === 'string' ? b.startLocal : undefined)

  const results: Array<{ n: number; ok: boolean; message: string; local?: string }> = []
  for (const p of plan) {
    const s = slots[String(p.n)]
    if (!s) { results.push({ n: p.n, ok: false, message: 'Link só pode ir para a Página do Facebook — nenhuma conta compatível escolhida.' }); continue }
    try {
      const post = await createAvulsa(a.tenantId, {
        title: typeof p.it.title === 'string' ? p.it.title : undefined, format: p.format!, caption: typeof p.it.caption === 'string' ? p.it.caption : '',
        media: p.it.media, connectionIds: p.accounts, scheduledAt: s.at, draft: false,
      }, { id: a.user.id, name: a.user.name ?? null })
      await audit(a, 'SCHEDULE', 'SocialPost', post.id, { format: p.format, scheduledAt: s.at, batch: true })
      results.push({ n: p.n, ok: true, message: 'Agendado.', local: s.local })
    } catch (e) {
      results.push({ n: p.n, ok: false, message: e instanceof Error ? e.message : 'Não foi possível agendar.' })
    }
  }
  const ok = results.filter((r) => r.ok).length
  return NextResponse.json({ success: true, results, message: `${ok} de ${items.length} post(s) agendados em horários diferentes.` })
}
