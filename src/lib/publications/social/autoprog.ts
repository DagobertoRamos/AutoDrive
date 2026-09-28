// =============================================================================
// Programação automática — serviço. Roda na rotina de conferência (15 min):
// preenche os horários vazios das próximas 48 h da grade da loja com carros
// do estoque em rodízio, agendados como publicações comuns (fila, calendário,
// histórico). Idempotente: cada horário tem uma chave própria por conta.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { effectivePrice } from '@/lib/site/listing-core'
import { PUBLISHABLE_STOCK } from '../sale-rules-core'
import { localToUtc, utcToLocalInput } from '../schedule-core'
import { createPublications, ensureMediaApproved, type CreateResult } from '../service'
import { loadPublicationSettings } from '../settings'
import { assign, autoKey, upcoming, type Candidate } from './autoprog-core'
import { classifyVideo } from './video-core'

const ACTOR = { id: null, name: 'Programação automática' }

export async function planAutoProgram(tenantId: string, now = new Date()): Promise<{ planned: number; results: CreateResult[]; message: string }> {
  const settings = await loadPublicationSettings(tenantId)
  const prog = settings.autoProgram
  if (!prog.enabled || !prog.slots.length) return { planned: 0, results: [], message: 'Programação automática desligada.' }
  const conns = await prisma.publicationConnection.findMany({ where: { tenantId, id: { in: prog.connectionIds }, status: 'CONECTADO', channel: { in: ['INSTAGRAM', 'META_PAGE'] } }, select: { id: true } })
  if (!conns.length) return { planned: 0, results: [], message: 'Nenhuma conta do Instagram/Facebook conectada na programação.' }

  const occ = upcoming(prog.slots, utcToLocalInput(now, settings.timezone), 48)
  if (!occ.length) return { planned: 0, results: [], message: 'Nenhum horário da grade nas próximas 48 h.' }
  const keys = occ.map((o) => autoKey(o.format, o.local))
  const taken = new Set((await prisma.publication.findMany({ where: { tenantId, connectionId: { in: conns.map((c) => c.id) }, campaignKey: { in: keys } }, select: { connectionId: true, campaignKey: true } })).map((p) => `${p.connectionId}:${p.campaignKey}`))
  const open = occ.filter((o) => conns.some((c) => !taken.has(`${c.id}:${autoKey(o.format, o.local)}`)))
  if (!open.length) return { planned: 0, results: [], message: 'Grade das próximas 48 h já preenchida.' }

  // Estoque anunciável com foto + quando apareceu por último nas redes.
  const vehicles = await prisma.vehicle.findMany({
    where: { tenantId, active: true, stockStatus: { in: [...PUBLISHABLE_STOCK] }, photos: { some: {} } },
    select: { id: true, createdAt: true, salePrice: true, promoPrice: true, isPromo: true, promoStartsAt: true, promoEndsAt: true, siteListing: { select: { videoUrl: true } } },
    take: 500,
  })
  if (!vehicles.length) return { planned: 0, results: [], message: 'Nenhum carro disponível com fotos para programar.' }
  const recent = await prisma.publication.groupBy({
    by: ['vehicleId'], where: { tenantId, vehicleId: { in: vehicles.map((v) => v.id) }, channel: { in: ['INSTAGRAM', 'META_PAGE'] } },
    _max: { publishedAt: true, scheduledAt: true, createdAt: true },
  })
  const lastBy = new Map(recent.map((r) => [r.vehicleId, [r._max.publishedAt, r._max.scheduledAt, r._max.createdAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null]))
  const cands: Candidate[] = vehicles.map((v) => ({
    id: v.id, createdAt: v.createdAt, lastPostedAt: lastBy.get(v.id) ?? null, hasVideo: !!classifyVideo(v.siteListing?.videoUrl)?.downloadUrl,
    promo: effectivePrice({ salePrice: v.salePrice == null ? null : Number(v.salePrice), promoPrice: v.promoPrice == null ? null : Number(v.promoPrice), isPromo: v.isPromo, promoStartsAt: v.promoStartsAt, promoEndsAt: v.promoEndsAt }, now).oldPrice != null,
  }))

  const plan = assign(open, cands, { promoFirst: prog.promoFirst, minDaysBetween: prog.minDaysBetween, now })
  if (!plan.length) return { planned: 0, results: [], message: 'Todos os carros já apareceram dentro do intervalo mínimo; nada novo para programar.' }
  await ensureMediaApproved(tenantId, plan.map((p) => p.vehicleId), ACTOR)

  const results: CreateResult[] = []
  for (const slot of plan) {
    const key = autoKey(slot.format, slot.local)
    const at = localToUtc(slot.local, settings.timezone)
    if (!at) continue
    const targets = conns.filter((c) => !taken.has(`${c.id}:${key}`)).map((c) => ({
      vehicleId: slot.vehicleId, connectionId: c.id, campaignKey: key,
      overrides: { auto: true, social: { format: slot.format, template: prog.template, ...(prog.music ? { music: prog.music } : {}) } },
    }))
    if (targets.length) results.push(...await createPublications(tenantId, targets, { mode: 'AGENDAR', scheduledAt: at, actor: ACTOR }))
  }
  const ok = results.filter((r) => r.status === 'AGENDADO').length
  return { planned: ok, results, message: `${ok} envio(s) programado(s) para as próximas 48 h.` }
}

/** Todas as lojas com programação ligada (rotina de 15 min). */
export async function planAllAutoPrograms(now = new Date()): Promise<Array<{ tenantId: string; planned: number; message: string }>> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { endsWith: ':publications:v1' }, value: { contains: '"autoProgram"' } }, select: { key: true } })
  const out: Array<{ tenantId: string; planned: number; message: string }> = []
  for (const r of rows) {
    const tenantId = /^t:(.+):publications:v1$/.exec(r.key)?.[1]
    if (!tenantId) continue
    try { const x = await planAutoProgram(tenantId, now); if (x.planned || x.message.includes('conectada')) out.push({ tenantId, planned: x.planned, message: x.message }) } catch (e) { out.push({ tenantId, planned: 0, message: `Erro: ${(e as Error).message}` }) }
  }
  return out
}
