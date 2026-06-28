// =============================================================================
// seller-queue/call.ts — chama o "vendedor da vez" para um cliente que chegou.
// LOCK TRANSACIONAL: o candidato só é chamado se sua entry ainda estiver WAITING
// (updateMany compare-and-set) — evita chamar 2 vendedores p/ o mesmo cliente ou
// o mesmo vendedor p/ 2 clientes. Cria o atendimento (CALLED) com prazo de aceite
// e NOTIFICA o vendedor. Quem registra o cliente NÃO escolhe quem atende.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { getUnitConfig, logQueueEvent } from './queue'
import { notifySellerCalled, notifyNoSellerAvailable } from './notify'

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
        const upd = await tx.sellerQueueEntry.updateMany({ where: { id: entryId, status: 'WAITING', blocked: false }, data: { status: 'CALLED', lastActiveAt: now } })
        if (upd.count !== 1) return null // perdeu a corrida
      } else {
        await tx.sellerQueueEntry.updateMany({ where: { queueId: opts.queueId, sellerId, status: 'WAITING', blocked: false }, data: { status: 'CALLED', lastActiveAt: now } })
      }
      const att = await tx.sellerQueueAttendance.create({
        data: { tenantId: opts.tenantId, unitId: opts.unitId, queueId: opts.queueId, sellerId, arrivalId: opts.arrivalId, status: 'CALLED', calledAt: now, acceptDeadline: deadline },
      })
      await tx.sellerQueueCustomerArrival.update({ where: { id: opts.arrivalId }, data: { status: 'CALLING' } })
      return att
    })
    if (!result) return null
    await logQueueEvent({ tenantId: opts.tenantId, unitId: opts.unitId, queueId: opts.queueId, type: 'CALLED', sellerId, actorId: opts.actorId, arrivalId: opts.arrivalId, attendanceId: result.id, reason })
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
  // Rotação regular = vendedores (exclui GERENTE), mas honra o preferido específico.
  const regular = ordered.filter((w) => w.sellerId === opts.preferSellerId || cargoByUser.get(w.sellerId) !== 'GERENTE')

  // 1) Tenta um vendedor disponível.
  for (const cand of regular) {
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
  const deadline = new Date(now.getTime() + timeout * 1000)
  const result = await prisma.$transaction(async (tx) => {
    // Tenta tirar da fila se estiver WAITING (não bloqueado).
    const locked = await tx.sellerQueueEntry.updateMany({
      where: { queueId: opts.queueId, sellerId: opts.sellerId, status: 'WAITING', blocked: false },
      data: { status: 'CALLED', lastActiveAt: now },
    })
    const att = await tx.sellerQueueAttendance.create({
      data: {
        tenantId: opts.tenantId, unitId: opts.unitId, queueId: opts.queueId, sellerId: opts.sellerId,
        arrivalId: opts.arrivalId, status: 'CALLED', calledAt: now, acceptDeadline: deadline,
      },
    })
    await tx.sellerQueueCustomerArrival.update({ where: { id: opts.arrivalId }, data: { status: 'CALLING' } })
    return { att, fromQueue: locked.count === 1 }
  })

  await logQueueEvent({ tenantId: opts.tenantId, unitId: opts.unitId, queueId: opts.queueId, type: 'CALLED', sellerId: opts.sellerId, actorId: opts.actorId, arrivalId: opts.arrivalId, attendanceId: result.att.id, reason: opts.reason ?? (result.fromQueue ? 'chamada específica' : 'chamada específica (fora da fila)') })
  await notifySellerCalled({ tenantId: opts.tenantId, sellerId: opts.sellerId, timeoutSeconds: timeout, attendanceId: result.att.id, arrivalId: opts.arrivalId, customerName: opts.customerName ?? null, recurring: false, whatsapp: cfg?.alertWhatsapp ?? false })

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
