// =============================================================================
// Eventos internos com caixa de saída (outbox). As rotas existentes só
// PUBLICAM (deal.finalized, deal.cancelled…); os handlers mantêm as operações.
// Gravou o evento → processa na hora; se falhar, o job reprocessa. A chave
// dedupKey impede processar o mesmo fato duas vezes (clique duplo, retry).
// Sem dependência circular: handlers só usam o orquestrador.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { syncDealOperations, ensureIntakeOperation, SYSTEM_ACTOR, type Actor } from './operations'
import { closeConsignment, ensureConsignmentFromDeal } from './vehicle-registry'

export type OpsEventType = 'deal.approved' | 'deal.finalized' | 'deal.cancelled' | 'deal.reopened' | 'vehicle.stock_entered'

interface Payload { dealId?: string; vehicleId?: string; actor?: Actor }

const HANDLERS: Record<OpsEventType, (p: Payload) => Promise<void>> = {
  'deal.approved': async (p) => { if (p.dealId) await syncDealOperations(p.dealId, p.actor ?? SYSTEM_ACTOR) },
  'deal.reopened': async (p) => { if (p.dealId) await syncDealOperations(p.dealId, p.actor ?? SYSTEM_ACTOR) },
  'deal.cancelled': async (p) => { if (p.dealId) await syncDealOperations(p.dealId, p.actor ?? SYSTEM_ACTOR) },
  'deal.finalized': async (p) => {
    if (!p.dealId) return
    const ops = await syncDealOperations(p.dealId, p.actor ?? SYSTEM_ACTOR)
    await ensureConsignmentFromDeal(p.dealId, p.actor ?? SYSTEM_ACTOR)
    // Consignado vendido: contrato encerra e o repasse fica pendente.
    for (const op of ops) if (op.kind === 'SALE') await closeConsignment(op.vehicleId, 'SOLD', p.actor ?? SYSTEM_ACTOR).catch(() => null)
  },
  'vehicle.stock_entered': async (p) => { if (p.vehicleId) await ensureIntakeOperation(p.vehicleId, p.actor ?? SYSTEM_ACTOR) },
}

async function processRow(id: string): Promise<boolean> {
  const row = await prisma.opsOutbox.findUnique({ where: { id } })
  if (!row || row.status === 'DONE') return true
  // Trava leve: só quem marcar a tentativa processa.
  const claim = await prisma.opsOutbox.updateMany({ where: { id, status: row.status, attempts: row.attempts }, data: { attempts: { increment: 1 } } })
  if (!claim.count) return false
  try {
    await HANDLERS[row.type as OpsEventType]?.(row.payload as Payload)
    await prisma.opsOutbox.update({ where: { id }, data: { status: 'DONE', processedAt: new Date(), lastError: null } })
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[operacoes] evento', row.type, msg)
    await prisma.opsOutbox.update({ where: { id }, data: { status: row.attempts + 1 >= 8 ? 'FAILED' : 'PENDING', lastError: msg.slice(0, 1000), availableAt: new Date(Date.now() + Math.min(60, 2 ** row.attempts) * 60_000) } })
    return false
  }
}

/** Publica e tenta processar já. Nunca lança: a operação principal não pode cair por isso. */
export async function publishOpsEvent(type: OpsEventType, dedupKey: string, payload: Payload, tenantId: string | null): Promise<void> {
  try {
    const actor = payload.actor ? { id: payload.actor.id ?? null, name: payload.actor.name ?? null, role: payload.actor.role ?? null } : undefined
    await prisma.opsOutbox.createMany({ data: [{ type, dedupKey: `${type}:${dedupKey}`, tenantId, payload: { ...payload, actor } as Prisma.InputJsonValue }], skipDuplicates: true })
    const row = await prisma.opsOutbox.findUnique({ where: { dedupKey: `${type}:${dedupKey}` }, select: { id: true } })
    if (row) await processRow(row.id)
  } catch (err) {
    console.error('[operacoes] publicar evento', type, err)
  }
}

/** Job: reprocessa eventos pendentes. */
export async function processPendingOpsEvents(limit = 100): Promise<{ processed: number; failed: number }> {
  const rows = await prisma.opsOutbox.findMany({ where: { status: 'PENDING', availableAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: limit, select: { id: true } })
  let processed = 0, failed = 0
  for (const r of rows) {
    if (await processRow(r.id)) processed++
    else failed++
  }
  return { processed, failed }
}
