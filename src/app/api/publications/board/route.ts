// =============================================================================
// GET /api/publications/board — Painel da Central: indicadores + quadro
// (rascunhos, agendados, publicando, publicados no prazo de guarda das mídias —
// padrão 5 dias, configurável —, precisam de atenção). Vencido o prazo, o post
// sai do quadro e dos indicadores e fica só no Histórico.
// Cada cartão é um POST: o anúncio de um veículo numa campanha/formato (com a
// situação em cada canal) ou um post avulso. A tela atualiza sozinha.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { vehicleTitle } from '@/lib/site/listing-core'
import { channelSpec } from '@/lib/publications/channels'
import { permissions, pubAuth } from '@/lib/publications/api'
import { loadPublicationSettings } from '@/lib/publications/settings'
import { BOARD_COLUMNS, columnOf, columnOfPost, successRate, type BoardColumn } from '@/lib/publications/board-core'
import { FORMAT_INFO, isSocialFormat } from '@/lib/publications/social/formats'
import { AVULSA_LABEL, type AvulsaFormat } from '@/lib/publications/social/avulsa-core'
import { RETENTION_DAYS } from '@/lib/publications/retention-core'

export const dynamic = 'force-dynamic'
const PER_COLUMN = 40
const DAY = 86_400_000

export interface BoardChannel { pubId: string | null; connectionId: string | null; channel: string; name: string; account: string | null; status: string; error: string | null; url: string | null }
export interface BoardCard {
  key: string; kind: 'VEICULO' | 'AVULSO' | 'ASSISTENTE'; column: BoardColumn
  title: string; subtitle: string | null; cover: string | null; format: string | null; socialFormat: string | null
  when: string | null; channels: BoardChannel[]
  vehicleId?: string; campaignKey?: string; overrides?: unknown; postId?: string
}

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const now = Date.now()
  const week = new Date(now - 7 * DAY)
  const settings = await loadPublicationSettings(a.tenantId)
  const keepDays = settings.posting.mediaKeepDays
  const shown = new Date(now - keepDays * DAY)
  const [pubs, posts, conns, wizard, can] = await Promise.all([
    prisma.publication.findMany({
      where: { tenantId: a.tenantId, archivedAt: null, status: { notIn: ['REMOVIDO', 'PAUSADO'] }, OR: [{ status: { not: 'PUBLICADO' } }, { publishedAt: { gte: shown } }] },
      orderBy: { updatedAt: 'desc' }, take: 1500,
      select: {
        id: true, vehicleId: true, channel: true, connectionId: true, campaignKey: true, status: true, overrides: true, lastError: true, manualAction: true, remoteUrl: true, scheduledAt: true, publishedAt: true, updatedAt: true,
        vehicle: { select: { id: true, brand: true, model: true, version: true, year: true, modelYear: true, plate: true, mainPhotoUrl: true, unit: { select: { name: true } } } },
      },
    }),
    // Publicado com as mídias já apagadas (prazo vencido) = só histórico.
    prisma.socialPost.findMany({ where: { tenantId: a.tenantId, status: { not: 'CANCELADO' }, OR: [{ status: { notIn: ['PUBLICADO', 'PARCIAL'] } }, { publishedAt: { gte: shown }, NOT: { media: { equals: [] } } }] }, orderBy: { updatedAt: 'desc' }, take: 300 }),
    prisma.publicationConnection.findMany({ where: { tenantId: a.tenantId }, select: { id: true, channel: true, label: true, status: true } }),
    prisma.systemSetting.findUnique({ where: { key: `u:${a.user.id}:t:${a.tenantId}:pubwizard:v1` } }).catch(() => null),
    permissions(a.user),
  ])
  const connById = new Map(conns.map((c) => [c.id, c]))
  const chName = (c: string) => (c === 'META_PAGE' ? 'Facebook' : c === 'INSTAGRAM' ? 'Instagram' : channelSpec(c)?.name ?? c)
  const cards: BoardCard[] = []

  // Anúncios de veículos, agrupados por veículo × campanha/formato.
  const groups = new Map<string, typeof pubs>()
  for (const p of pubs) { const k = `${p.vehicleId}|${p.campaignKey}`; const g = groups.get(k); if (g) g.push(p); else groups.set(k, [p]) }
  for (const [k, g] of groups) {
    const column = columnOf(g.map((p) => p.status))
    if (!column) continue
    const v = g[0].vehicle
    const sf = (g.find((p) => (p.overrides as { social?: { format?: unknown } } | null)?.social?.format)?.overrides as { social?: { format?: unknown } } | null)?.social?.format
    const ck = g[0].campaignKey
    const times = (sel: (p: (typeof g)[number]) => Date | null) => g.map(sel).filter((d): d is Date => !!d).map((d) => d.getTime())
    const when = column === 'agendados' ? Math.min(...times((p) => (p.status === 'AGENDADO' ? p.scheduledAt : null)))
      : column === 'publicados' ? Math.max(...times((p) => p.publishedAt)) : Math.max(...times((p) => p.updatedAt))
    cards.push({
      key: `v:${k}`, kind: 'VEICULO', column, vehicleId: v.id, campaignKey: ck, overrides: g.find((p) => p.overrides)?.overrides ?? null,
      title: vehicleTitle(v), subtitle: [v.plate, v.unit?.name].filter(Boolean).join(' · ') || null, cover: v.mainPhotoUrl,
      socialFormat: isSocialFormat(sf) ? sf : null,
      format: isSocialFormat(sf) ? FORMAT_INFO[sf].label : ck === 'principal' ? 'Anúncio' : ck.replace(/^auto-/, 'Automático · '),
      when: Number.isFinite(when) ? new Date(when).toISOString() : null,
      channels: g.map((p) => ({ pubId: p.id, connectionId: p.connectionId, channel: p.channel, name: chName(p.channel), account: p.connectionId ? connById.get(p.connectionId)?.label ?? null : null, status: p.status, error: p.lastError ?? p.manualAction, url: p.remoteUrl })),
    })
  }

  // Posts avulsos.
  for (const p of posts) {
    const column = columnOfPost(p.status)
    if (!column) continue
    const results = (p.results ?? {}) as Record<string, { state?: string; remoteUrl?: string | null; error?: string | null }>
    const media = Array.isArray(p.media) ? (p.media as Array<{ type?: string; assetId?: string; posterAssetId?: string }>) : []
    const img = media.find((m) => m.type === 'image')?.assetId ?? media.find((m) => m.posterAssetId)?.posterAssetId
    cards.push({
      key: `p:${p.id}`, kind: 'AVULSO', column, postId: p.id,
      title: p.title || (p.caption ? p.caption.slice(0, 60) : 'Post avulso'), subtitle: 'Post avulso', cover: img ? `/api/site/assets/${img}` : null,
      socialFormat: p.format, format: AVULSA_LABEL[p.format as AvulsaFormat] ?? p.format,
      when: (column === 'agendados' ? p.scheduledAt : column === 'publicados' ? p.publishedAt : p.updatedAt)?.toISOString() ?? null,
      channels: (p.connectionIds as string[]).map((cid) => {
        const c = connById.get(cid); const r = results[cid]
        return { pubId: null, connectionId: cid, channel: c?.channel ?? '', name: c ? chName(c.channel) : 'Conta removida', account: c?.label ?? null, status: r?.state === 'PUBLICADO' ? 'PUBLICADO' : r?.error ? 'FALHA' : r?.state === 'EM_ANALISE' ? 'EM_ANALISE' : p.status === 'RASCUNHO' ? 'RASCUNHO' : p.status === 'AGENDADO' ? 'AGENDADO' : 'ENVIANDO', error: r?.error ?? null, url: r?.remoteUrl ?? null }
      }),
    })
  }

  // Nova publicação que ficou pela metade (deste usuário).
  if (wizard && wizard.updatedAt.getTime() > now - RETENTION_DAYS * DAY) {
    try {
      const d = JSON.parse(wizard.value) as { selected?: string[]; step?: number }
      if (d.selected?.length) cards.push({ key: 'w', kind: 'ASSISTENTE', column: 'rascunhos', title: 'Nova publicação em andamento', subtitle: `${d.selected.length} veículo(s) · parou na etapa ${(d.step ?? 0) + 1} de 6`, cover: null, format: 'Continuar de onde parou', socialFormat: null, when: wizard.updatedAt.toISOString(), channels: [] })
    } catch { /* progresso ilegível: ignora */ }
  }

  const byColumn = Object.fromEntries(BOARD_COLUMNS.map((c) => [c, [] as BoardCard[]])) as Record<BoardColumn, BoardCard[]>
  for (const c of cards) byColumn[c.column].push(c)
  const t = (c: BoardCard) => (c.when ? new Date(c.when).getTime() : 0)
  for (const col of BOARD_COLUMNS) byColumn[col].sort((x, y) => (col === 'agendados' ? t(x) - t(y) : t(y) - t(x)))
  const totals = Object.fromEntries(BOARD_COLUMNS.map((c) => [c, byColumn[c].length])) as Record<BoardColumn, number>
  const columns = Object.fromEntries(BOARD_COLUMNS.map((c) => [c, byColumn[c].slice(0, PER_COLUMN)])) as Record<BoardColumn, BoardCard[]>

  // Indicadores.
  const [pub7, fail7, paused, sched7, postPub7, postFail7] = await Promise.all([
    prisma.publication.count({ where: { tenantId: a.tenantId, publishedAt: { gte: shown } } }),
    prisma.publication.count({ where: { tenantId: a.tenantId, status: { in: ['FALHA', 'REJEITADO'] }, updatedAt: { gte: week } } }),
    prisma.publication.count({ where: { tenantId: a.tenantId, status: 'PAUSADO', archivedAt: null } }),
    prisma.publication.count({ where: { tenantId: a.tenantId, status: 'AGENDADO', scheduledAt: { lte: new Date(now + 7 * DAY) } } }),
    prisma.socialPost.count({ where: { tenantId: a.tenantId, status: { in: ['PUBLICADO', 'PARCIAL'] }, publishedAt: { gte: shown }, NOT: { media: { equals: [] } } } }),
    prisma.socialPost.count({ where: { tenantId: a.tenantId, status: 'FALHA', updatedAt: { gte: week } } }),
  ])
  const next = columns.agendados[0] ?? null
  return NextResponse.json({
    success: true, columns, totals, timezone: settings.timezone, can, keepDays,
    kpis: {
      publicados7: pub7 + postPub7,
      agendados7: sched7 + posts.filter((p) => p.status === 'AGENDADO' && p.scheduledAt && p.scheduledAt.getTime() <= now + 7 * DAY).length,
      publicando: totals.publicando, atencao: totals.atencao, pausados: paused,
      sucesso: successRate(pub7 + postPub7, fail7 + postFail7),
      proximo: next ? { title: next.title, format: next.format, when: next.when } : null,
      conectados: conns.filter((c) => c.status === 'CONECTADO').length,
      reconectar: conns.filter((c) => c.status === 'RECONECTAR' || c.status === 'PENDENCIA').length,
    },
  })
}
