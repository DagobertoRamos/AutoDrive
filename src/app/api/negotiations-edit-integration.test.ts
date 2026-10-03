// =============================================================================
// Testes de integração — PATCH /api/negotiations/[id] (edição da negociação)
// Exercita o handler REAL com `prisma`/sessão MOCKADOS sobre um banco em memória.
// Antes, a edição descartava veículo, carro da troca, pagamentos e débitos; aqui
// provamos que eles são gravados, com as mesmas travas da criação.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const { db, prismaMock, authMock } = vi.hoisted(() => {
  const db: Record<string, Row[]> = {}
  let seq = 0
  const matchValue = (val: unknown, cond: unknown): boolean => {
    if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>
      if ('in' in c) return (c.in as unknown[]).includes(val)
      if ('notIn' in c) return !(c.notIn as unknown[]).includes(val)
      if ('not' in c) return val !== c.not
    }
    return val === cond
  }
  const matches = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([k, cond]) => {
    if (k === 'OR') return (cond as Row[]).some((w) => matches(row, w))
    if (k === 'deal') { const d = db.deal.find((x) => x.id === row.dealId); return !!d && matches(d, cond as Row) }
    if (k === 'unit') { const u = db.unit.find((x) => x.id === row.unitId); return !!u && matches(u, cond as Row) }
    if (cond === undefined) return true
    return matchValue(row[k], cond)
  })
  const model = (name: string) => {
    db[name] = []
    return {
      // Relação `deal` populada para quem a seleciona (ex.: trava de venda duplicada).
      findFirst: vi.fn(async (a: Row = {}) => { const r = db[name].find((x) => matches(x, a.where)); return r ? { ...r, deal: db.deal?.find((d) => d.id === r.dealId) } : null }),
      findUnique: vi.fn(async (a: Row = {}) => db[name].find((r) => matches(r, a.where)) ?? null),
      findUniqueOrThrow: vi.fn(async (a: Row = {}) => { const r = db[name].find((x) => matches(x, a.where)); if (!r) throw new Error('not found'); return r }),
      findMany: vi.fn(async (a: Row = {}) => db[name].filter((r) => matches(r, a.where))),
      create: vi.fn(async (a: Row) => { const r = { id: `${name}_${++seq}`, ...a.data }; db[name].push(r); return r }),
      update: vi.fn(async (a: Row) => { const r = db[name].find((x) => matches(x, a.where)); if (!r) throw new Error('not found'); Object.assign(r, a.data); return r }),
      updateMany: vi.fn(async (a: Row) => { const rs = db[name].filter((x) => matches(x, a.where)); rs.forEach((r) => Object.assign(r, a.data)); return { count: rs.length } }),
      delete: vi.fn(async (a: Row) => { const i = db[name].findIndex((x) => matches(x, a.where)); const [r] = db[name].splice(i, 1); return r }),
    }
  }
  const prismaMock: Record<string, any> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const m of ['deal', 'person', 'unit', 'seller', 'user', 'auditLog', 'dealAuditLog', 'dealVehicle', 'vehicle',
    'vehicleEvaluation', 'dealPayment', 'dealDebt', 'dealAttachment', 'tenantModule', 'userModule',
    'dealStatusHistory', 'dealChange', 'dealDraft']) prismaMock[m] = model(m)
  prismaMock.deal.count = vi.fn(async () => db.deal.length)
  prismaMock.$transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaMock))
  return { db, prismaMock, authMock: vi.fn() }
})

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/auth', () => ({ getServerAuthSession: authMock, authOptions: {} }))
vi.mock('@/lib/finance/deal-finance-sync', () => ({ syncDealFinanceSafe: vi.fn(async () => {}) }))
vi.mock('@/lib/publications/service', () => ({ notifyStockChanged: vi.fn() }))
vi.mock('@/lib/stock/intake', () => ({ resolveNegotiationGate: vi.fn(async () => 0) }))

import { PATCH } from '@/app/api/negotiations/[id]/route'
import { POST } from '@/app/api/negotiations/route'

const session = (role: string, tenantId: string | null) =>
  ({ user: { id: 'u1', name: 'U', email: 'u@x.com', role, tenantId, unitId: null, status: 'ATIVO' } })
const patch = (body: unknown, id = 'd1') => PATCH(
  new Request(`http://x/api/negotiations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never,
  { params: Promise.resolve({ id }) },
)
const vehiclesOf = (dealId = 'd1') => db.dealVehicle.filter((v) => v.dealId === dealId)

beforeEach(() => {
  for (const k of Object.keys(db)) db[k].length = 0
  vi.clearAllMocks()
  authMock.mockResolvedValue(session('ADM', 'tA'))
  db.deal.push(
    { id: 'd1', tenantId: 'tA', unitId: 'uA', sellerId: null, type: 'TROCA', status: 'RASCUNHO', saleAmount: '50000' },
    { id: 'd2', tenantId: 'tA', unitId: 'uA', sellerId: null, type: 'VENDA', status: 'AGUARDANDO_APROVACAO' },
  )
  db.unit.push({ id: 'uA', tenantId: 'tA' }, { id: 'uB', tenantId: 'tB' })
  db.vehicle.push(
    { id: 'car1', tenantId: 'tA', plate: 'AAA1A11', stockStatus: 'EM_NEGOCIACAO' },
    { id: 'car2', tenantId: 'tA', plate: 'BBB2B22', stockStatus: 'DISPONIVEL' },
    { id: 'car3', tenantId: 'tA', plate: 'CCC3C33', stockStatus: 'DISPONIVEL' },
    { id: 'carB', tenantId: 'tB', plate: 'ZZZ9Z99', stockStatus: 'DISPONIVEL' },
  )
  db.dealVehicle.push(
    { id: 'dv1', dealId: 'd1', role: 'VENDIDO', vehicleId: 'car1', plate: 'AAA1A11' },
    { id: 'dv2', dealId: 'd1', role: 'TROCA', vehicleId: null, plate: 'TRC1T11' },
    { id: 'dv3', dealId: 'd2', role: 'VENDIDO', vehicleId: 'car3', plate: 'CCC3C33' },
  )
  db.dealPayment.push(
    { id: 'p-ok', dealId: 'd1', type: 'PIX', status: 'CONFIRMADO', value: 1000 },
    { id: 'p-pend', dealId: 'd1', type: 'FINANCIAMENTO', status: 'PENDENTE', value: 40000 },
    { id: 'p-gone', dealId: 'd1', type: 'DINHEIRO', status: 'PENDENTE', value: 500 },
  )
  db.dealDebt.push({ id: 'deb1', dealId: 'd1', type: 'IPVA', value: 900 }, { id: 'deb2', dealId: 'd1', type: 'MULTA', value: 200 })
})

describe('PATCH /api/negotiations/[id] — veículos', () => {
  it('troca o carro do estoque: grava o novo, devolve o antigo ao estoque e segura o novo', async () => {
    const res = await patch({ vehicle: { vehicleId: 'car2', plate: 'BBB2B22', brand: 'VW' } })
    expect(res.status).toBe(200)
    const main = vehiclesOf().find((v) => v.role === 'VENDIDO')
    expect(main?.vehicleId).toBe('car2')
    expect(db.vehicle.find((v) => v.id === 'car1')?.stockStatus).toBe('DISPONIVEL')
    expect(db.vehicle.find((v) => v.id === 'car2')?.stockStatus).toBe('EM_NEGOCIACAO')
  })

  it('mesmo carro: não mexe no estoque e mantém a linha', async () => {
    await patch({ vehicle: { vehicleId: 'car1', plate: 'AAA1A11', km: 1000 } })
    const main = vehiclesOf().find((v) => v.role === 'VENDIDO')
    expect(main?.id).toBe('dv1')
    expect(main?.km).toBe(1000)
    expect(db.vehicle.find((v) => v.id === 'car1')?.stockStatus).toBe('EM_NEGOCIACAO')
  })

  it('recusa carro que já está em outra venda ativa', async () => {
    const res = await patch({ vehicle: { vehicleId: 'car3', plate: 'CCC3C33' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/já está em negociação/)
  })

  it('recusa carro do estoque de outra loja', async () => {
    const res = await patch({ vehicle: { vehicleId: 'carB', plate: 'ZZZ9Z99' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/estoque desta loja/)
  })

  it('veículo ausente no payload não é apagado; null (removido pelo usuário) apaga', async () => {
    await patch({ notes: 'x' })
    expect(vehiclesOf()).toHaveLength(2)
    await patch({ tradeInVehicle: null })
    expect(vehiclesOf().some((v) => v.role === 'TROCA')).toBe(false)
    expect(vehiclesOf().some((v) => v.role === 'VENDIDO')).toBe(true)
  })

  it('troca o carro recebido na troca validando a avaliação', async () => {
    db.vehicleEvaluation.push({ id: 'ev1', status: 'LIBERADA', customerDecision: 'PENDENTE' })
    const res = await patch({ tradeInVehicle: { evaluationId: 'ev1', plate: 'NEW1N11' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Cliente ainda não aceitou/)
    db.vehicleEvaluation[0].customerDecision = 'ACEITA'
    expect((await patch({ tradeInVehicle: { evaluationId: 'ev1', plate: 'NEW1N11', agreedValue: 30000 } })).status).toBe(200)
    const trade = vehiclesOf().find((v) => v.role === 'TROCA')
    expect(trade?.plate).toBe('NEW1N11')
    expect(trade?.agreedValue).toBe(30000)
  })
})

describe('PATCH /api/negotiations/[id] — pagamentos e débitos', () => {
  it('pendentes seguem a tela; confirmado pelo financeiro não muda nem some', async () => {
    const res = await patch({
      payments: [
        { id: 'p-ok', type: 'PIX', amount: 99999 },           // tentativa de alterar confirmado
        { id: 'p-pend', type: 'FINANCIAMENTO', amount: 42000 }, // edição de pendente
        { id: 'tmp_novo', type: 'DINHEIRO', amount: 300 },       // novo
      ],
    })
    expect(res.status).toBe(200)
    const pays = db.dealPayment.filter((p) => p.dealId === 'd1')
    expect(pays.find((p) => p.id === 'p-ok')?.value).toBe(1000)
    expect(pays.find((p) => p.id === 'p-pend')?.value).toBe(42000)
    expect(pays.some((p) => p.id === 'p-gone')).toBe(false)
    expect(pays.filter((p) => p.type === 'DINHEIRO')).toEqual([expect.objectContaining({ value: 300, status: 'PENDENTE', tenantId: 'tA' })])
  })

  it('confirmado não some mesmo se a tela não o enviar', async () => {
    await patch({ payments: [] })
    expect(db.dealPayment.map((p) => p.id)).toEqual(['p-ok'])
  })

  it('débitos: edita, cria e remove conforme a tela', async () => {
    await patch({ debts: [{ id: 'deb1', type: 'IPVA', value: 950, dueDate: '2026-11-10' }, { id: 'local1', type: 'LICENCIAMENTO', value: 150 }] })
    const debts = db.dealDebt.filter((d) => d.dealId === 'd1')
    expect(debts.map((d) => d.type).sort()).toEqual(['IPVA', 'LICENCIAMENTO'])
    expect(debts.find((d) => d.id === 'deb1')?.value).toBe(950)
  })
})

describe('PATCH /api/negotiations/[id] — loja e vendedor', () => {
  it('recusa unidade de outra loja', async () => {
    const res = await patch({ unitId: 'uB' })
    expect(res.status).toBe(400)
    expect(db.deal[0].unitId).toBe('uA')
  })

  it('ADM da loja B não edita negociação da loja A', async () => {
    authMock.mockResolvedValue(session('ADM', 'tB'))
    expect((await patch({ vehicle: null })).status).toBe(404)
    expect(vehiclesOf()).toHaveLength(2)
  })
})

describe('POST /api/negotiations — mesmas travas na criação', () => {
  const post = (body: unknown) => POST(new Request('http://x/api/negotiations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never)
  const base = { type: 'VENDA', personId: null, person: { nomeCompleto: 'Cliente' }, saleAmount: 50000 }

  it('recusa carro que já está em outra venda ativa', async () => {
    const res = await post({ ...base, vehicle: { vehicleId: 'car3', plate: 'CCC3C33' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/já está em negociação/)
  })

  it('cria veículo, pagamentos PENDENTES e débitos da tela', async () => {
    const res = await post({
      ...base, vehicle: { vehicleId: 'car2', plate: 'BBB2B22' },
      payments: [{ id: 'tmp_1', type: 'PIX', status: 'CONFIRMADO', amount: 5000 }],
      debts: [{ id: 'x', type: 'IPVA', value: 800, dueDate: '2026-12-01' }],
    })
    expect(res.status).toBe(201)
    const id = (await res.json()).data.id
    expect(db.dealVehicle.find((v) => v.dealId === id)?.vehicleId).toBe('car2')
    expect(db.vehicle.find((v) => v.id === 'car2')?.stockStatus).toBe('EM_NEGOCIACAO')
    expect(db.dealPayment.filter((p) => p.dealId === id)).toEqual([expect.objectContaining({ type: 'PIX', status: 'PENDENTE', value: 5000 })])
    expect(db.dealDebt.filter((d) => d.dealId === id)).toEqual([expect.objectContaining({ type: 'IPVA', value: 800 })])
  })
})
