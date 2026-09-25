// =============================================================================
// /api/publications
//   GET  lista por veículo com a situação em cada canal.
//        Filtros: q (veículo/placa), channel, status, unitId (loja), from/to
//        (período, AAAA-MM-DD no fuso da empresa), archived=1, page.
//   POST publicar agora / agendar / salvar rascunho.
//        { targets:[{vehicleId,connectionId,campaignKey?,overrides?}] | vehicleIds+connectionIds,
//          mode: AGORA|AGENDAR|RASCUNHO, scheduledLocal:"AAAA-MM-DDTHH:mm", requestKey }
// Gate: ver = marketing.publications; publicar/agendar = .publish; rascunho = .prepare.
// =============================================================================

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { effectivePrice, vehicleTitle } from '@/lib/site/listing-core'
import { channelSpec } from '@/lib/publications/channels'
import { STATUS_LABEL, STATUS_TONE, summarize, type PubStatus } from '@/lib/publications/states'
import { createPublications, ensureSiteConnection, type TargetInput } from '@/lib/publications/service'
import { loadPublicationSettings } from '@/lib/publications/settings'
import { localToUtc, validateSchedule } from '@/lib/publications/schedule-core'
import { audit, bad, kickWorker, permissions, pubAuth } from '@/lib/publications/api'

export const dynamic = 'force-dynamic'
const PAGE = 30

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const sp = new URL(req.url).searchParams
  const q = sp.get('q')?.trim()
  const channel = sp.get('channel') || undefined
  const status = sp.get('status') || undefined
  const unitId = sp.get('unitId') || undefined
  const archived = sp.get('archived') === '1'
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1)
  try {
    const settings = await loadPublicationSettings(a.tenantId)
    const from = sp.get('from') ? localToUtc(`${sp.get('from')}T00:00`, settings.timezone) : null
    const to = sp.get('to') ? localToUtc(`${sp.get('to')}T23:59`, settings.timezone) : null
    const pubWhere: Prisma.PublicationWhereInput = {
      tenantId: a.tenantId,
      archivedAt: archived ? { not: null } : null,
      ...(channel ? { channel } : {}),
      ...(status ? { status } : {}),
      ...(unitId ? { unitId } : {}),
      ...(from || to ? { updatedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    }
    const vehicleWhere: Prisma.VehicleWhereInput = {
      tenantId: a.tenantId,
      publications: { some: pubWhere },
      ...(q ? { OR: [{ brand: { contains: q, mode: 'insensitive' } }, { model: { contains: q, mode: 'insensitive' } }, { version: { contains: q, mode: 'insensitive' } }, { plate: { contains: q.replace(/[^a-z0-9]/gi, ''), mode: 'insensitive' } }] } : {}),
    }
    const [total, vehicles, counts, units] = await Promise.all([
      prisma.vehicle.count({ where: vehicleWhere }),
      prisma.vehicle.findMany({
        where: vehicleWhere, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * PAGE, take: PAGE,
        select: {
          id: true, brand: true, model: true, version: true, year: true, modelYear: true, plate: true, km: true, stockStatus: true, unitId: true,
          salePrice: true, promoPrice: true, isPromo: true, promoStartsAt: true, promoEndsAt: true, mainPhotoUrl: true,
          unit: { select: { name: true } },
          publications: {
            where: pubWhere, orderBy: { createdAt: 'asc' },
            select: { id: true, channel: true, campaignKey: true, status: true, remoteUrl: true, lastSyncAt: true, lastVerifiedAt: true, lastError: true, lastErrorHint: true, manualAction: true, scheduledAt: true, archiveReason: true, desiredState: true, manual: true, connection: { select: { label: true, status: true } } },
          },
        },
      }),
      prisma.publication.groupBy({ by: ['status'], where: { tenantId: a.tenantId, archivedAt: null }, _count: { _all: true } }),
      prisma.unit.findMany({ where: { tenantId: a.tenantId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ])
    const rows = vehicles.map((v) => {
      const price = effectivePrice({ salePrice: v.salePrice == null ? null : Number(v.salePrice), promoPrice: v.promoPrice == null ? null : Number(v.promoPrice), isPromo: v.isPromo, promoStartsAt: v.promoStartsAt, promoEndsAt: v.promoEndsAt })
      const pubs = v.publications.map((p) => {
        const spec = channelSpec(p.channel)
        return {
          id: p.id, channel: p.channel, channelName: spec?.name ?? p.channel, account: p.connection?.label ?? null, connectionStatus: p.connection?.status ?? null,
          campaign: spec?.campaigns ? p.campaignKey : null, status: p.status, statusLabel: STATUS_LABEL[p.status as PubStatus] ?? p.status, tone: STATUS_TONE[p.status as PubStatus] ?? 'neutral',
          remoteUrl: p.remoteUrl, lastSyncAt: p.lastSyncAt, lastVerifiedAt: p.lastVerifiedAt, lastError: p.lastError, hint: p.lastErrorHint,
          manualAction: p.manualAction, scheduledAt: p.scheduledAt, archiveReason: p.archiveReason, desiredState: p.desiredState, manual: p.manual,
        }
      })
      const lastSync = pubs.map((p) => p.lastVerifiedAt ?? p.lastSyncAt).filter(Boolean).sort().at(-1) ?? null
      return {
        vehicle: { id: v.id, title: vehicleTitle(v), plate: v.plate, year: v.year, modelYear: v.modelYear, km: v.km, stockStatus: v.stockStatus, cover: v.mainPhotoUrl, unit: v.unit?.name ?? null, price: price.price, oldPrice: price.oldPrice },
        publications: pubs, summary: summarize(pubs.map((p) => p.status)), lastSync,
      }
    })
    return NextResponse.json({
      success: true, data: rows, total, page, pageSize: PAGE,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      units, timezone: settings.timezone, can: await permissions(a.user),
    })
  } catch (e) {
    return handlePrismaError(e)
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const mode = body.mode === 'AGENDAR' ? 'AGENDAR' : body.mode === 'RASCUNHO' ? 'RASCUNHO' : 'AGORA'
  const a = await pubAuth(req, mode === 'RASCUNHO' ? 'marketing.publications.prepare' : 'marketing.publications.publish')
  if (a instanceof NextResponse) return a
  await ensureSiteConnection(a.tenantId)

  let targets: TargetInput[] = []
  if (Array.isArray(body.targets)) {
    targets = (body.targets as Array<Record<string, unknown>>).filter((t) => typeof t?.vehicleId === 'string' && typeof t?.connectionId === 'string')
      .map((t) => ({ vehicleId: t.vehicleId as string, connectionId: t.connectionId as string, campaignKey: typeof t.campaignKey === 'string' ? t.campaignKey : undefined, overrides: t.overrides && typeof t.overrides === 'object' ? t.overrides as Record<string, unknown> : null }))
  } else if (Array.isArray(body.vehicleIds) && Array.isArray(body.connectionIds)) {
    for (const v of body.vehicleIds) for (const c of body.connectionIds) if (typeof v === 'string' && typeof c === 'string') targets.push({ vehicleId: v, connectionId: c })
  }
  if (!targets.length) return bad('Escolha ao menos um veículo e um canal.')
  if (targets.length > 300) return bad('Até 300 envios por vez.')

  let scheduledAt: Date | null = null
  if (mode === 'AGENDAR') {
    const settings = await loadPublicationSettings(a.tenantId)
    scheduledAt = typeof body.scheduledLocal === 'string' ? localToUtc(body.scheduledLocal, settings.timezone) : null
    const err = validateSchedule(scheduledAt)
    if (err) return bad(err)
  }
  const requestKey = typeof body.requestKey === 'string' && /^[\w-]{8,64}$/.test(body.requestKey) ? body.requestKey : undefined
  try {
    const results = await createPublications(a.tenantId, targets, { mode, scheduledAt, actor: a.actor, requestKey })
    await audit(a, mode === 'AGENDAR' ? 'SCHEDULE' : mode === 'RASCUNHO' ? 'DRAFT' : 'PUBLISH', 'Publication', null, { total: targets.length, scheduledAt, results: results.map((r) => ({ v: r.vehicleId, c: r.channel, s: r.status })) })
    if (mode === 'AGORA') kickWorker()
    const ok = results.filter((r) => r.status === 'ENFILEIRADO' || r.status === 'AGENDADO' || r.status === 'JA_NA_FILA' || r.status === 'RASCUNHO').length
    return NextResponse.json({ success: true, results, summary: `${ok} de ${results.length} registrado(s)` })
  } catch (e) {
    return handlePrismaError(e)
  }
}
