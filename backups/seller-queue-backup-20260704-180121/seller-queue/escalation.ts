// =============================================================================
// seller-queue/escalation.ts — MOTOR de escalonamento da chamada.
//
// Duas partes:
//   • planNextEscalation() — PURA: decide o próximo passo (mesmo nível +1 tentativa
//     ou próximo nível ativo, ou esgotou). Testável sem banco.
//   • resolveLevelTargets() — resolve os userIds do nível no banco (vendedor da vez,
//     líder, gerente, gerente geral, admin, cargo, colaboradores), já excluindo
//     ocupados e quem já foi tentado. Escopo estrito tenant+unidade.
//
// A orquestração (criar chamadas, notificar todos, first-accept-wins) fica em
// call.ts/accept usando estes utilitários — este arquivo não altera o fluxo atual.
// =============================================================================

import { prisma } from '@/lib/prisma'
import {
  type EscalationConfig, type EscalationLevel,
  nextActiveLevelIndex, firstActiveLevelIndex,
} from './escalation-config'
import { logQueueEvent } from './queue'
import { notifySellerCalled, notifyNoSellerAvailable } from './notify'

export interface EscalationState { levelIndex: number; attempt: number }
export type EscalationStep =
  | { done: true; reason: 'exhausted' }
  | { done: false; levelIndex: number; attempt: number; level: EscalationLevel; timeoutSeconds: number }

/**
 * Decide o próximo passo do escalonamento a partir do estado atual.
 * Estado inicial: { levelIndex: -1, attempt: 0 } → primeiro nível ativo, tentativa 1.
 * Enquanto houver tentativas no nível atual (ativo), repete o nível; senão avança
 * para o próximo nível ativo; se não houver, `done: exhausted`.
 */
export function planNextEscalation(config: EscalationConfig, state: EscalationState): EscalationStep {
  const levels = config.levels
  const cur = levels[state.levelIndex]
  if (cur && cur.active && state.attempt > 0 && state.attempt < cur.maxAttempts) {
    return { done: false, levelIndex: state.levelIndex, attempt: state.attempt + 1, level: cur, timeoutSeconds: cur.timeoutSeconds }
  }
  const nextIdx = nextActiveLevelIndex(levels, state.levelIndex)
  if (nextIdx === -1) return { done: true, reason: 'exhausted' }
  const level = levels[nextIdx]
  return { done: false, levelIndex: nextIdx, attempt: 1, level, timeoutSeconds: level.timeoutSeconds }
}

const BUSY_STATUS = ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] as const

/** userIds ocupados (com atendimento aberto) na fila — não devem ser chamados. */
async function busyUserIds(queueId: string): Promise<Set<string>> {
  const rows = await prisma.sellerQueueAttendance.findMany({
    where: { queueId, status: { in: [...BUSY_STATUS] } },
    select: { sellerId: true },
  }).catch(() => [] as Array<{ sellerId: string }>)
  return new Set(rows.map((r) => r.sellerId))
}

/**
 * Resolve os userIds-alvo de um nível, no escopo tenant+unidade, excluindo
 * ocupados e `exclude`. Respeita notifyAll (retorna 1 quando false, salvo lista).
 */
export async function resolveLevelTargets(opts: {
  tenantId: string
  unitId: string
  queueId: string
  level: EscalationLevel
  exclude?: Iterable<string>
}): Promise<string[]> {
  const { tenantId, unitId, queueId, level } = opts
  const exclude = new Set(opts.exclude ?? [])
  const busy = await busyUserIds(queueId)
  const skip = (id: string) => !id || exclude.has(id) || busy.has(id)

  let candidates: string[] = []

  switch (level.targetType) {
    case 'VENDEDOR_DA_VEZ': {
      // próximos WAITING da rotação (não bloqueados), por posição.
      const waiting = await prisma.sellerQueueEntry.findMany({
        where: { queueId, status: 'WAITING', blocked: false },
        orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
        select: { sellerId: true },
      })
      candidates = waiting.map((w) => w.sellerId)
      break
    }
    case 'VENDEDOR_LIDER': {
      const sellers = await prisma.seller.findMany({
        where: { unitId, active: true, OR: [{ cargo: { in: ['VENDEDOR_LIDER', 'LIDER'] } }, { user: { role: 'VENDEDOR_LIDER' } }] },
        select: { userId: true },
      })
      candidates = sellers.map((s) => s.userId)
      break
    }
    case 'GERENTE': {
      const sellers = await prisma.seller.findMany({
        where: { unitId, active: true, OR: [{ cargo: 'GERENTE' }, { user: { role: 'GERENTE' } }] },
        select: { userId: true },
      })
      candidates = sellers.map((s) => s.userId)
      break
    }
    case 'GERENTE_GERAL': {
      const users = await prisma.user.findMany({ where: { tenantId, role: 'GERENTE_GERAL' }, select: { id: true } })
      candidates = users.map((u) => u.id)
      break
    }
    case 'ADMIN': {
      const users = await prisma.user.findMany({ where: { tenantId, role: { in: ['ADM', 'MASTER'] } }, select: { id: true } })
      candidates = users.map((u) => u.id)
      break
    }
    case 'CARGO': {
      if (level.role) {
        const users = await prisma.user.findMany({ where: { tenantId, role: level.role as never }, select: { id: true } })
        candidates = users.map((u) => u.id)
      }
      break
    }
    case 'COLABORADORES': {
      if (level.targetUserIds.length) {
        const users = await prisma.user.findMany({ where: { tenantId, id: { in: level.targetUserIds } }, select: { id: true } })
        candidates = users.map((u) => u.id)
      }
      break
    }
  }

  const filtered: string[] = []
  const seen = new Set<string>()
  for (const id of candidates) {
    if (seen.has(id) || skip(id)) continue
    seen.add(id)
    filtered.push(id)
  }
  // notifyAll=false → chama só o primeiro (exceto lista explícita, que respeita notifyAll)
  return level.notifyAll ? filtered : filtered.slice(0, 1)
}

export interface EscalateResult {
  escalated: boolean
  exhausted?: boolean
  levelIndex?: number
  levelName?: string
  targets?: string[]
}

/**
 * Avança o escalonamento de UM arrival para o próximo nível/tentativa e notifica
 * o(s) alvo(s). Chamado pelo `sweepExpiredCalls` quando a config está ativa.
 * Idempotente por arrival: só age se o arrival ainda estiver PENDING/CALLING.
 * `escalationLevel == null` = o call inicial (rotação) já cobriu o 1º nível ativo.
 * first-accept-wins é garantido no /accept (claim atômico do arrival).
 */
export async function escalateArrival(opts: {
  tenantId: string
  unitId: string
  queueId: string
  arrivalId: string
  actorId: string
  config: EscalationConfig
  customerName?: string | null
  whatsapp?: boolean
  whatsappManagers?: boolean
}): Promise<EscalateResult> {
  const { tenantId, unitId, queueId, arrivalId, actorId, config } = opts
  const arrival = await prisma.sellerQueueCustomerArrival.findUnique({
    where: { id: arrivalId },
    select: { status: true, escalationLevel: true, escalationAttempt: true },
  })
  if (!arrival || ['ASSIGNED', 'DONE', 'CANCELED'].includes(arrival.status)) return { escalated: false }

  const startLevel = arrival.escalationLevel ?? firstActiveLevelIndex(config.levels)
  const startAttempt = arrival.escalationLevel == null ? 1 : (arrival.escalationAttempt ?? 1)

  // Percorre níveis até achar um com alvo disponível ou esgotar (evita loop em
  // nível vazio marcando a tentativa como esgotada antes de recorrer).
  let state = { levelIndex: startLevel, attempt: startAttempt }
  for (let guard = 0; guard < config.levels.length + 2; guard++) {
    const step = planNextEscalation(config, state)
    if (step.done) {
      // Esgotou os níveis sem resposta → política onNoResponse.
      if (config.onNoResponse === 'NOTIFY_MANAGER' || config.onNoResponse === 'HOLD') {
        await notifyNoSellerAvailable({ tenantId, unitId, arrivalId, whatsapp: opts.whatsappManagers ?? false }).catch(() => {})
      }
      await logQueueEvent({ tenantId, unitId, queueId, type: 'TIMEOUT', actorId, arrivalId, reason: 'escalonamento esgotado — sem resposta' }).catch(() => {})
      return { escalated: false, exhausted: true }
    }

    const targets = await resolveLevelTargets({ tenantId, unitId, queueId, level: step.level })
    if (!targets.length) {
      // Nível sem alvo → pula direto para o próximo nível (não repete tentativa).
      state = { levelIndex: step.levelIndex, attempt: step.level.maxAttempts }
      continue
    }

    const now = new Date()
    const deadline = new Date(now.getTime() + step.timeoutSeconds * 1000)
    for (const uid of targets) {
      const att = await prisma.sellerQueueAttendance.create({
        data: { tenantId, unitId, queueId, sellerId: uid, arrivalId, status: 'CALLED', calledAt: now, acceptDeadline: deadline },
      })
      // Se estiver na rotação (WAITING), trava a entry (sai da fila enquanto chamado).
      await prisma.sellerQueueEntry.updateMany({ where: { queueId, sellerId: uid, status: 'WAITING', blocked: false }, data: { status: 'CALLED', lastActiveAt: now } }).catch(() => {})
      await logQueueEvent({ tenantId, unitId, queueId, type: 'CALLED', sellerId: uid, actorId, arrivalId, attendanceId: att.id, reason: `escalonamento nível ${step.levelIndex + 1} — ${step.level.name}` }).catch(() => {})
      await notifySellerCalled({ tenantId, sellerId: uid, timeoutSeconds: step.timeoutSeconds, attendanceId: att.id, arrivalId, customerName: opts.customerName ?? null, recurring: false, whatsapp: opts.whatsapp ?? false }).catch(() => {})
    }
    await prisma.sellerQueueCustomerArrival.update({ where: { id: arrivalId }, data: { status: 'CALLING', escalationLevel: step.levelIndex, escalationAttempt: step.attempt } })
    return { escalated: true, levelIndex: step.levelIndex, levelName: step.level.name, targets }
  }
  return { escalated: false, exhausted: true }
}
