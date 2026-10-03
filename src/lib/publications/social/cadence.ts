// =============================================================================
// Agenda inteligente das redes (servidor): lê tudo o que a loja já tem
// agendado/publicado no Instagram e no Facebook (anúncios e posts avulsos) e
// encaixa os novos pedidos sem repetir horário (regras em cadence-core.ts).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { localToUtc, utcToLocalInput } from '../schedule-core'
import { loadPublicationSettings } from '../settings'
import { SOCIAL_CHANNELS } from '../channels'
import { allocate, cadenceFrom, localToMinutes, minutesToLocal, type Busy, type SlotRequest } from './cadence-core'

const LIVE = ['AGENDADO', 'NA_FILA', 'ENVIANDO', 'EM_ANALISE', 'PUBLICADO', 'ATUALIZACAO_PENDENTE']

/** Tudo o que ocupa horário nas redes desde ontem (minutos locais). */
export async function busySlots(tenantId: string, tz: string): Promise<Busy[]> {
  const since = new Date(Date.now() - 36 * 3_600_000)
  const toLocal = (d: Date) => localToMinutes(utcToLocalInput(d, tz))!
  const [pubs, posts] = await Promise.all([
    prisma.publication.findMany({
      where: { tenantId, channel: { in: [...SOCIAL_CHANNELS] }, status: { in: LIVE }, OR: [{ scheduledAt: { gte: since } }, { publishedAt: { gte: since } }] },
      select: { connectionId: true, scheduledAt: true, publishedAt: true, overrides: true },
    }),
    prisma.socialPost.findMany({
      where: { tenantId, status: { in: ['AGENDADO', 'ENVIANDO', 'PUBLICADO', 'PARCIAL'] }, OR: [{ scheduledAt: { gte: since } }, { publishedAt: { gte: since } }] },
      select: { connectionIds: true, scheduledAt: true, publishedAt: true, format: true },
    }),
  ])
  const busy: Busy[] = []
  for (const p of pubs) {
    const when = p.scheduledAt ?? p.publishedAt
    const f = (p.overrides as { social?: { format?: string } } | null)?.social?.format ?? 'POST'
    if (when && p.connectionId) busy.push({ connectionId: p.connectionId, at: toLocal(when), format: f })
  }
  for (const s of posts) {
    const when = s.scheduledAt ?? s.publishedAt
    if (!when) continue
    for (const cid of (s.connectionIds as string[])) busy.push({ connectionId: cid, at: toLocal(when), format: s.format === 'LINK' ? 'POST' : s.format })
  }
  return busy
}

/** Horário (local "AAAA-MM-DDTHH:MM" e UTC) de cada pedido, sem colidir com a agenda. */
export async function allocateSlots(tenantId: string, requests: Array<Omit<SlotRequest, 'notBefore'> & { notBeforeLocal?: string }>, startLocal?: string): Promise<Record<string, { local: string; at: Date }>> {
  const { timezone, posting } = await loadPublicationSettings(tenantId)
  const nowLocal = utcToLocalInput(new Date(), timezone)
  const start = Math.max(localToMinutes(nowLocal)!, (startLocal && localToMinutes(startLocal)) || 0)
  const busy = await busySlots(tenantId, timezone)
  const minutes = allocate(requests.map((r) => ({ key: r.key, connectionId: r.connectionId, format: r.format, also: r.also, notBefore: r.notBeforeLocal ? localToMinutes(r.notBeforeLocal) ?? undefined : undefined })), busy, start, cadenceFrom(posting))
  const out: Record<string, { local: string; at: Date }> = {}
  for (const [k, m] of Object.entries(minutes)) { const local = minutesToLocal(m); out[k] = { local, at: localToUtc(local, timezone)! } }
  return out
}
