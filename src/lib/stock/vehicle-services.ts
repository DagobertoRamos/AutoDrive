// =============================================================================
// Serviços de preparação do veículo — parte com banco. Regras em prep-core.
// Toda mudança: registra no acompanhamento, sincroniza a despesa no Financeiro,
// recalcula a esteira e avisa quem precisa:
//   • troca de fornecedor / atraso      → preparação + gestores
//   • todos os serviços encerrados      → marketing / fotógrafos / gestor de mídias
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canMoveService, isOverdue, SERVICE_STATUS_LABEL, servicesDone, type ServiceStatus } from './prep-core'
import { syncServiceEntry } from './vehicle-ledger'
import { syncIntake } from './intake'
import { notifyMarketingTeam, notifyPrepTeam } from './prep-notify'

export type Actor = { id: string; name?: string | null; role?: string | null }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Traz para o carro os serviços que a avaliação apontou (uma vez; não duplica). */
export async function importEvaluationServices(vehicleId: string, actor: Actor | null = null): Promise<number> {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, tenantId: true, originEvaluationId: true } })
  if (!v?.originEvaluationId) return 0
  const evalServices = await prisma.evaluationService.findMany({
    where:  { evaluationId: v.originEvaluationId, status: { notIn: ['CANCELED'] } },
    select: { id: true, description: true, serviceType: true, estimatedCost: true, status: true, notes: true },
  })
  let n = 0
  for (const es of evalServices) {
    const exists = await prisma.vehicleService.findUnique({ where: { evaluationServiceId: es.id }, select: { id: true } })
    if (exists) continue
    // Duas aberturas simultâneas da aba podem importar juntas: a trava única
    // (evaluationServiceId) segura; quem perde a corrida só segue em frente.
    const s = await prisma.vehicleService.create({
      data: {
        tenantId: v.tenantId, vehicleId, evaluationServiceId: es.id, description: es.description, serviceType: es.serviceType,
        status: es.status === 'DONE' ? 'CONCLUIDO' : 'AGUARDANDO', estimatedCost: es.estimatedCost, notes: es.notes, createdById: actor?.id ?? null,
      },
    }).catch((e: unknown) => {
      if ((e as { code?: string })?.code === 'P2002') return null
      throw e
    })
    if (!s) continue
    await prisma.vehicleServiceEvent.create({ data: { serviceId: s.id, type: 'CRIADO', toValue: s.status, note: 'Serviço apontado na avaliação.', userId: actor?.id ?? null, userName: actor?.name ?? 'Avaliação' } })
    n++
  }
  return n
}

export interface ServicePatch {
  status?: string; supplierId?: string | null; estimatedCost?: number | null; actualCost?: number | null
  notes?: string | null; sentAt?: string | null; dueAt?: string | null; deniedReason?: string | null
  description?: string; serviceType?: string; followUp?: string | null
}

const moneyOrNull = (v: unknown) => {
  if (v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined
}
const dateOrNull = (v: unknown) => {
  if (v === null || v === '') return null
  return typeof v === 'string' && !isNaN(Date.parse(v)) ? new Date(v) : undefined
}

export async function updateVehicleService(serviceId: string, patch: ServicePatch, actor: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const cur = await prisma.vehicleService.findUnique({ where: { id: serviceId }, include: { supplier: { select: { name: true } }, vehicle: { select: { tenantId: true, plate: true, brand: true, model: true } } } })
  if (!cur) return { ok: false, error: 'Serviço não encontrado.' }
  const data: Prisma.VehicleServiceUncheckedUpdateInput = {}
  const events: Array<{ type: string; fromValue?: string | null; toValue?: string | null; note?: string | null }> = []
  const car = [cur.vehicle.plate, cur.vehicle.brand, cur.vehicle.model].filter(Boolean).join(' ')

  if (patch.status && patch.status !== cur.status) {
    if (!canMoveService(cur.status, patch.status)) return { ok: false, error: 'Mudança de situação não permitida.' }
    if (patch.status === 'NEGADO' && !String(patch.deniedReason ?? cur.deniedReason ?? '').trim()) return { ok: false, error: 'Informe o motivo para negar o serviço.' }
    if (patch.status === 'EM_SERVICO' && !(patch.supplierId ?? cur.supplierId)) return { ok: false, error: 'Informe o fornecedor/oficina que está fazendo o serviço.' }
    data.status = patch.status
    if (patch.status === 'EM_SERVICO' && !cur.sentAt && patch.sentAt === undefined) data.sentAt = new Date()
    if (patch.status === 'CONCLUIDO') data.finishedAt = new Date()
    if (patch.status === 'AGUARDANDO') { data.finishedAt = null; data.deniedReason = null }
    events.push({ type: 'STATUS', fromValue: SERVICE_STATUS_LABEL[cur.status as ServiceStatus] ?? cur.status, toValue: SERVICE_STATUS_LABEL[patch.status as ServiceStatus] ?? patch.status, note: patch.status === 'NEGADO' ? patch.deniedReason ?? null : null })
  }
  if (patch.deniedReason !== undefined) data.deniedReason = patch.deniedReason?.trim().slice(0, 500) || null

  let supplierChanged: { from: string | null; to: string | null } | null = null
  if (patch.supplierId !== undefined && patch.supplierId !== cur.supplierId) {
    const sup = patch.supplierId ? await prisma.supplier.findFirst({ where: { id: patch.supplierId, tenantId: cur.vehicle.tenantId ?? '' }, select: { name: true } }) : null
    if (patch.supplierId && !sup) return { ok: false, error: 'Fornecedor não encontrado.' }
    data.supplierId = patch.supplierId
    supplierChanged = { from: cur.supplier?.name ?? null, to: sup?.name ?? null }
    events.push({ type: 'FORNECEDOR', fromValue: supplierChanged.from, toValue: supplierChanged.to })
    if (cur.supplierId && patch.supplierId) { data.sentAt = new Date(); data.overdueNotifiedAt = null }
  }
  for (const k of ['estimatedCost', 'actualCost'] as const) {
    if (patch[k] === undefined) continue
    const val = moneyOrNull(patch[k])
    if (val === undefined) return { ok: false, error: 'Valor inválido.' }
    const before = cur[k] == null ? null : Number(cur[k])
    if (val !== before) {
      data[k] = val
      events.push({ type: 'VALOR', fromValue: before == null ? '—' : brl(before), toValue: val == null ? '—' : brl(val), note: k === 'actualCost' ? 'Valor real' : 'Valor previsto' })
    }
  }
  for (const k of ['sentAt', 'dueAt'] as const) {
    if (patch[k] === undefined) continue
    const d = dateOrNull(patch[k])
    if (d === undefined) return { ok: false, error: 'Data inválida.' }
    data[k] = d
    if (k === 'dueAt') { data.overdueNotifiedAt = null; events.push({ type: 'PRAZO', fromValue: cur.dueAt?.toLocaleDateString('pt-BR') ?? '—', toValue: d?.toLocaleDateString('pt-BR') ?? '—' }) }
  }
  if (patch.notes !== undefined) data.notes = patch.notes?.trim().slice(0, 2000) || null
  if (patch.description?.trim()) data.description = patch.description.trim().slice(0, 200)
  if (patch.serviceType?.trim()) data.serviceType = patch.serviceType.trim().slice(0, 40)
  if (patch.followUp?.trim()) events.push({ type: 'NOTA', note: patch.followUp.trim().slice(0, 1000) })

  if (Object.keys(data).length) await prisma.vehicleService.update({ where: { id: serviceId }, data })
  if (events.length) {
    await prisma.vehicleServiceEvent.createMany({ data: events.map((e) => ({ serviceId, ...e, userId: actor.id, userName: actor.name ?? null })) })
  }

  await syncServiceEntry(serviceId, actor.id)
  await syncIntake(cur.vehicleId, actor)

  if (supplierChanged && supplierChanged.from && supplierChanged.to) {
    await notifyPrepTeam(cur.vehicle.tenantId, 'Serviço mudou de fornecedor',
      `${car}: “${cur.description}” saiu de ${supplierChanged.from} e foi para ${supplierChanged.to}.`, cur.vehicleId)
  }
  if (data.status && ['CONCLUIDO', 'NEGADO', 'CANCELADO'].includes(String(data.status))) await notifyIfAllDone(cur.vehicleId, actor)
  return { ok: true }
}

/** Todos os serviços encerrados → marketing/fotógrafos/gestor de mídias (uma vez por conclusão). */
export async function notifyIfAllDone(vehicleId: string, actor: Actor | null) {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { tenantId: true, plate: true, brand: true, model: true, services: { select: { status: true } } } })
  if (!v || !servicesDone(v.services)) return
  const car = [v.plate, v.brand, v.model].filter(Boolean).join(' ')
  await notifyMarketingTeam(v.tenantId, 'Veículo pronto para fotos', `${car}: preparação concluída. Pode fotografar e publicar (Marketing › Publicações).`, vehicleId)
  await prisma.auditLog.create({
    data: { userId: actor?.id ?? null, tenantId: v.tenantId, action: 'PREP_DONE_NOTIFIED', entity: 'Vehicle', entityId: vehicleId, userName: actor?.name ?? null, status: 'SUCCESS' },
  }).catch(() => {})
}

/** Cron: serviços em andamento com previsão vencida → avisa preparação + gestores (1x por prazo). */
export async function notifyOverdueServices(now = new Date()): Promise<number> {
  const rows = await prisma.vehicleService.findMany({
    where:   { status: 'EM_SERVICO', dueAt: { lt: now }, overdueNotifiedAt: null },
    include: { supplier: { select: { name: true } }, vehicle: { select: { tenantId: true, plate: true, brand: true, model: true } } },
    take:    200,
  })
  let n = 0
  for (const s of rows) {
    if (!isOverdue({ status: s.status, dueAt: s.dueAt }, now)) continue
    const car = [s.vehicle.plate, s.vehicle.brand, s.vehicle.model].filter(Boolean).join(' ')
    await notifyPrepTeam(s.vehicle.tenantId, 'Serviço atrasado',
      `${car}: “${s.description}”${s.supplier ? ` em ${s.supplier.name}` : ''} passou da previsão (${s.dueAt!.toLocaleDateString('pt-BR')}).`, s.vehicleId)
    await prisma.vehicleService.update({ where: { id: s.id }, data: { overdueNotifiedAt: now } })
    await prisma.vehicleServiceEvent.create({ data: { serviceId: s.id, type: 'ATRASO', note: 'Previsão de entrega vencida — equipe avisada.', userName: 'Sistema' } })
    n++
  }
  return n
}
