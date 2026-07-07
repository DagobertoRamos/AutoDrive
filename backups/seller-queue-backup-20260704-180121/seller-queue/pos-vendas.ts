// =============================================================================
// seller-queue/pos-vendas.ts — fluxo de PÓS-VENDAS.
// Colaborador entra em pós-vendas → fica PAUSADO na fila (mantém a posição) e
// os outros passam na frente. Ao terminar, ele PEDE para voltar; um superior
// AUTORIZA e ele volta à MESMA posição (a entry preserva o `position`). Tudo
// best-effort nas notificações; ações registradas pelas rotas (auditoria).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { queueDate, logQueueEvent } from './queue'
import { notify, notifyByRole } from '@/services/notification.service'

const MANAGER_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER']

async function todayQueueId(tenantId: string, unitId: string): Promise<string | null> {
  const q = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
  return q?.id ?? null
}

export interface PosVendaState { id: string; status: string; returnRequestedAt: Date | null; createdAt: Date }

/** Sessão de pós-vendas ATIVA/aguardando do colaborador (ou null). */
export async function getActivePosVenda(tenantId: string, unitId: string, sellerId: string): Promise<PosVendaState | null> {
  const qid = await todayQueueId(tenantId, unitId)
  if (!qid) return null
  const r = await prisma.sellerQueuePosVenda.findFirst({
    where: { queueId: qid, sellerId, status: { in: ['ACTIVE', 'RETURN_REQUESTED'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, returnRequestedAt: true, createdAt: true },
  })
  return r
}

/** Inicia o pós-vendas: pausa o colaborador na fila (mantém posição). */
export async function startPosVenda(opts: { tenantId: string; unitId: string; sellerId: string; startedById: string }): Promise<{ ok: boolean; reason?: string }> {
  const { tenantId, unitId, sellerId, startedById } = opts
  const qid = await todayQueueId(tenantId, unitId)
  if (!qid) return { ok: false, reason: 'Fila não iniciada hoje.' }
  const entry = await prisma.sellerQueueEntry.findUnique({ where: { queueId_sellerId: { queueId: qid, sellerId } }, select: { id: true, status: true, blocked: true } })
  if (!entry) return { ok: false, reason: 'Colaborador não está na fila.' }
  if (entry.blocked) return { ok: false, reason: 'Colaborador bloqueado na fila.' }
  const existing = await prisma.sellerQueuePosVenda.findFirst({ where: { queueId: qid, sellerId, status: { in: ['ACTIVE', 'RETURN_REQUESTED'] } }, select: { id: true } })
  if (existing) return { ok: false, reason: 'Colaborador já está em pós-vendas.' }

  await prisma.$transaction([
    prisma.sellerQueueEntry.update({ where: { id: entry.id }, data: { status: 'PAUSED', pausedAt: new Date() } }),
    prisma.sellerQueuePosVenda.create({ data: { tenantId, unitId, queueId: qid, sellerId, startedById, status: 'ACTIVE' } }),
  ])
  await logQueueEvent({ tenantId, unitId, queueId: qid, type: 'PAUSE', sellerId, actorId: startedById, reason: 'pós-vendas' })
  await notify({ userId: sellerId, tenantId, type: 'WARNING', title: 'Pós-vendas 🛠️', message: 'Você entrou em pós-vendas e está pausado na fila. Ao terminar, peça para voltar à fila.', actionUrl: '/vendedor-da-vez/minha-fila', channels: ['APP_WEB'] }).catch(() => {})
  return { ok: true }
}

/** Colaborador pede para voltar à fila → avisa os superiores. */
export async function requestReturn(tenantId: string, unitId: string, sellerId: string): Promise<{ ok: boolean; reason?: string }> {
  const rec = await getActivePosVenda(tenantId, unitId, sellerId)
  if (!rec) return { ok: false, reason: 'Você não está em pós-vendas.' }
  if (rec.status === 'RETURN_REQUESTED') return { ok: true }
  await prisma.sellerQueuePosVenda.update({ where: { id: rec.id }, data: { status: 'RETURN_REQUESTED', returnRequestedAt: new Date() } })
  const seller = await prisma.user.findUnique({ where: { id: sellerId }, select: { name: true } }).catch(() => null)
  await notifyByRole({ tenantId, unitId, roles: MANAGER_ROLES, type: 'WARNING', title: 'Retorno de pós-vendas', message: `${seller?.name ?? 'Um colaborador'} terminou o pós-vendas e pede para voltar à fila. Autorize no Painel.`, actionUrl: '/vendedor-da-vez/painel', metadata: { kind: 'pos_venda_return', sellerId }, channels: ['APP_WEB'] }).catch(() => {})
  return { ok: true }
}

/** Superior autoriza o retorno → colaborador volta à MESMA posição. */
export async function authorizeReturn(tenantId: string, unitId: string, sellerId: string, authorizedById: string): Promise<{ ok: boolean; reason?: string }> {
  const qid = await todayQueueId(tenantId, unitId)
  if (!qid) return { ok: false, reason: 'Fila não iniciada.' }
  const rec = await prisma.sellerQueuePosVenda.findFirst({ where: { queueId: qid, sellerId, status: { in: ['ACTIVE', 'RETURN_REQUESTED'] } }, orderBy: { createdAt: 'desc' }, select: { id: true } })
  if (!rec) return { ok: false, reason: 'Sem pós-vendas ativo para este colaborador.' }
  const entry = await prisma.sellerQueueEntry.findUnique({ where: { queueId_sellerId: { queueId: qid, sellerId } }, select: { id: true, status: true } })
  await prisma.$transaction([
    prisma.sellerQueuePosVenda.update({ where: { id: rec.id }, data: { status: 'DONE', authorizedById } }),
    // volta à MESMA posição: a entry preserva o `position`; só reativa o status
    ...(entry && entry.status === 'PAUSED' ? [prisma.sellerQueueEntry.update({ where: { id: entry.id }, data: { status: 'WAITING', pausedAt: null } })] : []),
  ])
  await logQueueEvent({ tenantId, unitId, queueId: qid, type: 'RESUME', sellerId, actorId: authorizedById, reason: 'retorno de pós-vendas autorizado' })
  await notify({ userId: sellerId, tenantId, type: 'WARNING', title: 'De volta à fila ✅', message: 'Seu retorno do pós-vendas foi autorizado — você voltou à sua posição.', actionUrl: '/vendedor-da-vez/minha-fila', channels: ['APP_WEB'] }).catch(() => {})
  return { ok: true }
}

/** Lista pós-vendas em aberto (para a gestão autorizar no Painel). */
export async function listPosVendas(tenantId: string, unitId: string) {
  const qid = await todayQueueId(tenantId, unitId)
  if (!qid) return []
  const recs = await prisma.sellerQueuePosVenda.findMany({ where: { queueId: qid, status: { in: ['ACTIVE', 'RETURN_REQUESTED'] } }, orderBy: { createdAt: 'asc' }, select: { sellerId: true, status: true, returnRequestedAt: true, createdAt: true } })
  if (!recs.length) return []
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(recs.map((r) => r.sellerId))] } }, select: { id: true, name: true } })
  const nameOf = new Map(users.map((u) => [u.id, u.name]))
  return recs.map((r) => ({ sellerId: r.sellerId, name: nameOf.get(r.sellerId) ?? r.sellerId, status: r.status, returnRequestedAt: r.returnRequestedAt, since: r.createdAt }))
}
