// =============================================================================
// seller-queue/penalty.ts — estratégia anti-abuso da fila ("strikes").
// Cada vez que o vendedor é chamado e NÃO aceita no prazo (timeout) conta 1
// "perda" no dia. Ao atingir os limiares da unidade: bloqueio temporário
// (cooldown) e, na reincidência, bloqueio até o fim do dia. O vendedor é
// avisado de forma progressiva. Limiares configuráveis por unidade (cfg.config
// .autoBlock), com defaults. Sem coluna nova no banco — usa SellerQueuePenalty
// (type COOLDOWN | DAILY_BLOCK, com endsAt) para o bloqueio temporizado.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { queueDate, getUnitConfig } from './queue'
import { notifySellerStrikeWarning, notifySellerBlocked, notifyBlockManagers } from './notify'

export interface AutoBlockConfig {
  enabled: boolean
  strikesForCooldown: number
  cooldownHours: number
  strikesForDailyBlock: number
}

export const DEFAULT_AUTO_BLOCK: AutoBlockConfig = {
  enabled: true,
  strikesForCooldown: 3,
  cooldownHours: 3,
  strikesForDailyBlock: 6,
}

/** Lê a config de auto-bloqueio do JSON da unidade, com defaults. */
export function readAutoBlockConfig(cfgConfig: unknown): AutoBlockConfig {
  const raw = (cfgConfig as { autoBlock?: Partial<AutoBlockConfig> } | null | undefined)?.autoBlock
  if (!raw) return DEFAULT_AUTO_BLOCK
  return {
    enabled: raw.enabled ?? DEFAULT_AUTO_BLOCK.enabled,
    strikesForCooldown: raw.strikesForCooldown ?? DEFAULT_AUTO_BLOCK.strikesForCooldown,
    cooldownHours: raw.cooldownHours ?? DEFAULT_AUTO_BLOCK.cooldownHours,
    strikesForDailyBlock: raw.strikesForDailyBlock ?? DEFAULT_AUTO_BLOCK.strikesForDailyBlock,
  }
}

export interface QueueBlock { type: 'COOLDOWN' | 'DAILY_BLOCK'; endsAt: Date; reason: string }

/** Bloqueio de fila ativo (cooldown/diário) do vendedor, se houver. */
export async function getActiveQueueBlock(tenantId: string, unitId: string, sellerId: string): Promise<QueueBlock | null> {
  const now = new Date()
  const p = await prisma.sellerQueuePenalty.findFirst({
    where: { tenantId, unitId, sellerId, active: true, type: { in: ['COOLDOWN', 'DAILY_BLOCK'] }, endsAt: { gt: now } },
    orderBy: { endsAt: 'desc' },
  })
  if (!p || !p.endsAt) return null
  return { type: p.type as QueueBlock['type'], endsAt: p.endsAt, reason: p.reason ?? '' }
}

/** Mensagem amigável para uma rota negar entrada por bloqueio ativo. */
export function blockMessage(block: QueueBlock): string {
  const mins = Math.max(1, Math.ceil((block.endsAt.getTime() - Date.now()) / 60000))
  if (block.type === 'DAILY_BLOCK') return 'Você está bloqueado da fila até o fim do dia por reincidência. Procure a gerência.'
  const h = Math.floor(mins / 60), m = mins % 60
  const dur = h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`
  return `Você está temporariamente fora da fila por perder a vez vezes demais. Volta liberada em ~${dur}.`
}

/** Perdas (timeouts) do vendedor hoje (desde a meia-noite UTC da fila).
 *  Só conta as ATIVAS — liberar um vendedor desativa as perdas (zera o contador). */
export async function countStrikesToday(tenantId: string, unitId: string, sellerId: string): Promise<number> {
  return prisma.sellerQueuePenalty.count({
    where: { tenantId, unitId, sellerId, type: 'TIMEOUT', active: true, createdAt: { gte: queueDate() } },
  })
}

function nextMidnightUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

async function removeFromQueue(queueId: string, sellerId: string): Promise<void> {
  await prisma.sellerQueueEntry.updateMany({ where: { queueId, sellerId }, data: { status: 'LEFT', leftAt: new Date() } }).catch(() => {})
}

/**
 * Roda DEPOIS do timeout (que já criou a penalidade TIMEOUT). Conta as perdas
 * do dia e decide: apenas avisar, cooldown ou bloqueio diário. Best-effort.
 */
export async function escalateAfterTimeout(opts: {
  tenantId: string; unitId: string; queueId: string; sellerId: string; whatsapp?: boolean
}): Promise<{ action: 'NONE' | 'WARN' | 'COOLDOWN' | 'DAILY_BLOCK'; strikes: number }> {
  const cfg = await getUnitConfig(opts.tenantId, opts.unitId)
  const ab = readAutoBlockConfig(cfg?.config)
  if (!ab.enabled) return { action: 'NONE', strikes: 0 }

  const strikes = await countStrikesToday(opts.tenantId, opts.unitId, opts.sellerId)
  const now = new Date()

  // Bloqueio diário (reincidência).
  if (strikes >= ab.strikesForDailyBlock) {
    const already = await prisma.sellerQueuePenalty.findFirst({ where: { tenantId: opts.tenantId, unitId: opts.unitId, sellerId: opts.sellerId, type: 'DAILY_BLOCK', active: true, endsAt: { gt: now } } })
    const endsAt = nextMidnightUtc(now)
    if (!already) {
      await prisma.sellerQueuePenalty.create({ data: { tenantId: opts.tenantId, unitId: opts.unitId, sellerId: opts.sellerId, type: 'DAILY_BLOCK', startsAt: now, endsAt, points: 3, reason: `Reincidência: ${strikes} perdas no dia` } }).catch(() => {})
    }
    await removeFromQueue(opts.queueId, opts.sellerId)
    await notifySellerBlocked({ tenantId: opts.tenantId, sellerId: opts.sellerId, type: 'DAILY_BLOCK', strikes, hours: ab.cooldownHours })
    await notifyBlockManagers({ tenantId: opts.tenantId, unitId: opts.unitId, sellerId: opts.sellerId, type: 'DAILY_BLOCK', strikes, whatsapp: opts.whatsapp })
    return { action: 'DAILY_BLOCK', strikes }
  }

  // Bloqueio temporário (cooldown) — ao atingir o limiar (>=, robusto: ex.: 1
  // perda já bloqueia). Guarda anti-duplicata: não cria 2 cooldowns ativos.
  if (strikes >= ab.strikesForCooldown) {
    const already = await prisma.sellerQueuePenalty.findFirst({ where: { tenantId: opts.tenantId, unitId: opts.unitId, sellerId: opts.sellerId, type: 'COOLDOWN', active: true, endsAt: { gt: now } } })
    const endsAt = new Date(now.getTime() + ab.cooldownHours * 3600_000)
    if (!already) {
      await prisma.sellerQueuePenalty.create({ data: { tenantId: opts.tenantId, unitId: opts.unitId, sellerId: opts.sellerId, type: 'COOLDOWN', startsAt: now, endsAt, points: 2, reason: `${strikes} perda(s) no dia` } }).catch(() => {})
    }
    await removeFromQueue(opts.queueId, opts.sellerId)
    await notifySellerBlocked({ tenantId: opts.tenantId, sellerId: opts.sellerId, type: 'COOLDOWN', strikes, hours: ab.cooldownHours })
    await notifyBlockManagers({ tenantId: opts.tenantId, unitId: opts.unitId, sellerId: opts.sellerId, type: 'COOLDOWN', strikes, whatsapp: opts.whatsapp })
    return { action: 'COOLDOWN', strikes }
  }

  // Caso contrário: aviso progressivo ao vendedor.
  const willBeDaily = strikes >= ab.strikesForCooldown
  const nextThreshold = willBeDaily ? ab.strikesForDailyBlock : ab.strikesForCooldown
  await notifySellerStrikeWarning({ tenantId: opts.tenantId, sellerId: opts.sellerId, strikes, remaining: Math.max(1, nextThreshold - strikes), cooldownHours: ab.cooldownHours, willBeDaily })
  return { action: 'WARN', strikes }
}

/** Gerência liberou o vendedor: desativa cooldown/diário ativos. */
export async function clearActiveBlocks(tenantId: string, unitId: string, sellerId: string): Promise<void> {
  await prisma.sellerQueuePenalty.updateMany({
    where: { tenantId, unitId, sellerId, active: true, type: { in: ['COOLDOWN', 'DAILY_BLOCK'] } },
    data: { active: false, endsAt: new Date() },
  }).catch(() => {})
}

export interface BlockedSeller {
  sellerId: string
  name: string
  type: 'COOLDOWN' | 'DAILY_BLOCK' | 'MANUAL'
  endsAt: Date | null
  strikes: number
}

/** Lista os vendedores bloqueados na unidade: automáticos (cooldown/diário —
 *  fora da fila) E manuais (entry.blocked). Inclui as perdas do dia. */
export async function listBlockedSellers(tenantId: string, unitId: string): Promise<BlockedSeller[]> {
  const now = new Date()
  const penalties = await prisma.sellerQueuePenalty.findMany({
    where: { tenantId, unitId, active: true, type: { in: ['COOLDOWN', 'DAILY_BLOCK'] }, endsAt: { gt: now } },
    orderBy: { endsAt: 'desc' },
  })
  const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
  const manual = queue ? await prisma.sellerQueueEntry.findMany({ where: { queueId: queue.id, blocked: true }, select: { sellerId: true } }) : []

  const ids = [...new Set([...penalties.map((p) => p.sellerId), ...manual.map((m) => m.sellerId)])]
  if (!ids.length) return []

  const [users, strikeGroups] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.sellerQueuePenalty.groupBy({ by: ['sellerId'], where: { tenantId, unitId, type: 'TIMEOUT', active: true, createdAt: { gte: queueDate() }, sellerId: { in: ids } }, _count: { _all: true } }),
  ])
  const nameOf = new Map(users.map((u) => [u.id, u.name]))
  const strikeOf = new Map(strikeGroups.map((s) => [s.sellerId, s._count._all]))

  const out: BlockedSeller[] = []
  const seen = new Set<string>()
  for (const p of penalties) {
    seen.add(p.sellerId)
    out.push({ sellerId: p.sellerId, name: nameOf.get(p.sellerId) ?? p.sellerId, type: p.type as 'COOLDOWN' | 'DAILY_BLOCK', endsAt: p.endsAt, strikes: strikeOf.get(p.sellerId) ?? 0 })
  }
  for (const m of manual) {
    if (seen.has(m.sellerId)) continue
    out.push({ sellerId: m.sellerId, name: nameOf.get(m.sellerId) ?? m.sellerId, type: 'MANUAL', endsAt: null, strikes: strikeOf.get(m.sellerId) ?? 0 })
  }
  return out
}

/** Libera um vendedor: zera bloqueios (auto + manual) e as perdas do dia. */
export async function releaseSeller(tenantId: string, unitId: string, sellerId: string): Promise<void> {
  const now = new Date()
  // desativa bloqueios temporizados + zera as perdas do dia
  await prisma.sellerQueuePenalty.updateMany({
    where: { tenantId, unitId, sellerId, active: true, type: { in: ['COOLDOWN', 'DAILY_BLOCK'] } },
    data: { active: false, endsAt: now },
  }).catch(() => {})
  await prisma.sellerQueuePenalty.updateMany({
    where: { tenantId, unitId, sellerId, type: 'TIMEOUT', active: true, createdAt: { gte: queueDate() } },
    data: { active: false },
  }).catch(() => {})
  // desbloqueia o bloqueio manual na fila de hoje (se houver)
  const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
  if (queue) {
    await prisma.sellerQueueEntry.updateMany({ where: { queueId: queue.id, sellerId, blocked: true }, data: { blocked: false, status: 'WAITING' } }).catch(() => {})
  }
}

/** Libera TODOS os vendedores bloqueados da unidade. Retorna quantos. */
export async function releaseAllSellers(tenantId: string, unitId: string): Promise<number> {
  const blocked = await listBlockedSellers(tenantId, unitId)
  for (const b of blocked) await releaseSeller(tenantId, unitId, b.sellerId)
  return blocked.length
}
