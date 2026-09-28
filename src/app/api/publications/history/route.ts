// =============================================================================
// /api/publications/history — histórico de controle da Central.
//   type=veiculos (padrão): um registro por anúncio (veículo × canal × conta ×
//     campanha) com placa, unidade, formato, situação e datas.
//   type=avulsos: posts avulsos com o resultado em cada conta.
//   Filtros: q (veículo/placa/título), channel, unitId, from/to (AAAA-MM-DD no
//   fuso da empresa, pela última movimentação), page. format=csv exporta.
// Rascunhos somem em 2 dias e posts enviados perdem mídia/texto — o que fica
// aqui é o registro de controle.
// =============================================================================

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { vehicleTitle } from '@/lib/site/listing-core'
import { channelSpec } from '@/lib/publications/channels'
import { localToUtc } from '@/lib/publications/schedule-core'
import { loadPublicationSettings } from '@/lib/publications/settings'
import { pubAuth } from '@/lib/publications/api'
import { FORMAT_INFO, isSocialFormat } from '@/lib/publications/social/formats'
import { AVULSA_LABEL, type AvulsaFormat } from '@/lib/publications/social/avulsa-core'

export const dynamic = 'force-dynamic'
const PAGE = 50
const CSV_MAX = 5000

export interface HistoryRow {
  id: string; kind: 'VEICULO' | 'AVULSO'; vehicleId: string | null; title: string; plate: string | null; unit: string | null
  channel: string; channelName: string; account: string | null; format: string | null; status: string; error: string | null
  scheduledAt: Date | null; publishedAt: Date | null; endedAt: Date | null; endReason: string | null; updatedAt: Date; url: string | null
}

const csvCell = (v: unknown) => { const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const sp = new URL(req.url).searchParams
  const type = sp.get('type') === 'avulsos' ? 'avulsos' : 'veiculos'
  const q = sp.get('q')?.trim().slice(0, 80)
  const channel = sp.get('channel') || undefined
  const unitId = sp.get('unitId') || undefined
  const csv = sp.get('format') === 'csv'
  const page = Math.max(1, Number(sp.get('page') ?? 1) || 1)
  const settings = await loadPublicationSettings(a.tenantId)
  const from = sp.get('from') ? localToUtc(`${sp.get('from')}T00:00`, settings.timezone) : null
  const to = sp.get('to') ? localToUtc(`${sp.get('to')}T23:59`, settings.timezone) : null
  const period = from || to ? { updatedAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}

  const [conns, units] = await Promise.all([
    prisma.publicationConnection.findMany({ where: { tenantId: a.tenantId }, select: { id: true, channel: true, label: true } }),
    prisma.unit.findMany({ where: { tenantId: a.tenantId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  const connById = new Map(conns.map((c) => [c.id, c]))
  const chName = (c: string) => (c === 'META_PAGE' ? 'Facebook' : c === 'INSTAGRAM' ? 'Instagram' : channelSpec(c)?.name ?? c)
  let rows: HistoryRow[] = []
  let total = 0

  if (type === 'veiculos') {
    const plate = q?.replace(/[^a-z0-9]/gi, '')
    const where: Prisma.PublicationWhereInput = {
      tenantId: a.tenantId, ...(channel ? { channel } : {}), ...(unitId ? { unitId } : {}), ...period,
      ...(q ? { vehicle: { OR: [{ brand: { contains: q, mode: 'insensitive' } }, { model: { contains: q, mode: 'insensitive' } }, { version: { contains: q, mode: 'insensitive' } }, ...(plate ? [{ plate: { contains: plate, mode: 'insensitive' as const } }] : [])] } } : {}),
    }
    const [n, pubs] = await Promise.all([
      prisma.publication.count({ where }),
      prisma.publication.findMany({
        where, orderBy: { updatedAt: 'desc' }, skip: csv ? 0 : (page - 1) * PAGE, take: csv ? CSV_MAX : PAGE,
        select: {
          id: true, vehicleId: true, channel: true, connectionId: true, status: true, overrides: true, lastError: true, scheduledAt: true, publishedAt: true, removedAt: true, archivedAt: true, archiveReason: true, updatedAt: true, remoteUrl: true,
          vehicle: { select: { id: true, brand: true, model: true, version: true, year: true, modelYear: true, plate: true, unit: { select: { name: true } } } },
        },
      }),
    ])
    total = n
    rows = pubs.map((p) => {
      const f = (p.overrides as { social?: { format?: unknown } } | null)?.social?.format
      return {
        id: p.id, kind: 'VEICULO', vehicleId: p.vehicleId, title: vehicleTitle(p.vehicle), plate: p.vehicle.plate, unit: p.vehicle.unit?.name ?? null,
        channel: p.channel, channelName: chName(p.channel), account: p.connectionId ? connById.get(p.connectionId)?.label ?? null : null,
        format: isSocialFormat(f) ? FORMAT_INFO[f].label : null, status: p.status, error: p.status === 'REJEITADO' || p.status === 'FALHA' ? p.lastError : null,
        scheduledAt: p.scheduledAt, publishedAt: p.publishedAt, endedAt: p.archivedAt ?? p.removedAt, endReason: p.archivedAt ? (p.archiveReason === 'VENDIDO' ? 'Vendido' : 'Retirado') : p.removedAt ? 'Removido' : null,
        updatedAt: p.updatedAt, url: p.remoteUrl,
      }
    })
  } else {
    const idsOfChannel = channel ? conns.filter((c) => c.channel === channel).map((c) => c.id) : null
    const and: Prisma.SocialPostWhereInput[] = []
    if (q) and.push({ OR: [{ title: { contains: q, mode: 'insensitive' } }, { caption: { contains: q, mode: 'insensitive' } }] })
    if (idsOfChannel) and.push({ OR: idsOfChannel.length ? idsOfChannel.map((id) => ({ connectionIds: { array_contains: [id] } })) : [{ id: '__nenhum__' }] })
    // Avulsos não têm unidade: com filtro de unidade, a lista fica vazia.
    if (unitId) and.push({ id: '__nenhum__' })
    const where: Prisma.SocialPostWhereInput = { tenantId: a.tenantId, ...period, AND: and }
    const [n, posts] = await Promise.all([
      prisma.socialPost.count({ where }),
      prisma.socialPost.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: csv ? 0 : (page - 1) * PAGE, take: csv ? CSV_MAX : PAGE, select: { id: true, title: true, format: true, caption: true, connectionIds: true, status: true, results: true, lastError: true, scheduledAt: true, publishedAt: true, updatedAt: true } }),
    ])
    total = n
    rows = posts.flatMap((p) => {
      const results = (p.results ?? {}) as Record<string, { state?: string; remoteUrl?: string | null; error?: string | null }>
      return (p.connectionIds as string[]).flatMap((cid): HistoryRow[] => {
        const c = connById.get(cid)
        if (channel && c?.channel !== channel) return []
        const r = results[cid]
        return [{
          id: `${p.id}:${cid}`, kind: 'AVULSO', vehicleId: null, title: p.title || (p.caption ? p.caption.slice(0, 60) : AVULSA_LABEL[p.format as AvulsaFormat] ?? p.format), plate: null, unit: null,
          channel: c?.channel ?? '', channelName: c ? chName(c.channel) : 'Conta removida', account: c?.label ?? null, format: AVULSA_LABEL[p.format as AvulsaFormat] ?? p.format,
          status: r?.state === 'PUBLICADO' ? 'PUBLICADO' : r?.state === 'FALHA' || r?.error ? 'FALHA' : p.status === 'PARCIAL' ? 'ENVIANDO' : p.status,
          error: r?.error ?? null, scheduledAt: p.scheduledAt, publishedAt: r?.state === 'PUBLICADO' ? p.publishedAt : null, endedAt: null, endReason: null, updatedAt: p.updatedAt, url: r?.remoteUrl ?? null,
        }]
      })
    })
  }

  if (csv) {
    const tz = settings.timezone
    const d = (x: Date | null) => (x ? x.toLocaleString('pt-BR', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' }) : '')
    const head = ['Tipo', 'Veículo/Post', 'Placa', 'Unidade', 'Canal', 'Conta', 'Formato', 'Situação', 'Agendado', 'Publicado', 'Encerrado', 'Motivo', 'Última movimentação', 'Link', 'Erro']
    const lines = rows.map((r) => [r.kind === 'VEICULO' ? 'Veículo' : 'Avulso', r.title, r.plate, r.unit, r.channelName, r.account, r.format, r.status, d(r.scheduledAt), d(r.publishedAt), d(r.endedAt), r.endReason, d(r.updatedAt), r.url, r.error].map(csvCell).join(';'))
    return new NextResponse(`﻿${[head.join(';'), ...lines].join('\r\n')}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="historico-publicacoes-${type}.csv"` } })
  }

  const channels = [...new Set(conns.map((c) => c.channel))].map((c) => ({ id: c, name: chName(c) }))
  return NextResponse.json({ success: true, data: rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE)), units, channels, timezone: settings.timezone })
}
