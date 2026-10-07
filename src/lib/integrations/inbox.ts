// =============================================================================
// Gateway de Entrada — lado do banco. Usa `webhook_inbox` (já existente) como
// registro bruto universal: grava ANTES de processar, chave única
// (provider, eventId) garante que o mesmo evento entregue N vezes (inclusive
// ao mesmo tempo) vira UM registro. Quem processa é o despachante
// (inbox-dispatch.ts), na hora e de novo pelo job enquanto houver falha.
// =============================================================================

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  correlationId, eventKey, nextAttemptAt, payloadHash, PAYLOAD_RETENTION_DAYS, PermanentInboxError, STUCK_AFTER_MS,
  type InboxKind,
} from './inbox-core'

export interface ReceiveInput {
  /** Família do evento (ex.: CRM_CHANNEL, SITE, EMAIL, WHATSAPP). Decide o processador. */
  provider: string
  kind: InboxKind
  tenantId: string | null
  unitId?: string | null
  /** Canal/conta de origem (id do canal de captação, phone_number_id...). */
  channelRef?: string | null
  /** Escopo da idempotência (normalmente loja + canal). */
  scope: string
  /** Id do evento no provedor, quando existe. */
  providerEventId?: string | null
  payload: unknown
}

export interface ReceivedEvent {
  id: string
  correlationId: string
  duplicate: boolean
  status: string
  resultRef: string | null
}

const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue

/** Grava o evento bruto. Repetido → devolve o registro existente (duplicate=true). */
export async function receiveEvent(i: ReceiveInput): Promise<ReceivedEvent> {
  const eventId = eventKey(i.scope, i.providerEventId, i.payload)
  const existing = await prisma.webhookInbox.findUnique({ where: { provider_eventId: { provider: i.provider, eventId } } })
  if (existing) return { id: existing.id, correlationId: existing.correlationId ?? correlationId(existing.id, existing.receivedAt), duplicate: true, status: existing.status, resultRef: existing.resultRef }
  try {
    const row = await prisma.webhookInbox.create({
      data: {
        provider: i.provider, eventId, kind: i.kind, tenantId: i.tenantId, unitId: i.unitId ?? null,
        channelRef: i.channelRef ?? null, payload: json(i.payload), payloadHash: payloadHash(i.payload),
        // O job só pega depois de 2 min: até lá quem recebeu processa na hora.
        status: 'RECEIVED', nextAttemptAt: new Date(Date.now() + 2 * 60_000),
      },
      select: { id: true, receivedAt: true },
    })
    const corr = correlationId(row.id, row.receivedAt)
    await prisma.webhookInbox.update({ where: { id: row.id }, data: { correlationId: corr } })
    return { id: row.id, correlationId: corr, duplicate: false, status: 'RECEIVED', resultRef: null }
  } catch (e) {
    // Duas entregas simultâneas: a segunda bate na chave única.
    if ((e as { code?: string })?.code === 'P2002') {
      const row = await prisma.webhookInbox.findUnique({ where: { provider_eventId: { provider: i.provider, eventId } } })
      if (row) return { id: row.id, correlationId: row.correlationId ?? correlationId(row.id, row.receivedAt), duplicate: true, status: row.status, resultRef: row.resultRef }
    }
    throw e
  }
}

/** Grava um evento recusado só para auditoria (não reprocessa). */
export async function recordRejected(i: ReceiveInput, reason: string): Promise<void> {
  const eventId = eventKey(`${i.scope}:rejected`, null, { p: i.payload, at: Date.now() })
  await prisma.webhookInbox.create({
    data: {
      provider: i.provider, eventId, kind: i.kind, tenantId: i.tenantId, unitId: i.unitId ?? null, channelRef: i.channelRef ?? null,
      payload: json(i.payload), payloadHash: payloadHash(i.payload), status: 'IGNORED', error: reason.slice(0, 500), processedAt: new Date(),
    },
  }).catch(() => {})
}

export type InboxRow = Awaited<ReturnType<typeof prisma.webhookInbox.findUnique>> & {}
export interface HandlerResult { resultRef?: string | null; ignored?: string; /** Dados extras para quem processou na hora (não são gravados). */ extra?: Record<string, unknown> }
export type InboxHandler = (row: NonNullable<InboxRow>) => Promise<HandlerResult>

/**
 * Processa um evento com trava otimista (só quem muda RECEIVED/FAILED →
 * PROCESSING processa). Nunca lança: falha vira FAILED com nova tentativa.
 */
export async function processInboxEvent(id: string, handler: InboxHandler): Promise<{ status: string; resultRef: string | null; error?: string; extra?: Record<string, unknown> }> {
  const now = new Date()
  const claimed = await prisma.webhookInbox.updateMany({
    where: {
      id,
      OR: [
        { status: { in: ['RECEIVED', 'FAILED'] } },
        { status: 'PROCESSING', nextAttemptAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
      ],
    },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, nextAttemptAt: now },
  })
  const row = await prisma.webhookInbox.findUnique({ where: { id } })
  if (!row) return { status: 'MISSING', resultRef: null }
  if (!claimed.count) return { status: row.status, resultRef: row.resultRef }
  try {
    const r = await handler(row)
    await prisma.webhookInbox.update({
      where: { id },
      data: { status: r.ignored ? 'IGNORED' : 'PROCESSED', error: r.ignored ?? null, resultRef: r.resultRef ?? null, processedAt: new Date(), nextAttemptAt: null },
    })
    return { status: r.ignored ? 'IGNORED' : 'PROCESSED', resultRef: r.resultRef ?? null, extra: r.extra }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const permanent = e instanceof PermanentInboxError
    const next = permanent ? null : nextAttemptAt(row.attempts)
    const status = permanent ? 'IGNORED' : next ? 'FAILED' : 'DEAD'
    console.error(`[inbox] ${row.provider} ${row.correlationId ?? id} falhou (${row.attempts}ª):`, msg)
    await prisma.webhookInbox.update({ where: { id }, data: { status, error: msg.slice(0, 1000), nextAttemptAt: next } }).catch(() => {})
    return { status, resultRef: null, error: msg }
  }
}

/** Eventos prontos para (re)processar: novos esquecidos, falhas vencidas e travados. */
export async function duePendingEvents(limit = 25) {
  const now = new Date()
  return prisma.webhookInbox.findMany({
    where: {
      kind: { not: null },
      OR: [
        { status: { in: ['RECEIVED', 'FAILED'] }, nextAttemptAt: { lte: now } },
        { status: 'PROCESSING', nextAttemptAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) } },
      ],
    },
    orderBy: { receivedAt: 'asc' },
    take: limit,
    select: { id: true, provider: true },
  })
}

/** Retenção: apaga o corpo original de eventos concluídos antigos (mantém o registro). */
export async function purgeOldPayloads(): Promise<number> {
  const before = new Date(Date.now() - PAYLOAD_RETENTION_DAYS * 86_400_000)
  const r = await prisma.webhookInbox.updateMany({
    where: { kind: { not: null }, status: { in: ['PROCESSED', 'IGNORED'] }, receivedAt: { lt: before }, NOT: { payload: { equals: Prisma.DbNull } } },
    data: { payload: Prisma.DbNull },
  }).catch(() => ({ count: 0 }))
  return r.count
}

/** Volta um evento DEAD/FAILED para a fila (botão "Reprocessar" da tela técnica). */
export async function requeueEvent(id: string, tenantId: string | null): Promise<boolean> {
  const r = await prisma.webhookInbox.updateMany({
    where: { id, status: { in: ['DEAD', 'FAILED'] }, ...(tenantId ? { tenantId } : {}) },
    data: { status: 'FAILED', attempts: 0, nextAttemptAt: new Date() },
  })
  return r.count > 0
}
