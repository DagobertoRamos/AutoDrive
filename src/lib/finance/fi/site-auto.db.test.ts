// =============================================================================
// Simulação automática do site — integração com BANCO REAL (local).
//   SITEFI_DB_TEST=1 DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_dev npx vitest run src/lib/finance/fi/site-auto.db.test.ts
// Usa o "Banco de testes" do F&I (só fora de produção). Apaga tudo no fim.
// =============================================================================

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

const URL_OK = /@(localhost|127\.0\.0\.1):5433\//.test(process.env.DATABASE_URL ?? '')
const RUN = process.env.SITEFI_DB_TEST === '1' && URL_OK
if (process.env.SITEFI_DB_TEST === '1' && !URL_OK) throw new Error('Recusado: DATABASE_URL precisa ser o Postgres LOCAL (localhost:5433).')

const notified: { title: string }[] = []
vi.mock('@/services/notification.service', () => ({ notify: vi.fn(async (n: { title: string }) => { notified.push(n) }), notifyByRole: vi.fn(async () => undefined) }))

/* eslint-disable @typescript-eslint/no-explicit-any */
const d = RUN ? describe : describe.skip

d('Simulação automática do site (banco local)', () => {
  let prisma: any
  let auto: typeof import('./site-auto')
  let tenantId = ''
  const tag = randomUUID().slice(0, 6)
  const ids = { banks: [] as string[], proposals: [] as string[], leads: [] as string[], proponents: [] as string[] }
  let proposalId = ''
  let otherLive: string[] = []

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma
    auto = await import('./site-auto')
    tenantId = (await prisma.tenant.findFirst({ where: { name: { contains: 'AutoDrive' } }, select: { id: true } })).id
    // Outros bancos de teste ativos na loja local saem do caminho durante o teste.
    otherLive = (await prisma.financeBank.findMany({ where: { tenantId, active: true, adapterKey: { not: null } }, select: { id: true } })).map((b: any) => b.id)
    await prisma.financeBank.updateMany({ where: { id: { in: otherLive } }, data: { active: false } })
    const live = await prisma.financeBank.create({ data: { tenantId, name: `Banco teste ${tag}`, adapterKey: 'teste', active: true } })
    const manual = await prisma.financeBank.create({ data: { tenantId, name: `Banco manual ${tag}`, adapterKey: null, active: true } })
    ids.banks.push(live.id, manual.id)
    const lead = await prisma.marketingLead.create({ data: { tenantId, status: 'NEW', source: 'SITE', name: `Cliente FI ${tag}` } })
    ids.leads.push(lead.id)
    const person = await prisma.financeProponent.create({ data: { tenantId, personType: 'PF', nomeCompleto: `Cliente FI ${tag}`, cpf: `999${String(Date.now()).slice(-8)}` } })
    ids.proponents.push(person.id)
    const p = await prisma.financeProposal.create({ data: { tenantId, code: `TST-${tag}`, proponentId: person.id, leadId: lead.id, vehicle: 'Onix 2022', vehicleValue: 80000, downPayment: 20000, amountRequested: 60000, installments: 48, status: 'SIMULACAO', origin: 'SITE', originMeta: {} } })
    proposalId = p.id
    ids.proposals.push(p.id)
  })

  afterAll(async () => {
    if (!prisma) return
    const sims = await prisma.financeSimulation.findMany({ where: { proponentId: { in: ids.proponents } }, select: { id: true } })
    await prisma.financeSimulationOption.deleteMany({ where: { simulationId: { in: sims.map((s: any) => s.id) } } })
    await prisma.financeSimulation.deleteMany({ where: { proponentId: { in: ids.proponents } } })
    await prisma.financeProposalEvent.deleteMany({ where: { proposalId: { in: ids.proposals } } })
    await prisma.financeProposal.deleteMany({ where: { id: { in: ids.proposals } } })
    await prisma.financeProponent.deleteMany({ where: { id: { in: ids.proponents } } })
    await prisma.crmLeadInteraction.deleteMany({ where: { leadId: { in: ids.leads } } })
    await prisma.marketingLead.deleteMany({ where: { id: { in: ids.leads } } })
    await prisma.financeBank.deleteMany({ where: { id: { in: ids.banks } } })
    await prisma.financeBank.updateMany({ where: { id: { in: otherLive } }, data: { active: true } })
  })

  it('banco conectado responde na hora; manual fica aguardando — PARCIAL', async () => {
    const r = await auto.runSiteAutoSimulation(proposalId)
    expect(r?.status).toBe('PARCIAL')
    expect(r?.quotes.map((q) => q.bank)).toEqual([`Banco teste ${tag}`])
    expect(r?.quotes[0].installments).toBe(48)
    expect(r?.pending.some((b) => b.bank === `Banco manual ${tag}`)).toBe(true)
    const p = await prisma.financeProposal.findUnique({ where: { id: proposalId } })
    expect(p.simulationResult.status).toBe('PARCIAL')
    const sim = await prisma.financeSimulation.findFirst({ where: { proponentId: ids.proponents[0] }, include: { options: true } })
    expect(sim.options.some((o: any) => o.status === 'RESPONDIDO')).toBe(true)
    expect(sim.options.some((o: any) => o.status === 'AGUARDANDO_ANALISE')).toBe(true)
    const lead = await prisma.crmLeadInteraction.findFirst({ where: { leadId: ids.leads[0], type: 'FINANCING' } })
    expect(lead.summary).toContain('Simulação automática do site')
  })

  it('cliente refaz com outra condição: histórico cresce; site mostra respostas e histórico', async () => {
    await prisma.financeProposal.update({ where: { id: proposalId }, data: { installments: 60 } })
    await auto.runSiteAutoSimulation(proposalId)
    const { buildPortalView } = await import('./portal')
    const v = await buildPortalView(proposalId)
    expect(v.simulation?.quotes.length).toBe(1)
    expect(v.simulation?.pending).toBeGreaterThanOrEqual(1)
    expect(v.history.length).toBe(2)
    expect(v.step).toBe('PREPARANDO') // continua podendo completar os dados
  })

  it('sem banco conectado: aguardando análise e equipe de F&I avisada', async () => {
    notified.length = 0
    await prisma.financeBank.update({ where: { id: ids.banks[0] }, data: { active: false } })
    const r = await auto.runSiteAutoSimulation(proposalId)
    expect(r?.status).toBe('AGUARDANDO_ANALISE')
    expect(notified.some((n) => n.title === 'Simulação do site aguardando análise')).toBe(true)
  })

  it('ficha parada vira aviso uma vez (não repete em seguida)', async () => {
    notified.length = 0
    await prisma.$executeRaw`UPDATE finance_proposals SET "updatedAt" = now() - interval '2 hours' WHERE id = ${proposalId}`
    await auto.alertStalledSiteSimulations()
    expect(notified.filter((n) => n.title === 'Simulação do site parada').length).toBeGreaterThan(0)
    const count = notified.length
    await prisma.$executeRaw`UPDATE finance_proposals SET "updatedAt" = now() - interval '2 hours' WHERE id = ${proposalId}`
    await auto.alertStalledSiteSimulations()
    expect(notified.length).toBe(count)
  })

  it('link antigo do cliente continua valendo depois de gerar um novo', async () => {
    const { issuePortalLink, findByPortalToken } = await import('./orchestrator')
    const actor = { id: 'site', name: 'Site', role: 'SISTEMA' }
    const first = await issuePortalLink(proposalId, actor, 14)
    const p = await prisma.financeProposal.findUnique({ where: { id: proposalId } })
    await auto.keepPreviousPortalLink(proposalId, p.portalTokenHash, p.originMeta)
    const second = await issuePortalLink(proposalId, actor, 14)
    expect((await findByPortalToken(first.token))?.id).toBe(proposalId)
    expect((await findByPortalToken(second.token))?.id).toBe(proposalId)
  })
})
