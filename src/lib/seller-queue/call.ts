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

  // Candidatos: WAITING, não bloqueados, por posição. Preferido vai à frente.
  const waiting = await prisma.sellerQueueEntry.findMany({
    where: { queueId: opts.queueId, status: 'WAITING', blocked: false },
    orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
    select: { id: true, sellerId: true },
  })
  if (waiting.length === 0) {
    await notifyNoSellerAvailable({ tenantId: opts.tenantId, unitId: opts.unitId, arrivalId: opts.arrivalId, whatsapp: cfg?.alertWhatsappManagers ?? false })
    return { ok: false, reason: 'Nenhum vendedor disponível na fila.' }
  }

  const ordered = opts.preferSellerId
    ? [...waiting.filter((w) => w.sellerId === opts.preferSellerId), ...waiting.filter((w) => w.sellerId !== opts.preferSellerId)]
    : waiting

  // Tenta travar o primeiro candidato disponível (compare-and-set atômico).
  for (const cand of ordered) {
    const now = new Date()
    const deadline = new Date(now.getTime() + timeout * 1000)
    const result = await prisma.$transaction(async (tx) => {
      const upd = await tx.sellerQueueEntry.updateMany({
        where: { id: cand.id, status: 'WAITING', blocked: false },
        data: { status: 'CALLED', lastActiveAt: now },
      })
      if (upd.count !== 1) return null // perdeu a corrida — tenta o próximo
      const att = await tx.sellerQueueAttendance.create({
        data: {
          tenantId: opts.tenantId, unitId: opts.unitId, queueId: opts.queueId, sellerId: cand.sellerId,
          arrivalId: opts.arrivalId, status: 'CALLED', calledAt: now, acceptDeadline: deadline,
        },
      })
      await tx.sellerQueueCustomerArrival.update({ where: { id: opts.arrivalId }, data: { status: 'CALLING' } })
      return att
    })
    if (!result) continue

    await logQueueEvent({ tenantId: opts.tenantId, unitId: opts.unitId, queueId: opts.queueId, type: 'CALLED', sellerId: cand.sellerId, actorId: opts.actorId, arrivalId: opts.arrivalId, attendanceId: result.id, reason: opts.reason ?? null })
    // Alerta (crítico) o vendedor da vez: in-app sempre; WhatsApp se o ADM ligou.
    await notifySellerCalled({ tenantId: opts.tenantId, sellerId: cand.sellerId, timeoutSeconds: timeout, attendanceId: result.id, arrivalId: opts.arrivalId, customerName: opts.customerName ?? null, recurring: opts.recurring ?? false, whatsapp: cfg?.alertWhatsapp ?? false })

    return { ok: true, attendanceId: result.id, sellerId: cand.sellerId }
  }

  return { ok: false, reason: 'Nenhum vendedor disponível na fila.' }
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
