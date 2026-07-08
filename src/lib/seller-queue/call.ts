// =============================================================================
// seller-queue/call.ts — chama o "vendedor da vez" para um cliente que chegou.
// LOCK TRANSACIONAL: o candidato só é chamado se sua entry ainda estiver WAITING
// (updateMany compare-and-set) — evita chamar 2 vendedores p/ o mesmo cliente ou
// o mesmo vendedor p/ 2 clientes. Cria o atendimento (CALLED) com prazo de aceite
// e NOTIFICA o vendedor. Quem registra o cliente NÃO escolhe quem atende.
// =============================================================================

import { prisma } from '../prisma'
import { getUnitConfig, logQueueEvent } from './queue'
import { notifySellerCalled, notifyNoSellerAvailable } from './notify'
import { escalateAfterTimeout } from './penalty'
import { readEscalationConfig } from './escalation-config'
import { escalateArrival } from './escalation'
import { getParticipant } from './participants'
import { canTransitionQueueEntryStatus } from './state-machine'

export interface CallResult {
  ok: boolean
  attendanceId?: string
  sellerId?: string
  reason?: string
}

/**
 * Chama o próximo vendedor elegível para o `arrivalId`.
 * `preferSellerId` (responsável/override) é tentado primeiro, se estiver WAITING.
 */
export async function callForArrival(opts: {
  tenantId: string
  unitId: string
  queueId: string
  arrivalId: string
  actorId: string
  preferSellerId?: string | null
  reason?: string | null
  customerName?: string | null
  recurring?: boolean
}): Promise<CallResult> {
  const cfg = await getUnitConfig(opts.tenantId, opts.unitId)
  const timeout = cfg?.acceptTimeoutSeconds ?? 60

  // Trava e cria a chamada para um colaborador (vendedor ou gerente-fallback).
  // entryId != null → exige a entry WAITING (rotação). entryId null → gerente
  // fora da rotação (best-effort: tira da fila se por acaso estiver WAITING).
  const tryCall = async (entryId: string | null, sellerId: string, reason: string | null, recurring: boolean): Promise<CallResult | null> => {
    const now = new Date()
    const deadline = new Date(now.getTime() + timeout * 1000)
    const result = await prisma.$transaction(async (tx) => {
      if (entryId) {
        const current = await tx.sellerQueueEntry.findUnique({ where: { id: entryId }, select: { status: true } })
        if (!current || !canTransitionQueueEntryStatus(current.status, 'CALLED')) return null
        const upd = await tx.sellerQueueEntry.updateMany({ where: { id: entryId, status: current.status, blocked: false }, data: { status: 'CALLED', lastActiveAt: now } })
        if (upd.count !== 1) return null // perdeu a corrida
      } else {
        const current = await tx.sellerQueueEntry.findFirst({ where: { queueId: opts.queueId, sellerId, status: { in: ['WAITING', 'NEXT'] } }, select: { status: true } })
        if (!current || !canTransitionQueueEntryStatus(current.status, 'CALLED')) return null
        await tx.sellerQueueEntry.updateMany({ where: { queueId: opts.queueId, sellerId, status: current.status, blocked: false }, data: { status: 'CALLED', lastActiveAt: now } })
      }
      const att = await tx.sellerQueueAttendance.create({
        data: { tenantId: opts.tenantId, unitId: opts.unitId, queueId: opts.queueId, sellerId, arrivalId: opts.arrivalId, status: 'CALLED', calledAt: now, acceptDeadline: deadline },
      })
      await tx.sellerQueueCustomerArrival.update({ where: { id: opts.arrivalId }, data: { status: 'CALLING' } })
      return att
    })
    if (!result) return null
    await logQueueEvent({ tenantId: opts.tenantId, unitId: opts.unitId, queueId: opts.queueId, type: 'CALLED', sellerId, actorId: opts.actorId, arrivalId: opts.arrivalId, attendanceId: result.id, reason, metadata: { transition: 'CALLED', source: 'callForArrival' } })
    await notifySellerCalled({ tenantId: opts.tenantId, sellerId, timeoutSeconds: timeout, attendanceId: result.id, arrivalId: opts.arrivalId, customerName: opts.customerName ?? null, recurring, whatsapp: cfg?.alertWhatsapp ?? false })
    return { ok: true, attendanceId: result.id, sellerId }
  }

  // Candidatos: WAITING, não bloqueados, por posição. Preferido vai à frente.
  const waiting = await prisma.sellerQueueEntry.findMany({
    where: { queueId: opts.queueId, status: 'WAITING', blocked: false },
    orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
    select: { id: true, sellerId: true },
  })
  // Cargo de cada candidato (entry.sellerId = userId; o GERENTE fica FORA da
  // rotação normal — só é acionado no fallback quando não há vendedor).
  const cargoByUser = new Map<string, string>()
  if (waiting.length) {
    const recs = await prisma.seller.findMany({ where: { userId: { in: waiting.map((w) => w.sellerId) } }, select: { userId: true, cargo: true } })
    recs.forEach((r) => cargoByUser.set(r.userId, r.cargo ?? 'VENDEDOR'))
  }
  const ordered = opts.preferSellerId
    ? [...waiting.filter((w) => w.sellerId === opts.preferSellerId), ...waiting.filter((w) => w.sellerId !== opts.preferSellerId)]
    : waiting

  // Exclui vendedores que possuem itens pendentes/ativos em sua fila individual (estão ocupados com a própria fila)
  const busySellers = await prisma.agentPersonalQueueItem.findMany({
    where: { tenantId: opts.tenantId, unitId: opts.unitId, status: { in: ['AGUARDANDO', 'CHAMADO'] } },
    select: { agentUserId: true }
  })
  const busyIds = new Set(busySellers.map((b) => b.agentUserId))

  // Rotação regular = vendedores (exclui GERENTE), mas honra o preferido específico, excluindo quem tem pendência individual.
  const regular = ordered.filter((w) => 
    (w.sellerId === opts.preferSellerId || cargoByUser.get(w.sellerId) !== 'GERENTE') &&
    !busyIds.has(w.sellerId)
  )

  // Participação (config por colaborador): só chama quem PODE ser vendedor da vez.
  // Padrão retrocompatível: sem config, canBeVez=true → não muda nada.
  const eligible = regular.filter((w) => getParticipant(cfg?.config, w.sellerId).canBeVez !== false)

  // 1) Tenta um vendedor disponível.
  for (const cand of eligible) {
    const res = await tryCall(cand.id, cand.sellerId, opts.reason ?? null, opts.recurring ?? false)
    if (res) return res
  }

  // 2) FALLBACK: nenhum vendedor disponível → aciona um GERENTE da unidade (o
  // cliente tem prioridade). O gerente atende e depois verifica o que houve.
  const gerentes = await prisma.seller.findMany({ where: { unitId: opts.unitId, cargo: 'GERENTE', active: true }, select: { userId: true } })
  for (const g of gerentes) {
    const busy = await prisma.sellerQueueAttendance.findFirst({ where: { queueId: opts.queueId, sellerId: g.userId, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } }, select: { id: true } })
    if (busy) continue
    const res = await tryCall(null, g.userId, 'fallback — nenhum vendedor disponível: gerente acionado', false)
    if (res) return res
  }

  // 3) Ninguém disponível (nem gerente) → avisa a gestão.
  await notifyNoSellerAvailable({ tenantId: opts.tenantId, unitId: opts.unitId, arrivalId: opts.arrivalId, whatsapp: cfg?.alertWhatsappManagers ?? false })
  return { ok: false, reason: 'Nenhum vendedor nem gerente disponível na fila.' }
}

/**
 * Expiração NO SERVIDOR dos chamados vencidos (não depende do navegador do
 * vendedor disparar o /timeout). Varre os atendimentos CALLED com prazo vencido
 * e, para cada um (de forma atômica): marca EXPIRED, move o vendedor ao fim,
 * registra a perda, escala (avisa/cooldown/bloqueia) e CHAMA O PRÓXIMO (ou o
 * gerente no fallback). Idempotente e seguro p/ concorrência (compare-and-set).
 * Chamado "lazy" no /current — toda tela aberta cura a fila e PARA o alarme do
 * vendedor que perdeu (a tela dele vê o atendimento sair de CALLED).
 */
export async function sweepExpiredCalls(opts: { tenantId: string; unitId: string; queueId: string; actorId: string }): Promise<void> {
  const now = new Date()
  const stale = await prisma.sellerQueueAttendance.findMany({
    where: { queueId: opts.queueId, status: 'CALLED', acceptDeadline: { lt: now } },
    select: { id: true, sellerId: true, unitId: true, arrivalId: true },
  })
  if (!stale.length) return
  const cfg = await getUnitConfig(opts.tenantId, opts.unitId)
  for (const att of stale) {
    let claimed = false
    await prisma.$transaction(async (tx) => {
      // Compare-and-set: só processa se AINDA estiver CALLED (evita corrida).
      const upd = await tx.sellerQueueAttendance.updateMany({ where: { id: att.id, status: 'CALLED' }, data: { status: 'EXPIRED' } })
      if (upd.count !== 1) return
      claimed = true
      // Move o vendedor para o fim da fila (se ainda estiver na fila).
      const agg = await tx.sellerQueueEntry.aggregate({ where: { queueId: opts.queueId }, _max: { position: true } })
      await tx.sellerQueueEntry.updateMany({ where: { queueId: opts.queueId, sellerId: att.sellerId, status: { in: ['CALLED', 'NEXT'] } }, data: { status: 'WAITING', position: (agg._max.position ?? 0) + 1, lastActiveAt: now } })
      await tx.sellerQueuePenalty.create({ data: { tenantId: opts.tenantId, unitId: att.unitId, sellerId: att.sellerId, type: 'TIMEOUT', reason: 'Não aceitou no prazo (auto)', points: 1, appliedById: opts.actorId } })
      if (att.arrivalId) await tx.sellerQueueCustomerArrival.update({ where: { id: att.arrivalId }, data: { status: 'PENDING' } })
    })
    if (!claimed) continue
    await logQueueEvent({ tenantId: opts.tenantId, unitId: att.unitId, queueId: opts.queueId, type: 'TIMEOUT', sellerId: att.sellerId, actorId: opts.actorId, arrivalId: att.arrivalId, attendanceId: att.id, reason: 'auto-expiração (servidor)' })
    await logQueueEvent({ tenantId: opts.tenantId, unitId: att.unitId, queueId: opts.queueId, type: 'MOVED_TO_END', sellerId: att.sellerId, actorId: opts.actorId, attendanceId: att.id })
    // Escala (avisa/cooldown/bloqueia conforme as perdas do dia) — pode remover
    // o vendedor da fila (ex.: 1 perda já bloqueia, conforme a config da loja).
    await escalateAfterTimeout({ tenantId: opts.tenantId, unitId: att.unitId, queueId: opts.queueId, sellerId: att.sellerId, whatsapp: cfg?.alertWhatsappManagers ?? false }).catch(() => {})
    // Avança a fila. Com ESCALONAMENTO ativo, sobe o próximo nível configurado
    // (líder → gerente → GG → …); sem escalonamento, mantém o comportamento
    // atual (chama o próximo da rotação / fallback gerente).
    if (att.arrivalId) {
      const arrival = await prisma.sellerQueueCustomerArrival.findUnique({ where: { id: att.arrivalId }, select: { customerName: true, recurring: true, status: true } })
      if (arrival && arrival.status === 'PENDING') {
        const esc = readEscalationConfig(cfg?.config)
        if (esc.active) {
          await escalateArrival({ tenantId: opts.tenantId, unitId: att.unitId, queueId: opts.queueId, arrivalId: att.arrivalId, actorId: opts.actorId, config: esc, customerName: arrival.customerName, whatsapp: cfg?.alertWhatsapp ?? false, whatsappManagers: cfg?.alertWhatsappManagers ?? false }).catch(() => {})
        } else {
          await callForArrival({ tenantId: opts.tenantId, unitId: att.unitId, queueId: opts.queueId, arrivalId: att.arrivalId, actorId: opts.actorId, reason: 'timeout (auto)', customerName: arrival.customerName, recurring: arrival.recurring }).catch(() => {})
        }
      }
    }
  }
}

/**
 * Chama um colaborador ESPECÍFICO (responsável / pós-vendas / superior), esteja
 * ele na fila ou não. Se estiver WAITING, "trava" a entry (sai da fila); se não,
 * cria uma chamada fora-da-fila. Recusa se ele já estiver em atendimento.
 * Sempre registra evento + auditoria (antifraude). `reason` é gravado no log.
 */
export async function callSpecificSeller(opts: {
  tenantId: string
  unitId: string
  queueId: string
  arrivalId: string
  actorId: string
  sellerId: string
  reason?: string | null
  customerName?: string | null
}): Promise<CallResult> {
  const cfg = await getUnitConfig(opts.tenantId, opts.unitId)
  const timeout = cfg?.acceptTimeoutSeconds ?? 60

  // Não chama quem já está ocupado (evita dois atendimentos no mesmo vendedor).
  const busy = await prisma.sellerQueueAttendance.findFirst({
    where: { queueId: opts.queueId, sellerId: opts.sellerId, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } },
    select: { id: true },
  })
  if (busy) return { ok: false, reason: 'Este colaborador já está em atendimento.' }

  const now = new Date()
  const result = await prisma.$transaction(async (tx) => {
    // Tenta tirar da fila se estiver na fila e não bloqueado.
    const locked = await tx.sellerQueueEntry.updateMany({
      where: { queueId: opts.queueId, sellerId: opts.sellerId, blocked: false },
      data: { status: 'IN_ATTENDANCE', lastActiveAt: now },
    })
    const count = await tx.sellerQueueEntry.count({ where: { queueId: opts.queueId, sellerId: opts.sellerId } })
    if (count === 0) {
      await tx.sellerQueueEntry.create({
        data: {
          tenantId: opts.tenantId,
          unitId: opts.unitId,
          queueId: opts.queueId,
          sellerId: opts.sellerId,
          status: 'IN_ATTENDANCE',
          lastActiveAt: now,
        }
      })
    }
    const att = await tx.sellerQueueAttendance.create({
      data: {
        tenantId: opts.tenantId, unitId: opts.unitId, queueId: opts.queueId, sellerId: opts.sellerId,
        arrivalId: opts.arrivalId, status: 'IN_ATTENDANCE', calledAt: now, startedAt: now, acceptedAt: now,
      },
    })
    await tx.sellerQueueCustomerArrival.update({ where: { id: opts.arrivalId }, data: { status: 'IN_ATTENDANCE' } })
    return { att, fromQueue: locked.count === 1 }
  })

  await logQueueEvent({ tenantId: opts.tenantId, unitId: opts.unitId, queueId: opts.queueId, type: 'ATTENDANCE_STARTED', sellerId: opts.sellerId, actorId: opts.actorId, arrivalId: opts.arrivalId, attendanceId: result.att.id, reason: opts.reason ?? (result.fromQueue ? 'chamada específica (em atendimento)' : 'chamada específica (fora da fila, em atendimento)') })
  await notifySellerCalled({ tenantId: opts.tenantId, sellerId: opts.sellerId, timeoutSeconds: timeout, attendanceId: result.att.id, arrivalId: opts.arrivalId, customerName: opts.customerName ?? null, recurring: true, whatsapp: cfg?.alertWhatsapp ?? false })

  return { ok: true, attendanceId: result.att.id, sellerId: opts.sellerId }
}

/**
 * AGENDAMENTO: o colaborador escolhido vai DIRETO para atendimento (sem alarme/
 * aceite — é planejado). Sai da fila enquanto atende; ao FINALIZAR vai para o
 * FIM da fila (fluxo normal de finish). Recusa se já estiver em atendimento.
 */
export async function startAgendamento(opts: {
  tenantId: string
  unitId: string
  queueId: string
  arrivalId: string
  actorId: string
  sellerId: string
  customerName?: string | null
}): Promise<CallResult> {
  const busy = await prisma.sellerQueueAttendance.findFirst({
    where: { queueId: opts.queueId, sellerId: opts.sellerId, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } },
    select: { id: true },
  })
  if (busy) return { ok: false, reason: 'Este colaborador já está em atendimento.' }

  const now = new Date()
  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.sellerQueueEntry.updateMany({
      where: { queueId: opts.queueId, sellerId: opts.sellerId, status: 'WAITING', blocked: false },
      data: { status: 'IN_ATTENDANCE', lastActiveAt: now },
    })
    const att = await tx.sellerQueueAttendance.create({
      data: {
        tenantId: opts.tenantId, unitId: opts.unitId, queueId: opts.queueId, sellerId: opts.sellerId,
        arrivalId: opts.arrivalId, status: 'IN_ATTENDANCE', calledAt: now, acceptedAt: now, startedAt: now,
      },
    })
    await tx.sellerQueueCustomerArrival.update({ where: { id: opts.arrivalId }, data: { status: 'ASSIGNED' } })
    return { att, fromQueue: locked.count === 1 }
  })

  await logQueueEvent({ tenantId: opts.tenantId, unitId: opts.unitId, queueId: opts.queueId, type: 'ATTENDANCE_STARTED', sellerId: opts.sellerId, actorId: opts.actorId, arrivalId: opts.arrivalId, attendanceId: result.att.id, reason: 'agendamento' })
  return { ok: true, attendanceId: result.att.id, sellerId: opts.sellerId }
}
