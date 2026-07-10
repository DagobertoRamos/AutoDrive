// =============================================================================
// seller-queue/personal-queue.ts — FILA INDIVIDUAL do vendedor/gerente.
// "Fila dentro da fila": agendamento/retorno/pós-venda vinculados a um
// responsável que está ATENDENDO entram aqui (não furam a fila principal nem
// somem). Ao finalizar, o sistema sugere iniciar o próximo. Tudo tenant+unit
// scoped e auditado. FKs soft (como o resto do módulo).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { getOrCreateQueue, logQueueEvent, getUnitConfig } from '@/lib/seller-queue/queue'
import { notify, notifyByRole } from '@/services/notification.service'
import { notifySellerCalled } from '@/lib/seller-queue/notify'

export type PersonalItemType = 'AGENDAMENTO' | 'RETORNO' | 'POS_VENDA' | 'OUTRO'

export const PERSONAL_TYPE_LABEL: Record<PersonalItemType, string> = {
  AGENDAMENTO: 'Agendamento',
  RETORNO: 'Retorno',
  POS_VENDA: 'Pós-venda',
  OUTRO: 'Atendimento',
}

// Prioridade padrão por tipo (retorno urgente > agendamento > pós-venda > outro).
const DEFAULT_PRIORITY: Record<PersonalItemType, number> = {
  RETORNO: 30, AGENDAMENTO: 20, POS_VENDA: 10, OUTRO: 0,
}

const ACTIVE_STATUSES = ['AGUARDANDO', 'CHAMADO'] as const
const MANAGER_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']

export interface EnqueueOpts {
  tenantId: string
  unitId: string
  agentUserId: string
  itemType: PersonalItemType
  createdByUserId: string
  customerName?: string | null
  customerPhone?: string | null
  customerId?: string | null
  dealId?: string | null
  leadId?: string | null
  arrivalId?: string | null
  priority?: number | null
  source?: string | null
  notes?: string | null
}

/** Coloca um cliente na fila individual do responsável + notifica o responsável. */
export async function enqueuePersonalItem(opts: EnqueueOpts) {
  const item = await prisma.agentPersonalQueueItem.create({
    data: {
      tenantId: opts.tenantId,
      unitId: opts.unitId,
      agentUserId: opts.agentUserId,
      itemType: opts.itemType,
      status: 'AGUARDANDO',
      priority: opts.priority ?? DEFAULT_PRIORITY[opts.itemType],
      source: opts.source ?? null,
      customerName: opts.customerName ?? null,
      customerPhone: opts.customerPhone ?? null,
      customerId: opts.customerId ?? null,
      dealId: opts.dealId ?? null,
      leadId: opts.leadId ?? null,
      arrivalId: opts.arrivalId ?? null,
      notes: opts.notes ?? null,
      createdByUserId: opts.createdByUserId,
    },
  })

  const label = PERSONAL_TYPE_LABEL[opts.itemType]
  const who = opts.customerName ? `: ${opts.customerName}` : ''
  // Push REAL (FCM + Web Push) além do sininho — o vendedor pode estar em
  // atendimento com o app em 2º plano; precisa ser avisado como uma chamada normal.
  await notify({
    userId: opts.agentUserId, tenantId: opts.tenantId, type: 'INFO',
    title: `🔔 ${label} na sua fila`,
    message: `${label}${who} entrou na sua fila individual. A gestão libera o atendimento.`,
    actionUrl: '/vendedor-da-vez/minha-fila',
    metadata: { kind: 'personal_queue', priority: 'high' },
    channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'],
  }).catch(() => {})

  return item
}

interface PersonalRow {
  id: string; itemType: string; status: string; priority: number
  customerName: string | null; customerPhone: string | null
  dealId: string | null; leadId: string | null; source: string | null
  queuedAt: Date; agentUserId: string
}

function shapeItem(r: PersonalRow, nameOf?: (id: string) => string) {
  return {
    id: r.id,
    itemType: r.itemType,
    itemTypeLabel: PERSONAL_TYPE_LABEL[(r.itemType as PersonalItemType)] ?? r.itemType,
    status: r.status,
    priority: r.priority,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    dealId: r.dealId,
    leadId: r.leadId,
    source: r.source,
    queuedAt: r.queuedAt,
    waitingSeconds: Math.max(0, Math.floor((Date.now() - r.queuedAt.getTime()) / 1000)),
    agentUserId: r.agentUserId,
    agentName: nameOf ? nameOf(r.agentUserId) : undefined,
  }
}

/** Fila individual de UM responsável (AGUARDANDO/CHAMADO), por prioridade e chegada. */
export async function listPersonalQueueForAgent(tenantId: string, unitId: string, agentUserId: string) {
  const rows = await prisma.agentPersonalQueueItem.findMany({
    where: { tenantId, unitId, agentUserId, status: { in: [...ACTIVE_STATUSES] } },
    orderBy: [{ priority: 'desc' }, { queuedAt: 'asc' }],
    take: 100,
  })
  return rows.map((r) => shapeItem(r))
}

/** Filas individuais da UNIDADE inteira (visão do gerente), agrupadas por responsável. */
export async function listPersonalQueueForUnit(tenantId: string, unitId: string) {
  const rows = await prisma.agentPersonalQueueItem.findMany({
    where: { tenantId, unitId, status: { in: [...ACTIVE_STATUSES] } },
    orderBy: [{ priority: 'desc' }, { queuedAt: 'asc' }],
    take: 500,
  })
  const names = new Map<string, string>()
  if (rows.length) {
    const us = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.agentUserId))] } }, select: { id: true, name: true } })
    us.forEach((u) => names.set(u.id, u.name))
  }
  return rows.map((r) => shapeItem(r, (id) => names.get(id) ?? id))
}

export async function isAgentBusy(tenantId: string, unitId: string, queueId: string, agentUserId: string): Promise<boolean> {
  const active = await prisma.sellerQueueAttendance.findFirst({
    where: { queueId, sellerId: agentUserId, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } },
    orderBy: { calledAt: 'desc' },
  })
  if (!active) return false
  if (active.status === 'CALLED' || active.status === 'ACCEPTED') return true

  try {
    let tid = tenantId || active.tenantId
    let uid = unitId || active.unitId
    if (!tid || !uid) {
      const queue = await prisma.sellerQueue.findUnique({ where: { id: queueId }, select: { tenantId: true, unitId: true } })
      if (queue) {
        tid = tid || queue.tenantId
        uid = uid || queue.unitId
      }
    }

    if (tid && uid) {
      const ucfg = await prisma.sellerQueueUnitConfig.findUnique({ where: { tenantId_unitId: { tenantId: tid, unitId: uid } } })
      const config = (ucfg?.config as any) || {}
      const allowWait = config.allowWaitWithOpenAttendance ?? 'NO'
      if (allowWait === 'YES') {
        return false
      }
      if (allowWait === 'QUICK_ONLY') {
        if (active.visitType === 'INFORMACAO_RAPIDA') {
          const limit = typeof config.infoRapidaTimeLimitMinutes === 'number' ? config.infoRapidaTimeLimitMinutes : 3
          const durationMin = (Date.now() - new Date(active.startedAt ?? active.calledAt).getTime()) / 60000
          if (durationMin <= limit) {
            return false
          }
        }
      }
    }
  } catch (err) {
    console.error('[isAgentBusy] Erro ao ler config:', err)
  }

  return true
}

export type AgentQueueState = 'FREE' | 'BUSY' | 'PAUSED' | 'AWAY'

/** Estado do responsável na fila do dia — decide se chama na hora (FREE) ou
 *  enfileira (BUSY/PAUSED/AWAY). PAUSED/AWAY também avisa a gestão. */
export async function getAgentQueueState(queueId: string, agentUserId: string): Promise<AgentQueueState> {
  if (await isAgentBusy('', '', queueId, agentUserId)) return 'BUSY'
  const pendingCount = await prisma.agentPersonalQueueItem.count({
    where: { agentUserId, status: { in: ['AGUARDANDO', 'CHAMADO'] } }
  })
  if (pendingCount > 0) return 'BUSY'
  const entry = await prisma.sellerQueueEntry.findUnique({
    where: { queueId_sellerId: { queueId, sellerId: agentUserId } },
    select: { status: true, blocked: true },
  })
  if (!entry || entry.status === 'LEFT') return 'AWAY'
  if (entry.blocked || entry.status === 'PAUSED') return 'PAUSED'
  if (entry.status === 'WAITING' || entry.status === 'NEXT') return 'FREE'
  return 'BUSY'
}

/** Inicia o atendimento de um item da fila individual. Cria o atendimento e
 *  marca o responsável como IN_ATTENDANCE. Só o próprio responsável ou a gestão. */
export async function startPersonalItem(opts: {
  tenantId: string; unitId: string; itemId: string; actorId: string; actorRole: string; canOperate?: boolean
}): Promise<{ ok: boolean; reason?: string; attendanceId?: string }> {
  const item = await prisma.agentPersonalQueueItem.findUnique({ where: { id: opts.itemId } })
  if (!item || item.tenantId !== opts.tenantId) return { ok: false, reason: 'Item não encontrado.' }
  if (!ACTIVE_STATUSES.includes(item.status as typeof ACTIVE_STATUSES[number])) return { ok: false, reason: 'Este item não está aguardando.' }
  // Pode iniciar: o dono do item (vendedor chamado), a gestão, ou quem tem o
  // flag `canPullPersonalQueue` no cadastro (líder/vendedor autorizado).
  const canOperate = MANAGER_ROLES.includes(opts.actorRole) || opts.canOperate === true
  if (item.agentUserId !== opts.actorId && !canOperate) return { ok: false, reason: 'Apenas o responsável, quem tem permissão de operar a fila, ou a gestão pode iniciar.' }

  const queue = await getOrCreateQueue(opts.tenantId, item.unitId)
  // Não deixa o responsável em dois atendimentos ao mesmo tempo.
  if (await isAgentBusy(opts.tenantId, item.unitId, queue.id, item.agentUserId)) {
    return { ok: false, reason: 'O responsável já está em atendimento.' }
  }

  const now = new Date()
  const attId = await prisma.$transaction(async (tx) => {
    const att = await tx.sellerQueueAttendance.create({
      data: {
        tenantId: opts.tenantId, unitId: item.unitId, queueId: queue.id, sellerId: item.agentUserId,
        arrivalId: item.arrivalId ?? null, status: 'IN_ATTENDANCE',
        calledAt: now, acceptedAt: now, startedAt: now,
        leadId: item.leadId ?? null, dealId: item.dealId ?? null, customerId: item.customerId ?? null,
        createdById: opts.actorId,
      },
    })
    // Se estiver na fila principal aguardando, sai da fila enquanto atende.
    await tx.sellerQueueEntry.updateMany({
      where: { queueId: queue.id, sellerId: item.agentUserId, status: { in: ['WAITING', 'NEXT'] }, blocked: false },
      data: { status: 'IN_ATTENDANCE', lastActiveAt: now },
    })
    await tx.agentPersonalQueueItem.update({ where: { id: item.id }, data: { status: 'EM_ATENDIMENTO', startedAt: now, attendanceId: att.id } })
    return att.id
  })

  await logQueueEvent({ tenantId: opts.tenantId, unitId: item.unitId, queueId: queue.id, type: 'ATTENDANCE_STARTED', sellerId: item.agentUserId, actorId: opts.actorId, attendanceId: attId, reason: `fila individual (${PERSONAL_TYPE_LABEL[item.itemType as PersonalItemType]})` })
  return { ok: true, attendanceId: attId }
}

/** Transfere um item para outro responsável (gestão). O novo responsável é notificado. */
export async function transferPersonalItem(opts: {
  tenantId: string; itemId: string; toUserId: string; actorId: string
}): Promise<{ ok: boolean; reason?: string }> {
  const item = await prisma.agentPersonalQueueItem.findUnique({ where: { id: opts.itemId } })
  if (!item || item.tenantId !== opts.tenantId) return { ok: false, reason: 'Item não encontrado.' }
  if (!ACTIVE_STATUSES.includes(item.status as typeof ACTIVE_STATUSES[number])) return { ok: false, reason: 'Só é possível transferir itens aguardando.' }
  const target = await prisma.user.findUnique({ where: { id: opts.toUserId }, select: { tenantId: true, unitId: true, status: true } })
  if (!target || target.tenantId !== opts.tenantId || target.unitId !== item.unitId || target.status !== 'ATIVO') {
    return { ok: false, reason: 'Colaborador inválido para esta unidade.' }
  }
  await prisma.agentPersonalQueueItem.update({
    where: { id: item.id },
    data: { agentUserId: opts.toUserId, transferredToUserId: opts.toUserId, status: 'AGUARDANDO', notes: item.notes },
  })
  await notify({
    userId: opts.toUserId, tenantId: opts.tenantId, type: 'WARNING',
    title: 'Atendimento transferido para você',
    message: `A gestão transferiu um ${PERSONAL_TYPE_LABEL[item.itemType as PersonalItemType]}${item.customerName ? `: ${item.customerName}` : ''} para a sua fila.`,
    actionUrl: '/vendedor-da-vez/minha-fila', channels: ['APP_WEB'],
  }).catch(() => {})
  return { ok: true }
}

/** Cancela um item (o próprio responsável ou a gestão). */
export async function cancelPersonalItem(opts: { tenantId: string; itemId: string; actorId: string; actorRole: string; canOperate?: boolean }): Promise<{ ok: boolean; reason?: string }> {
  const item = await prisma.agentPersonalQueueItem.findUnique({ where: { id: opts.itemId } })
  if (!item || item.tenantId !== opts.tenantId) return { ok: false, reason: 'Item não encontrado.' }
  if (!ACTIVE_STATUSES.includes(item.status as typeof ACTIVE_STATUSES[number])) return { ok: false, reason: 'Este item não pode ser cancelado.' }
  if (item.agentUserId !== opts.actorId && !MANAGER_ROLES.includes(opts.actorRole) && opts.canOperate !== true) return { ok: false, reason: 'Sem permissão.' }
  await prisma.agentPersonalQueueItem.update({ where: { id: item.id }, data: { status: 'CANCELADO', finishedAt: new Date() } })
  return { ok: true }
}

/** Muda a prioridade de um item (o próprio responsável ou a gestão). */
export async function setPersonalItemPriority(opts: { tenantId: string; itemId: string; priority: number; actorId: string; actorRole: string; canOperate?: boolean }): Promise<{ ok: boolean; reason?: string; priority?: number }> {
  const item = await prisma.agentPersonalQueueItem.findUnique({ where: { id: opts.itemId } })
  if (!item || item.tenantId !== opts.tenantId) return { ok: false, reason: 'Item não encontrado.' }
  if (!ACTIVE_STATUSES.includes(item.status as typeof ACTIVE_STATUSES[number])) return { ok: false, reason: 'Este item não está aguardando.' }
  if (item.agentUserId !== opts.actorId && !MANAGER_ROLES.includes(opts.actorRole) && opts.canOperate !== true) return { ok: false, reason: 'Sem permissão.' }
  const priority = Math.max(0, Math.min(100, Math.round(opts.priority)))
  await prisma.agentPersonalQueueItem.update({ where: { id: item.id }, data: { priority } })
  return { ok: true, priority }
}

/** Reagenda (atender depois): manda o item para o FIM da fila individual do
 *  responsável, sem perdê-lo (reseta a chegada e zera a prioridade). */
export async function reschedulePersonalItem(opts: { tenantId: string; itemId: string; actorId: string; actorRole: string; canOperate?: boolean }): Promise<{ ok: boolean; reason?: string }> {
  const item = await prisma.agentPersonalQueueItem.findUnique({ where: { id: opts.itemId } })
  if (!item || item.tenantId !== opts.tenantId) return { ok: false, reason: 'Item não encontrado.' }
  if (!ACTIVE_STATUSES.includes(item.status as typeof ACTIVE_STATUSES[number])) return { ok: false, reason: 'Só é possível reagendar itens aguardando.' }
  if (item.agentUserId !== opts.actorId && !MANAGER_ROLES.includes(opts.actorRole) && opts.canOperate !== true) return { ok: false, reason: 'Sem permissão.' }
  await prisma.agentPersonalQueueItem.update({ where: { id: item.id }, data: { status: 'AGUARDANDO', priority: 0, queuedAt: new Date() } })
  return { ok: true }
}

/** Ao FINALIZAR um atendimento, conclui o item da fila individual correspondente
 *  (se houver) — mantém a fila individual consistente com o ciclo de atendimento. */
export async function concludePersonalItemByAttendance(attendanceId: string): Promise<void> {
  await prisma.agentPersonalQueueItem.updateMany({
    where: { attendanceId, status: { in: ['CHAMADO', 'EM_ATENDIMENTO'] } },
    data: { status: 'CONCLUIDO', finishedAt: new Date() },
  }).catch(() => {})
}

const ITEM_TO_VISIT: Record<PersonalItemType, string> = {
  AGENDAMENTO: 'AGENDAMENTO', RETORNO: 'RETORNO', POS_VENDA: 'POS_VENDA', OUTRO: 'OUTRO',
}

/**
 * TOCA para o vendedor aceitar o PRÓXIMO cliente da sua fila individual: cria um
 * atendimento CALLED (com prazo de aceite) e dispara o alerta/push — igual a uma
 * chamada normal. Usado ao FINALIZAR um atendimento quando ainda há itens na fila
 * individual (o vendedor só volta à fila principal quando ela zera). Não toca se
 * já houver atendimento ativo. Retorna { called, attendanceId, itemId }.
 */
export async function callNextPersonalItem(opts: {
  tenantId: string; unitId: string; agentUserId: string; actorId: string
}): Promise<{ called: boolean; attendanceId?: string; itemId?: string }> {
  const item = await prisma.agentPersonalQueueItem.findFirst({
    where: { tenantId: opts.tenantId, unitId: opts.unitId, agentUserId: opts.agentUserId, status: 'AGUARDANDO' },
    orderBy: [{ priority: 'desc' }, { queuedAt: 'asc' }],
  })
  if (!item) return { called: false }

  const queue = await getOrCreateQueue(opts.tenantId, opts.unitId)
  const busy = await prisma.sellerQueueAttendance.findFirst({
    where: { queueId: queue.id, sellerId: opts.agentUserId, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } },
    select: { id: true },
  })
  if (busy) return { called: false }

  const cfg = await getUnitConfig(opts.tenantId, opts.unitId).catch(() => null)
  const timeout = cfg?.acceptTimeoutSeconds ?? 60
  const now = new Date()
  const att = await prisma.sellerQueueAttendance.create({
    data: {
      tenantId: opts.tenantId, unitId: opts.unitId, queueId: queue.id, sellerId: opts.agentUserId,
      arrivalId: item.arrivalId ?? null, visitType: ITEM_TO_VISIT[item.itemType as PersonalItemType] ?? 'OUTRO',
      status: 'CALLED', calledAt: now, acceptDeadline: new Date(now.getTime() + timeout * 1000),
      leadId: item.leadId ?? null, dealId: item.dealId ?? null, customerId: item.customerId ?? null,
      createdById: opts.actorId,
    },
  })
  await prisma.agentPersonalQueueItem.update({ where: { id: item.id }, data: { status: 'CHAMADO', attendanceId: att.id } })
  // Sai da rotação principal: fica CALLED (aguardando o próprio aceite).
  await prisma.sellerQueueEntry.updateMany({ where: { queueId: queue.id, sellerId: opts.agentUserId }, data: { status: 'CALLED', lastActiveAt: now } }).catch(() => {})
  await logQueueEvent({ tenantId: opts.tenantId, unitId: opts.unitId, queueId: queue.id, type: 'CALLED', sellerId: opts.agentUserId, actorId: opts.actorId, attendanceId: att.id, reason: `fila individual (${item.itemType})` })
  await notifySellerCalled({ tenantId: opts.tenantId, sellerId: opts.agentUserId, timeoutSeconds: timeout, attendanceId: att.id, arrivalId: item.arrivalId, customerName: item.customerName, recurring: item.itemType === 'RETORNO' }).catch(() => {})
  return { called: true, attendanceId: att.id, itemId: item.id }
}

/** Avisa a gestão quando um item cai numa fila individual de quem está fora/pausado. */
export async function notifyManagersPersonalUnavailable(opts: { tenantId: string; unitId: string; agentName: string; itemType: PersonalItemType }): Promise<void> {
  await notifyByRole({
    tenantId: opts.tenantId, unitId: opts.unitId, roles: MANAGER_ROLES, type: 'WARNING',
    title: 'Cliente aguardando responsável indisponível',
    message: `${PERSONAL_TYPE_LABEL[opts.itemType]} entrou na fila de ${opts.agentName}, que está fora/pausado. Verifique no Painel.`,
    actionUrl: '/vendedor-da-vez/painel', channels: ['APP_WEB'],
  }).catch(() => {})
}
