// GET /api/publications/calendar?from=AAAA-MM-DD&to=AAAA-MM-DD — agendados e
// publicados por dia, no fuso da empresa (gravados em UTC).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { vehicleTitle } from '@/lib/site/listing-core'
import { channelSpec } from '@/lib/publications/channels'
import { dayKey, localToUtc } from '@/lib/publications/schedule-core'
import { loadPublicationSettings } from '@/lib/publications/settings'
import { STATUS_LABEL, type PubStatus } from '@/lib/publications/states'
import { bad, permissions, pubAuth } from '@/lib/publications/api'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const sp = new URL(req.url).searchParams
  const settings = await loadPublicationSettings(a.tenantId)
  const tz = settings.timezone
  const from = localToUtc(`${sp.get('from') ?? ''}T00:00`, tz)
  const to = localToUtc(`${sp.get('to') ?? ''}T23:59`, tz)
  if (!from || !to || to < from || to.getTime() - from.getTime() > 62 * 86_400_000) return bad('Período inválido (até 2 meses).')
  const pubs = await prisma.publication.findMany({
    where: { tenantId: a.tenantId, OR: [{ scheduledAt: { gte: from, lte: to } }, { publishedAt: { gte: from, lte: to } }, { removedAt: { gte: from, lte: to } }] },
    select: { id: true, channel: true, status: true, scheduledAt: true, publishedAt: true, removedAt: true, archiveReason: true, remoteUrl: true, connection: { select: { label: true } }, vehicle: { select: { id: true, brand: true, model: true, version: true, year: true, modelYear: true, plate: true, mainPhotoUrl: true } } },
    take: 1000,
  })
  const items: Array<{ day: string; at: string; kind: 'AGENDADO' | 'PUBLICADO' | 'REMOVIDO'; id: string; vehicleId: string; title: string; plate: string | null; cover: string | null; channel: string; account: string | null; status: string; statusLabel: string; url: string | null }> = []
  for (const p of pubs) {
    const base = { id: p.id, vehicleId: p.vehicle.id, title: vehicleTitle(p.vehicle), plate: p.vehicle.plate, cover: p.vehicle.mainPhotoUrl, channel: channelSpec(p.channel)?.name ?? p.channel, account: p.connection?.label ?? null, status: p.status, statusLabel: STATUS_LABEL[p.status as PubStatus] ?? p.status, url: p.remoteUrl }
    if (p.scheduledAt && p.scheduledAt >= from && p.scheduledAt <= to && p.status === 'AGENDADO') items.push({ ...base, day: dayKey(p.scheduledAt, tz), at: p.scheduledAt.toISOString(), kind: 'AGENDADO' })
    if (p.publishedAt && p.publishedAt >= from && p.publishedAt <= to) items.push({ ...base, day: dayKey(p.publishedAt, tz), at: p.publishedAt.toISOString(), kind: 'PUBLICADO' })
    if (p.removedAt && p.removedAt >= from && p.removedAt <= to) items.push({ ...base, day: dayKey(p.removedAt, tz), at: p.removedAt.toISOString(), kind: 'REMOVIDO' })
  }
  items.sort((x, y) => x.at.localeCompare(y.at))
  return NextResponse.json({ success: true, data: items, timezone: tz, can: await permissions(a.user) })
}
