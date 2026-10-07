// =============================================================================
// Ponta a ponta das operações veiculares contra um Postgres REAL (local).
// Roda só com OPS_E2E_DATABASE_URL apontando para localhost; cria uma loja de
// teste isolada e apaga tudo no fim. Ex.:
//   OPS_E2E_DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_dev npx vitest run src/lib/automotive/operations.e2e.test.ts
// =============================================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

const URL = process.env.OPS_E2E_DATABASE_URL ?? ''
const LOCAL = /@(localhost|127\.0\.0\.1)[:/]/.test(URL)

vi.mock('@/services/notification.service', () => ({ notifyMany: vi.fn(async () => ({})) }))

describe.skipIf(!LOCAL)('operações veiculares (banco real)', () => {
  let prisma: typeof import('@/lib/prisma').prisma
  let ops: typeof import('./operations')
  let renave: typeof import('./renave')
  let fiscal: typeof import('./fiscal')
  let transfer: typeof import('./transfer')
  let registry: typeof import('./vehicle-registry')
  let overview: typeof import('./overview')
  let events: typeof import('./events')
  let external: typeof import('./external')
  let jobs: typeof import('./jobs')

  const tag = `e2e${Date.now()}`
  const CNPJ = '11222333000181'
  const BUYER = '52998224725'
  const OWNER = '11144477735'
  const CHASSI_A = '9BWZZZ377VT004251'
  const CHASSI_B = '9BGKS48U0LG123456'
  const actor = { id: null, name: 'Teste E2E', role: 'ADM' }
  const extraVehicles: string[] = []
  const extraDeals: string[] = []
  const extraPersons: string[] = []
  let tenantId = '', unitA = '', unitB = '', customerId = '', carA = '', carB = '', dealId = '', dvTrade = ''

  function withDv(k43: string): string {
    let sum = 0, w = 2
    for (let i = 42; i >= 0; i--) { sum += Number(k43[i]) * w; w = w === 9 ? 2 : w + 1 }
    const r = sum % 11
    return k43 + String(r < 2 ? 0 : 11 - r)
  }
  const key = (n: number) => withDv(`35261011222333000181550010000${String(n).padStart(5, '0')}10000${String(n).padStart(4, '0')}`.slice(0, 43))
  const nfe = (o: { key: string; tpNF: '0' | '1'; emit: string; destTag: 'CPF' | 'CNPJ'; dest: string; chassi: string; cStat?: string; vNF?: number }) => `<nfeProc><NFe><infNFe Id="NFe${o.key}"><ide><mod>55</mod><serie>1</serie><nNF>${o.key.slice(25, 34)}</nNF><dhEmi>2026-10-07T09:35:00-03:00</dhEmi><tpNF>${o.tpNF}</tpNF></ide><emit><CNPJ>${o.emit}</CNPJ><xNome>LOJA</xNome></emit><dest><${o.destTag}>${o.dest}</${o.destTag}><xNome>X</xNome></dest><det><prod><CFOP>5102</CFOP><veicProd><chassi>${o.chassi}</chassi></veicProd></prod></det><total><ICMSTot><vNF>${(o.vNF ?? 100000).toFixed(2)}</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><chNFe>${o.key}</chNFe><dhRecbto>2026-10-07T09:35:10-03:00</dhRecbto><nProt>1352600001</nProt><cStat>${o.cStat ?? '100'}</cStat><xMotivo>ok</xMotivo></infProt></protNFe></nfeProc>`

  beforeAll(async () => {
    process.env.DATABASE_URL = URL
    ;({ prisma } = await import('@/lib/prisma'))
    ops = await import('./operations')
    renave = await import('./renave')
    fiscal = await import('./fiscal')
    transfer = await import('./transfer')
    registry = await import('./vehicle-registry')
    overview = await import('./overview')
    events = await import('./events')
    external = await import('./external')
    jobs = await import('./jobs')

    const t = await prisma.tenant.create({ data: { publicId: `AD-${tag}`, slug: tag, name: 'Loja E2E', cnpj: CNPJ, state: 'SP' } })
    tenantId = t.id
    unitA = (await prisma.unit.create({ data: { tenantId, name: 'Matriz E2E', cnpj: `${tag}A`, state: 'SP' } })).id
    unitB = (await prisma.unit.create({ data: { tenantId, name: 'Filial E2E', cnpj: `${tag}B`, state: 'SP' } })).id
    customerId = (await prisma.customer.create({ data: { tenantId, name: 'João Comprador', cpf: BUYER, phone: '11999990000' } })).id
    carA = (await prisma.vehicle.create({ data: { tenantId, unitId: unitA, brand: 'Toyota', model: 'Corolla', plate: 'ABC1D23', chassi: CHASSI_A, stockStatus: 'DISPONIVEL', isAvailableForSale: true, purchasePrice: 82400, salePrice: 98900 } })).id
    carB = (await prisma.vehicle.create({ data: { tenantId, unitId: unitA, brand: 'Chevrolet', model: 'Onix', plate: 'XYZ9K88', chassi: CHASSI_B, stockStatus: 'PENDENTE_PREPARACAO' } })).id
  })

  afterAll(async () => {
    if (!tenantId) return
    const vids = [carA, carB].filter(Boolean)
    await prisma.operationEvent.deleteMany({ where: { tenantId } })
    await prisma.externalOperation.deleteMany({ where: { tenantId } })
    await prisma.fiscalDocument.deleteMany({ where: { tenantId } })
    await prisma.vehicleOperation.deleteMany({ where: { tenantId } })
    await prisma.vehicleRestriction.deleteMany({ where: { tenantId } })
    await prisma.vehicleInspection.deleteMany({ where: { tenantId } })
    await prisma.storeTransfer.deleteMany({ where: { tenantId } })
    await prisma.consignmentContract.deleteMany({ where: { tenantId } })
    await prisma.opsOutbox.deleteMany({ where: { OR: [{ tenantId }, { dedupKey: { contains: dealId || 'nada' } }, ...extraDeals.map((id) => ({ dedupKey: { contains: id } }))] } })
    await prisma.webhookInbox.deleteMany({ where: { provider: `E2E${tag}` } })
    await prisma.auditLog.deleteMany({ where: { tenantId } })
    if (dealId) {
      await prisma.dealPayment.deleteMany({ where: { dealId } })
      await prisma.dealVehicle.deleteMany({ where: { dealId } })
      await prisma.deal.delete({ where: { id: dealId } })
    }
    for (const id of extraDeals) {
      await prisma.dealVehicle.deleteMany({ where: { dealId: id } })
      await prisma.deal.deleteMany({ where: { id } })
    }
    await prisma.financialEntry.deleteMany({ where: { tenantId } })
    await prisma.vehicle.deleteMany({ where: { id: { in: [...vids, ...extraVehicles] } } })
    await prisma.person.deleteMany({ where: { id: { in: extraPersons } } })
    await prisma.vehicleDataQuery.deleteMany({ where: { tenantId } })
    await prisma.integrationConnection.deleteMany({ where: { tenantId } })
    await prisma.financialCategory.deleteMany({ where: { tenantId } }).catch(() => {})
    await prisma.customer.deleteMany({ where: { tenantId } })
    await prisma.unit.deleteMany({ where: { tenantId } })
    await prisma.systemSetting.deleteMany({ where: { key: `ops:config:${tenantId}` } })
    await prisma.tenant.delete({ where: { id: tenantId } })
    await prisma.$disconnect()
  })

  it('1/3/4 · compra: entrada RENAVE e NF-e de entrada (nota própria de pessoa física)', async () => {
    const op = await ops.ensureIntakeOperation(carA, actor)
    expect(op.code).toMatch(/^TXN-\d{4}-\d{7}$/)
    // clique duplo / concorrência: mesma operação
    const [x, y] = await Promise.all([ops.ensureIntakeOperation(carA, actor), ops.ensureIntakeOperation(carA, actor)])
    expect(x.id).toBe(op.id); expect(y.id).toBe(op.id)
    await expect(renave.renaveAction(op.id, tenantId, 'ENTRY', {}, actor)).rejects.toThrow(/protocolo/)
    const r = await renave.renaveAction(op.id, tenantId, 'ENTRY', { protocol: 'REN-001' }, actor)
    expect(r.renaveStatus).toBe('ENTRY_CONFIRMED')
    const again = await renave.renaveAction(op.id, tenantId, 'ENTRY', { protocol: 'REN-001' }, actor)
    expect(again.renaveStatus).toBe('ENTRY_CONFIRMED')
    expect(await prisma.externalOperation.count({ where: { operationId: op.id, action: 'ENTER_STOCK' } })).toBe(1)
    await prisma.vehicle.update({ where: { id: carA }, data: { customerId: null } })
    await prisma.vehicleOperation.update({ where: { id: op.id }, data: { customerId: null } })
    const res = await fiscal.attachFiscalXml(op.id, tenantId, nfe({ key: key(1), tpNF: '0', emit: CNPJ, destTag: 'CPF', dest: OWNER, chassi: CHASSI_A }), actor)
    expect(res.documentId).toBeTruthy()
    const facts = await ops.vehicleRenaveFacts(carA)
    expect(facts).toMatchObject({ renave: 'IN', fiscalEntry: 'AUTHORIZED' })
  })

  it('5 · veículo liberado: pronto para venda', async () => {
    const r = await overview.vehicleReadiness(carA)
    expect(r?.readiness.blockers).toEqual([])
  })

  it('25 · NF-e do veículo errado / não autorizada / duplicada é recusada', async () => {
    const op = await ops.ensureIntakeOperation(carB, actor)
    await expect(fiscal.attachFiscalXml(op.id, tenantId, nfe({ key: key(2), tpNF: '0', emit: CNPJ, destTag: 'CPF', dest: OWNER, chassi: CHASSI_A }), actor)).rejects.toThrow(/outro veículo/)
    await expect(fiscal.attachFiscalXml(op.id, tenantId, nfe({ key: key(3), tpNF: '0', emit: CNPJ, destTag: 'CPF', dest: OWNER, chassi: CHASSI_B, cStat: '204' }), actor)).rejects.toThrow(/não autorizada/)
    await expect(fiscal.attachFiscalXml(op.id, tenantId, nfe({ key: key(1), tpNF: '0', emit: CNPJ, destTag: 'CPF', dest: OWNER, chassi: CHASSI_B }), actor)).rejects.toThrow(/já está vinculada/)
  })

  it('restrição judicial bloqueia a venda; baixa libera', async () => {
    const r = await registry.addRestriction(carA, tenantId, { kind: 'JUDICIAL', description: 'Processo 123', blocking: false }, actor)
    expect(r.blocking).toBe(true) // judicial é sempre bloqueante
    expect((await overview.saleBlockers([carA]))[0]?.reasons[0]).toMatch(/Processo 123/)
    await registry.resolveRestriction(r.id, tenantId, 'Baixa judicial apresentada', actor)
    expect(await overview.saleBlockers([carA])).toEqual([])
  })

  it('8 · venda com troca: duas operações ligadas', async () => {
    const d = await prisma.deal.create({ data: { tenantId, unitId: unitA, type: 'TROCA', status: 'APROVADA', customerId, saleAmount: 100000, dealNumber: `NEG-${tag}` } as never })
    dealId = d.id
    await prisma.dealVehicle.create({ data: { dealId, vehicleId: carA, role: 'VENDIDO', agreedValue: 100000 } })
    dvTrade = (await prisma.dealVehicle.create({ data: { dealId, vehicleId: carB, role: 'TROCA', agreedValue: 40000 } })).id
    await prisma.dealPayment.create({ data: { dealId, type: 'FINANCIAMENTO', value: 60000, status: 'PENDENTE' } as never })
    await events.publishOpsEvent('deal.approved', `${dealId}:1`, { dealId, actor }, tenantId)
    await events.publishOpsEvent('deal.approved', `${dealId}:1`, { dealId, actor }, tenantId) // duplicado: ignorado
    expect(await prisma.opsOutbox.count({ where: { dedupKey: `deal.approved:${dealId}:1` } })).toBe(1)
    const list = await prisma.vehicleOperation.findMany({ where: { dealId } })
    const sale = list.find((o) => o.kind === 'SALE')!
    const entry = list.find((o) => o.kind === 'PURCHASE')!
    expect(sale.commercialStatus).toBe('RESERVED')
    expect(sale.financingStatus).toBe('PROPOSAL') // 19 · venda financiada
    expect(entry.parentId).toBe(sale.id)
    expect(entry.dealVehicleId).toBe(dvTrade) // adotou a entrada que já existia (avaliação)
  })

  it('12 · saída RENAVE exige venda finalizada e NF-e de saída', async () => {
    const sale = (await prisma.vehicleOperation.findFirst({ where: { dealId, kind: 'SALE' } }))!
    await expect(renave.renaveAction(sale.id, tenantId, 'EXIT', { protocol: 'X' }, actor)).rejects.toThrow(/finalizar a venda/)
    await prisma.deal.update({ where: { id: dealId }, data: { status: 'FINALIZADA', finalizedAt: new Date() } })
    await events.publishOpsEvent('deal.finalized', `${dealId}:f1`, { dealId, actor }, tenantId)
    const s2 = (await prisma.vehicleOperation.findUnique({ where: { id: sale.id } }))!
    expect(s2.commercialStatus).toBe('SOLD')
    await expect(renave.renaveAction(sale.id, tenantId, 'EXIT', { protocol: 'X' }, actor)).rejects.toThrow(/NF-e de saída/)
  })

  it('11/12/20 · NF-e de saída, gravame, saída RENAVE (cliques duplicados = 1 registro)', async () => {
    const sale = (await prisma.vehicleOperation.findFirst({ where: { dealId, kind: 'SALE' } }))!
    await expect(fiscal.attachFiscalXml(sale.id, tenantId, nfe({ key: key(4), tpNF: '1', emit: CNPJ, destTag: 'CPF', dest: '99999999999', chassi: CHASSI_A }), actor)).rejects.toThrow(/comprador não confere/)
    const res = await fiscal.attachFiscalXml(sale.id, tenantId, nfe({ key: key(5), tpNF: '1', emit: CNPJ, destTag: 'CPF', dest: BUYER, chassi: CHASSI_A, vNF: 95000 }), actor)
    expect(res.warnings.some((w) => w.field === 'amount')).toBe(true)
    await expect(fiscal.attachFiscalXml(sale.id, tenantId, nfe({ key: key(6), tpNF: '1', emit: CNPJ, destTag: 'CPF', dest: BUYER, chassi: CHASSI_A }), actor)).rejects.toThrow(/já tem NF-e/)
    // Saída exige ATPV-e assinada pelas duas partes (Res. Contran 1.026/2026).
    await expect(renave.renaveAction(sale.id, tenantId, 'EXIT', { protocol: 'SAI-777' }, actor)).rejects.toThrow(/ATPV-e/)
    await expect(transfer.advanceTransfer(sale.id, tenantId, 'ATPV_ISSUED', {}, actor)).rejects.toThrow(/Próxima etapa/)
    for (const st of ['INTENT_REGISTERED', 'ATPV_ISSUED', 'SELLER_SIGNED', 'BUYER_SIGNED']) await transfer.advanceTransfer(sale.id, tenantId, st, { protocol: `P-${st}` }, actor)
    await expect(transfer.advanceTransfer(sale.id, tenantId, 'INSPECTION_DONE', {}, actor)).rejects.toThrow(/saída no RENAVE/)
    const outs = await Promise.allSettled([1, 2, 3, 4, 5].map(() => renave.renaveAction(sale.id, tenantId, 'EXIT', { protocol: 'SAI-777' }, actor)))
    expect(outs.some((o) => o.status === 'fulfilled')).toBe(true)
    expect(await prisma.externalOperation.count({ where: { operationId: sale.id, action: 'EXIT_STOCK' } })).toBe(1)
    expect((await prisma.vehicleOperation.findUnique({ where: { id: sale.id } }))!.renaveStatus).toBe('EXIT_CONFIRMED')
    expect((await ops.vehicleRenaveFacts(carA)).renave).toBe('OUT')
  })

  it('13–18 · transferência por etapas, sem pular, até o CRLV-e', async () => {
    const sale = (await prisma.vehicleOperation.findFirst({ where: { dealId, kind: 'SALE' } }))!
    const { overallStatus } = await import('./status-core')
    // F&I primeiro (contrato pendente) — informa gravame e segue
    expect(overallStatus(sale as never).message).toMatch(/financiamento|gravame/i)
    await ops.applyToOperation(sale.id, { financingStatus: 'LIEN_REGISTERED' }, { actor })
    await ops.applyToOperation(sale.id, { financialStatus: 'PAID' }, { actor })
    expect(overallStatus((await prisma.vehicleOperation.findUnique({ where: { id: sale.id } })) as never).message).toMatch(/vistoria/)
    const ins = await transfer.transferInstructions(sale.id, tenantId)
    expect(ins.phone).toBe('5511999990000')
    for (const st of ['INSPECTION_DONE', 'FEES_PAID', 'TRANSFER_DONE', 'CRLV_ISSUED']) await transfer.advanceTransfer(sale.id, tenantId, st, {}, actor)
    const done = (await prisma.vehicleOperation.findUnique({ where: { id: sale.id } }))!
    expect(done.closedAt).toBeTruthy()
    expect(overallStatus(done as never).label).toBe('CONCLUÍDO')
  })

  it('21 · cancelamento com NF-e autorizada pede cancelamento da nota (nada é apagado)', async () => {
    await prisma.deal.update({ where: { id: dealId }, data: { status: 'CANCELADA', cancelledAt: new Date(), cancelledReason: 'Teste' } })
    await events.publishOpsEvent('deal.cancelled', `${dealId}:c1`, { dealId, actor }, tenantId)
    const sale = (await prisma.vehicleOperation.findFirst({ where: { dealId, kind: 'SALE' } }))!
    const { overallStatus } = await import('./status-core')
    expect(sale.cancelledAt).toBeTruthy()
    expect(overallStatus(sale as never).nextAction?.key).toBe('fiscal.cancel')
    const doc = (await prisma.fiscalDocument.findFirst({ where: { operationId: sale.id, status: 'AUTHORIZED' } }))!
    await expect(fiscal.cancelFiscalDocument(doc.id, tenantId, { reason: 'curto' }, actor)).rejects.toThrow(/15/)
    await fiscal.cancelFiscalDocument(doc.id, tenantId, { reason: 'Venda desfeita pelo cliente', protocol: 'CANC-1' }, actor)
    expect((await prisma.fiscalDocument.findUnique({ where: { id: doc.id } }))!.status).toBe('CANCELLED')
    expect(await prisma.operationEvent.count({ where: { operationId: sale.id } })).toBeGreaterThan(5)
  })

  it('22 · timeout do provedor vira UNKNOWN e não reenvia: consulta antes', async () => {
    let calls = 0
    const spec = { tenantId, domain: 'RENAVE' as const, action: 'TEST', providerId: 'FAKE', providerMode: 'API' as const, baseKey: `TEST:${tag}`, actor }
    const first = await external.runExternal(spec, async () => { calls++; throw new Error('ETIMEDOUT') })
    expect(first.ext.state).toBe('UNKNOWN')
    expect(first.ext.userMessage).toMatch(/verificando/)
    const second = await external.runExternal(spec, async () => { calls++; return { state: 'CONFIRMED' } }, async () => ({ state: 'CONFIRMED', protocol: 'OK' }))
    expect(second.plan).toBe('CHECK_STATUS')
    expect(calls).toBe(1)
    expect(second.ext.state).toBe('CONFIRMED')
  })

  it('29 · transferência entre lojas: pedido único, aceite move o estoque com registro', async () => {
    await prisma.vehicle.update({ where: { id: carB }, data: { stockStatus: 'DISPONIVEL' } })
    const t = await registry.requestStoreTransfer(carB, tenantId, unitB, 'Vitrine', actor)
    await expect(registry.requestStoreTransfer(carB, tenantId, unitB, null, actor)).rejects.toThrow(/aguardando aceite/)
    const r = await registry.decideStoreTransfer(t.id, tenantId, 'ACCEPT', null, actor)
    expect(r.operation?.kind).toBe('STORE_TRANSFER')
    expect((await prisma.vehicle.findUnique({ where: { id: carB } }))!.unitId).toBe(unitB)
    await expect(registry.decideStoreTransfer(t.id, tenantId, 'ACCEPT', null, actor)).rejects.toThrow(/já foi decidida/)
  })

  it('28 · reconciliação: indicadores do estoque', async () => {
    const s = await jobs.stockSummary(tenantId)
    expect(s.indicators.total).toBeGreaterThanOrEqual(1)
    expect(s.issues.length).toBeGreaterThanOrEqual(0)
  })

  it('9 · consignado: repasse calculado pelo contrato vira conta a pagar; cancelar desfaz', async () => {
    const car = (await prisma.vehicle.create({ data: { tenantId, unitId: unitA, brand: 'Honda', model: 'Civic', plate: 'CNS1G23', stockType: 'CONSIGNADO', stockStatus: 'DISPONIVEL', isAvailableForSale: true, purchasePrice: 85000 } })).id
    extraVehicles.push(car)
    const { createAcquisitionEntry } = await import('@/lib/stock/vehicle-ledger')
    await createAcquisitionEntry(car, null)
    await registry.saveConsignment(car, tenantId, { ownerName: 'Maria Dona', minPrice: 85000, commissionType: 'PERCENT', commissionValue: 10, payoutDays: 3 }, actor)
    const d = await prisma.deal.create({ data: { tenantId, unitId: unitA, type: 'VENDA', status: 'FINALIZADA', finalizedAt: new Date(), customerId, saleAmount: 100000, dealNumber: `NEG-C-${tag}` } as never })
    extraDeals.push(d.id)
    await prisma.dealVehicle.create({ data: { dealId: d.id, vehicleId: car, role: 'VENDIDO', agreedValue: 100000 } })
    await events.publishOpsEvent('deal.finalized', `${d.id}:x`, { dealId: d.id, actor }, tenantId)
    const c = (await prisma.consignmentContract.findFirst({ where: { vehicleId: car } }))!
    expect(c.status).toBe('SOLD')
    expect(Number(c.payoutAmount)).toBe(90000)
    const entry = (await prisma.financialEntry.findUnique({ where: { id: c.payoutEntryId! } }))!
    expect(Number(entry.amount)).toBe(90000)
    expect(entry.dueDate).toBeTruthy()
    expect(await prisma.financialEntry.count({ where: { vehicleId: car, source: { startsWith: 'VEICULO_REPASSE' }, status: { not: 'CANCELADO' } } })).toBe(1)
    await prisma.deal.update({ where: { id: d.id }, data: { status: 'CANCELADA', cancelledAt: new Date() } })
    await events.publishOpsEvent('deal.cancelled', `${d.id}:y`, { dealId: d.id, actor }, tenantId)
    const c2 = (await prisma.consignmentContract.findUnique({ where: { id: c.id } }))!
    expect(c2.status).toBe('ACTIVE')
    const e2 = (await prisma.financialEntry.findUnique({ where: { id: c.payoutEntryId! } }))!
    expect(e2.dueDate).toBeNull()
    expect(Number(e2.amount)).toBe(85000)
  })

  it('comissão: o banco recusa a mesma comissão duas vezes', async () => {
    const { commissionDedupKey } = await import('@/lib/commission-generator')
    const item = { ruleType: 'VENDA', commissionScope: 'SELLER_MAIN_COMMISSION', reference: {}, employeeKind: 'SELLER', employeeId: 's1', employeeUserId: null } as never
    const key = commissionDedupKey(tenantId, `deal-${tag}`, item)
    const data = { tenantId, period: '2026-10', ruleType: 'VENDA' as never, description: 'teste', baseValue: 1, commissionValue: 1, dedupKey: key }
    await prisma.commissionCalculation.create({ data })
    await expect(prisma.commissionCalculation.create({ data })).rejects.toMatchObject({ code: 'P2002' })
    await prisma.commissionCalculation.deleteMany({ where: { dedupKey: key } })
  })

  it('conectores: credencial cifrada, teste, ativação; consulta com RENAJUD trava a venda', async () => {
    const conns = await import('./connections')
    const vdata = await import('./vehicle-data')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).endsWith('/health')) return new Response('{}', { status: 200 })
      return new Response(JSON.stringify({ id: 'ext-1', status: 'DONE', debts: [{ type: 'IPVA', description: 'IPVA 2026', amount: 1200 }], restrictions: [{ kind: 'RENAJUD', description: 'Bloqueio judicial de circulação', blocking: true, reference: 'R1' }] }), { status: 200 })
    }))
    try {
      const saved = await conns.saveConnection(tenantId, { domain: 'VEHICLE_DATA', providerId: 'INFOSIMPLES', environment: 'PRODUCAO', fields: { baseUrl: 'https://provedor.test', apiKey: 'segredo-123456' } }, actor)
      const row = (await prisma.integrationConnection.findUnique({ where: { id: saved.id } }))!
      expect(row.secretsEncrypted).not.toContain('segredo-123456')
      expect((row.maskedHints as Record<string, string>).apiKey).toBe('••••3456')
      await expect(conns.activateConnection(tenantId, saved.id, actor)).rejects.toThrow(/Teste/)
      const { testProvider } = await import('./gateways/registry')
      const c = (await conns.connectionById(saved.id))!
      const t = await testProvider('VEHICLE_DATA', 'INFOSIMPLES', { tenantId, credentials: c.credentials, connectionId: c.id })
      expect(t.ok).toBe(true)
      await conns.recordTest(saved.id, true, null)
      await conns.activateConnection(tenantId, saved.id, actor)
      expect((await conns.activeConnection(tenantId, 'VEHICLE_DATA')).credentials.apiKey).toBe('segredo-123456')

      const car = (await prisma.vehicle.create({ data: { tenantId, unitId: unitA, brand: 'VW', model: 'Gol', plate: 'QRY1A23', stockStatus: 'DISPONIVEL', isAvailableForSale: true } })).id
      extraVehicles.push(car)
      const r = await vdata.requestVehicleQuery(car, tenantId, {}, actor)
      expect(r.query?.status).toBe('DONE')
      expect(Number(r.query?.debtsTotal)).toBe(1200)
      const again = await vdata.requestVehicleQuery(car, tenantId, {}, actor)
      expect(again.cached).toBe(true)
      expect((await overview.saleBlockers([car]))[0]?.reasons[0]).toMatch(/Bloqueio judicial/)
      const ready = await overview.vehicleReadiness(car)
      expect(ready?.readiness.warnings.some((w) => w.key === 'debts')).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('NF-e pela Focus: prévia aponta o que falta; emissão vai a autorizada e vincula', async () => {
    const conns = await import('./connections')
    const fe = await import('./fiscal-emission')
    const cfg = await import('./config')
    const current = await cfg.loadOpsConfig(tenantId)
    await cfg.saveOpsConfig(tenantId, { ...current, fiscalRules: { regime: 'NORMAL', ncmDefault: '87032310', confirmedAt: new Date().toISOString() } }, null)
    const car = (await prisma.vehicle.create({ data: { tenantId, unitId: unitA, brand: 'Fiat', model: 'Argo', plate: 'NFE1B23', chassi: '9BD358A1NMYH12345', stockStatus: 'DISPONIVEL', isAvailableForSale: true, purchasePrice: 60000 } })).id
    extraVehicles.push(car)
    const person = await prisma.person.create({ data: { tenantId, type: 'FISICA', nomeCompleto: 'Ana Compradora', cpf: '52998224725', logradouro: 'Rua B', numero: '20', bairro: 'Centro', cidade: 'São Paulo', estado: 'SP', cep: '01001000' } as never })
    extraPersons.push(person.id)
    const d = await prisma.deal.create({ data: { tenantId, unitId: unitA, type: 'VENDA', status: 'FINALIZADA', finalizedAt: new Date(), personId: person.id, saleAmount: 75000, dealNumber: `NEG-F-${tag}` } as never })
    extraDeals.push(d.id)
    await prisma.dealVehicle.create({ data: { dealId: d.id, vehicleId: car, role: 'VENDIDO', agreedValue: 75000 } })
    const [op] = (await ops.syncDealOperations(d.id, actor)).filter((o) => o.kind === 'SALE')

    let pv = await fe.fiscalPreview(op.id, tenantId)
    expect(pv.mode).toBe('MANUAL')

    let authorized = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('viacep')) return new Response(JSON.stringify({ ibge: '3550308' }))
      if (u.includes('autodrive-teste-conexao')) return new Response('{}', { status: 404 })
      if (u.includes('?ref=')) return new Response(JSON.stringify({ status: 'processando_autorizacao' }), { status: 202 })
      if (u.includes('/arquivos/')) return new Response('<nfeProc><NFe><infNFe Id="NFe00"><ide><mod>55</mod><nNF>77</nNF><serie>1</serie><tpNF>1</tpNF></ide><emit><CNPJ>11222333000181</CNPJ></emit><dest><CPF>52998224725</CPF></dest><det><prod><CFOP>5102</CFOP></prod></det></infNFe></NFe><protNFe><infProt><cStat>100</cStat><nProt>1</nProt></infProt></protNFe></nfeProc>')
      authorized = true
      return new Response(JSON.stringify({ status: 'autorizado', chave_nfe: `35${tag}`.padEnd(44, '1').slice(0, 44), numero: '77', serie: '1', caminho_xml_nota_fiscal: '/arquivos/x.xml' }))
    }))
    try {
      const saved = await conns.saveConnection(tenantId, { domain: 'FISCAL', providerId: 'FOCUS_NFE', environment: 'HOMOLOGACAO', fields: { token: 'tok-focus' } }, actor)
      await conns.recordTest(saved.id, true, null)
      await conns.activateConnection(tenantId, saved.id, actor)
      pv = await fe.fiscalPreview(op.id, tenantId)
      expect(pv).toMatchObject({ mode: 'API', missing: [] })
      expect(pv.summary).toMatchObject({ cfop: '5102', amount: 75000 })
      const r = await fe.emitFiscal(op.id, tenantId, actor)
      expect(r.status).toBe('PROCESSING')
      expect(authorized).toBe(true)
      const doc = (await prisma.fiscalDocument.findFirst({ where: { operationId: op.id } }))!
      expect(doc.status).toBe('AUTHORIZED')
      expect(doc.number).toBe('77')
      expect((await prisma.vehicleOperation.findUnique({ where: { id: op.id } }))!.fiscalStatus).toBe('AUTHORIZED')
      await expect(fe.emitFiscal(op.id, tenantId, actor)).rejects.toThrow(/já tem NF-e/)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('menu Operações: painel e listas da loja', async () => {
    const lists = await import('./lists')
    const dash = await lists.opsDashboard(tenantId)
    expect(dash.renave.total).toBeGreaterThan(0)
    expect(dash.connections.FISCAL.providerId).toBe('FOCUS_NFE')
    const notas = await lists.opsList(tenantId, 'fiscal', 'authorized', '')
    expect(notas.some((r) => r.title.startsWith('NF-e 77'))).toBe(true)
    const consultas = await lists.opsList(tenantId, 'queries', 'restrictions', 'QRY1')
    expect(consultas).toHaveLength(1)
    expect(consultas[0].tone).toBe('critical')
    const lojas = await lists.opsList(tenantId, 'transfer', 'stores', '')
    expect(lojas[0].title).toContain('→')
    for (const f of ['pending', 'issues', 'divergent', 'confirmed']) await lists.opsList(tenantId, 'renave', f, '')
    for (const f of ['pending', 'rejected', 'cancelled']) await lists.opsList(tenantId, 'fiscal', f, '')
    await lists.opsList(tenantId, 'transfer', 'open', '')
  })

  it('23 · webhook duplicado é processado uma vez', async () => {
    const provider = `E2E${tag}`
    const a = await prisma.webhookInbox.createMany({ data: [{ provider, eventId: 'ev-1' }], skipDuplicates: true })
    const b = await prisma.webhookInbox.createMany({ data: [{ provider, eventId: 'ev-1' }], skipDuplicates: true })
    expect(a.count).toBe(1); expect(b.count).toBe(0)
  })
})
