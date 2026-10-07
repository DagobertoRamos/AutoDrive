// =============================================================================
// Avaliação × negociação × lead — integração com BANCO REAL (local).
//   EVAL_DB_TEST=1 DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_dev npx vitest run src/lib/evaluation/cancel-service.db.test.ts
// Tudo o que cria é apagado no fim.
// =============================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'crypto'

const URL_OK = /@(localhost|127\.0\.0\.1):5433\//.test(process.env.DATABASE_URL ?? '')
const RUN = process.env.EVAL_DB_TEST === '1' && URL_OK
if (process.env.EVAL_DB_TEST === '1' && !URL_OK) throw new Error('Recusado: DATABASE_URL precisa ser o Postgres LOCAL (localhost:5433).')

/* eslint-disable @typescript-eslint/no-explicit-any */
const d = RUN ? describe : describe.skip

d('Cancelamento de avaliação e registro no lead (banco local)', () => {
  let prisma: any
  let svc: typeof import('./cancel-service')
  let tenantId = ''
  const tag = randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')
  const plate = `TRC${Math.floor(Math.random() * 10)}B${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`
  const ids = { leads: [] as string[], deals: [] as string[], evals: [] as string[], vehicles: [] as string[] }
  const actor = { id: null, name: 'Teste', role: 'ADM' }

  const mkDeal = async (extra: any[] = []) => {
    const deal = await prisma.deal.create({ data: { tenantId, type: 'TROCA', status: 'EM_ANDAMENTO', dealNumber: `TST-${tag}-${ids.deals.length}` } })
    ids.deals.push(deal.id)
    await prisma.dealVehicle.create({ data: { dealId: deal.id, role: 'TROCA', plate, brand: 'Chevrolet', model: 'Onix', year: 2020 } })
    for (const v of extra) await prisma.dealVehicle.create({ data: { dealId: deal.id, ...v } })
    return deal
  }
  const mkEval = async (data: any = {}) => {
    const ev = await prisma.vehicleEvaluation.create({ data: { tenantId, plate, brand: 'Chevrolet', model: 'Onix', status: 'LIBERADA', result: 'APROVADO', ...data } })
    ids.evals.push(ev.id)
    return ev
  }

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma
    svc = await import('./cancel-service')
    tenantId = (await prisma.tenant.findFirst({ where: { name: { contains: 'AutoDrive' } }, select: { id: true } })).id
    const lead = await prisma.marketingLead.create({ data: { tenantId, status: 'NEW', source: 'SITE', name: `Lead ${tag}`, phone: '(11) 90000-0000' } })
    ids.leads.push(lead.id)
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.crmLeadInteraction.deleteMany({ where: { leadId: { in: ids.leads } } })
    await prisma.crmLeadVehicle.deleteMany({ where: { leadId: { in: ids.leads } } })
    await prisma.crmLeadEvaluation.deleteMany({ where: { leadId: { in: ids.leads } } })
    await prisma.crmLeadDeal.deleteMany({ where: { leadId: { in: ids.leads } } })
    await prisma.evaluationHistory.deleteMany({ where: { evaluationId: { in: ids.evals } } }).catch(() => {})
    await prisma.vehicleEvaluation.deleteMany({ where: { id: { in: ids.evals } } })
    await prisma.dealAuditLog.deleteMany({ where: { dealId: { in: ids.deals } } }).catch(() => {})
    await prisma.dealVehicle.deleteMany({ where: { dealId: { in: ids.deals } } })
    await prisma.deal.deleteMany({ where: { id: { in: ids.deals } } })
    await prisma.vehicle.deleteMany({ where: { id: { in: ids.vehicles } } })
    await prisma.marketingLead.deleteMany({ where: { id: { in: ids.leads } } })
  })

  it('vincular negociação ao lead traz troca, avaliação e registra nos dois lados', async () => {
    const ev = await mkEval()
    const deal = await mkDeal()
    const leadId = ids.leads[0]
    await prisma.crmLeadDeal.create({ data: { tenantId, leadId, dealId: deal.id, linkedByUserId: null } })
    await svc.onDealLinkedToLead({ tenantId, leadId, dealId: deal.id, actor })
    const vehicles = await prisma.crmLeadVehicle.findMany({ where: { leadId } })
    expect(vehicles.some((v: any) => v.role === 'TROCA' && v.plate === plate)).toBe(true)
    expect(await prisma.crmLeadEvaluation.count({ where: { leadId, evaluationId: ev.id } })).toBe(1)
    const log = await prisma.crmLeadInteraction.findFirst({ where: { leadId, type: 'NEGOTIATION' } })
    expect(log.summary).toContain('vinculada')
    expect(log.summary).toContain(plate)
    expect(await prisma.dealAuditLog.count({ where: { dealId: deal.id, action: 'VINCULAR_LEAD' } })).toBe(1)
  })

  it('negociação cancelada SEM devolver o carro: avaliação continua', async () => {
    const deal = await prisma.deal.findFirst({ where: { id: ids.deals[0] }, include: { vehicles: true } })
    await svc.afterDealCancelled({ tenantId, deal, vehicles: deal.vehicles, returnEntering: false, returnedVehicleIds: [], reason: 'Cliente desistiu', actor })
    const ev = await prisma.vehicleEvaluation.findUnique({ where: { id: ids.evals[0] } })
    expect(ev.cancelledAt).toBeNull()
  })

  it('negociação cancelada devolvendo o carro: avaliação CANCELADA, lead registrado, troca sai do lead', async () => {
    const deal = await prisma.deal.findFirst({ where: { id: ids.deals[0] }, include: { vehicles: true } })
    await svc.afterDealCancelled({ tenantId, deal, vehicles: deal.vehicles, returnEntering: true, returnedVehicleIds: [], reason: 'Cliente desistiu', actor })
    const ev = await prisma.vehicleEvaluation.findUnique({ where: { id: ids.evals[0] } })
    expect(ev.status).toBe('CANCELADA')
    expect(ev.cancelReason).toContain('Cliente desistiu')
    const leadId = ids.leads[0]
    const logs = await prisma.crmLeadInteraction.findMany({ where: { leadId }, orderBy: { occurredAt: 'asc' } })
    expect(logs.some((l: any) => l.type === 'EVALUATION' && l.summary.includes('Avaliação cancelada'))).toBe(true)
    expect(logs.some((l: any) => l.type === 'NEGOTIATION' && l.summary.includes('cancelada') && l.summary.includes('devolvido'))).toBe(true)
    const troca = await prisma.crmLeadVehicle.findFirst({ where: { leadId, role: 'TROCA', plate } })
    expect(troca.removedAt).not.toBeNull()
    // Repetir não cancela de novo nem duplica.
    const again = await svc.cancelEvaluation({ tenantId, evaluationId: ev.id, reason: 'x', actor, origin: 'MANUAL' })
    expect(again.ok && again.alreadyCancelled).toBe(true)
  })

  it('carro no estoque: cancelar à mão é recusado; marcado Devolvido no estoque, cancela', async () => {
    const v = await prisma.vehicle.create({ data: { tenantId, plate: `${plate.slice(0, 3)}9Z99`, brand: 'Fiat', model: 'Argo', stockStatus: 'DISPONIVEL', active: true } })
    ids.vehicles.push(v.id)
    const ev = await mkEval({ plate: v.plate, vehicleId: v.id, status: 'NO_ESTOQUE' })
    const r = await svc.cancelEvaluation({ tenantId, evaluationId: ev.id, reason: 'teste', actor, origin: 'MANUAL' })
    expect(r.ok).toBe(false)
    await prisma.vehicle.update({ where: { id: v.id }, data: { stockStatus: 'DEVOLVIDO', active: false } })
    await svc.afterVehicleReturned(tenantId, v.id, 'DEVOLVIDO', actor)
    const after = await prisma.vehicleEvaluation.findUnique({ where: { id: ev.id } })
    expect(after.status).toBe('CANCELADA')
    expect(after.cancelReason).toContain('Devolvido')
  })
})
