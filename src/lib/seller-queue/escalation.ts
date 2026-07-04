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
  nextActiveLevelIndex,
} from './escalation-config'

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
