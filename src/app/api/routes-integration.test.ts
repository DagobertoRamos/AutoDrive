// =============================================================================
// Testes de integração das rotas — AutoDrive
// Exercita os handlers REAIS com `prisma` e a sessão MOCKADOS. Valida a lógica
// real de autenticação, RBAC (permissions) e isolamento multi-tenant
// (tenantWhere) — sem precisar de banco. auth-guards/permissions rodam de verdade.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted: mocks criados antes dos imports (evita TDZ no factory do vi.mock).
const { prismaMock, authMock } = vi.hoisted(() => ({
  prismaMock: {
    goal: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    warranty: { findMany: vi.fn(), create: vi.fn() },
    unit: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    seller: { findMany: vi.fn(), findFirst: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    tenantModule: { findUnique: vi.fn() },
    userModule: { findUnique: vi.fn() },
    sellerQueueAttendance: { findMany: vi.fn() },
    rankingRule: { findFirst: vi.fn() },
    commissionCalculation: { findMany: vi.fn(), groupBy: vi.fn() },
    sellerQueueUnitConfig: { findMany: vi.fn() },
    sellerQueuePenalty: { findMany: vi.fn() },
    sellerQueueFraudFlag: { findMany: vi.fn() },
  },
  authMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/auth', () => ({ getServerAuthSession: authMock, authOptions: {} }))

import { GET as goalsGET, POST as goalsPOST } from '@/app/api/goals/route'
import { GET as warrGET, POST as warrPOST } from '@/app/api/warranties/route'
import { GET as rankingGET } from '@/app/api/ranking/route'
import { GET as commCalcGET } from '@/app/api/commissions/calculations/route'

function session(role: string, tenantId: string | null, unitId: string | null = null) {
  return { user: { id: 'u1', name: 'U', email: 'u@x.com', role, tenantId, unitId, status: 'ATIVO' } }
}
const req = (url: string, init?: RequestInit) => new Request(url, init)
const jsonReq = (url: string, method: string, body: unknown) =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue(session('VENDEDOR', 't1', 'unitA'))
  prismaMock.goal.findMany.mockResolvedValue([])
  prismaMock.goal.create.mockResolvedValue({ id: 'g1', levels: [] })
  prismaMock.goal.findFirst.mockResolvedValue(null)
  prismaMock.warranty.findMany.mockResolvedValue([])
  prismaMock.warranty.create.mockResolvedValue({ id: 'w1' })
  prismaMock.unit.findFirst.mockResolvedValue({ id: 'unitA' })
  prismaMock.auditLog.create.mockResolvedValue({})
  prismaMock.seller.findMany.mockResolvedValue([])
  prismaMock.seller.findFirst.mockResolvedValue({ id: 'seller1' })
  prismaMock.user.findMany.mockResolvedValue([])
  prismaMock.user.findUnique.mockResolvedValue({
    unitId: 'unitA',
    seller: { id: 'seller1', unitId: 'unitA' },
    manager: null,
  })
  prismaMock.tenantModule.findUnique.mockResolvedValue(null)
  prismaMock.userModule.findUnique.mockResolvedValue(null)
  prismaMock.sellerQueueAttendance.findMany.mockResolvedValue([])
  prismaMock.rankingRule.findFirst.mockResolvedValue(null)
  prismaMock.commissionCalculation.findMany.mockResolvedValue([])
  prismaMock.commissionCalculation.groupBy.mockResolvedValue([])
  prismaMock.sellerQueueUnitConfig.findMany.mockResolvedValue([])
  prismaMock.sellerQueuePenalty.findMany.mockResolvedValue([])
  prismaMock.sellerQueueFraudFlag.findMany.mockResolvedValue([])
})

describe('/api/goals', () => {
  it('401 quando não autenticado', async () => {
    authMock.mockResolvedValueOnce(null)
    const res = await goalsGET(req('http://x/api/goals'))
    expect(res.status).toBe(401)
  })

  it('GET (VENDEDOR) filtra por tenantId da sessão', async () => {
    const res = await goalsGET(req('http://x/api/goals'))
    expect(res.status).toBe(200)
    const where = prismaMock.goal.findMany.mock.calls[0][0].where
    expect(where.tenantId).toBe('t1') // isolamento de tenant
  })

  it('POST negado para VENDEDOR (sem goals.manage)', async () => {
    const res = await goalsPOST(jsonReq('http://x/api/goals', 'POST', {}))
    expect(res.status).toBe(403)
    expect(prismaMock.goal.create).not.toHaveBeenCalled()
  })

  it('POST (ADM) cria meta com tenantId da sessão', async () => {
    authMock.mockResolvedValue(session('ADM', 't1'))
    const res = await goalsPOST(jsonReq('http://x/api/goals', 'POST', {
      type: 'SALES_EXCHANGE', scope: 'TENANT', period: 'MONTHLY',
      startDate: '2026-06-01', endDate: '2026-06-30', targetValue: 10,
    }))
    expect(res.status).toBe(201)
    expect(prismaMock.goal.create.mock.calls[0][0].data.tenantId).toBe('t1')
  })

  it('POST (ADM) rejeita payload inválido (400)', async () => {
    authMock.mockResolvedValue(session('ADM', 't1'))
    const res = await goalsPOST(jsonReq('http://x/api/goals', 'POST', { type: 'XXX', scope: 'TENANT', period: 'MONTHLY', startDate: '2026-06-01', endDate: '2026-06-30', targetValue: 10 }))
    expect(res.status).toBe(400)
  })
})

describe('/api/warranties', () => {
  it('GET filtra por tenantId da sessão', async () => {
    const res = await warrGET(req('http://x/api/warranties'))
    expect(res.status).toBe(200)
    expect(prismaMock.warranty.findMany.mock.calls[0][0].where.tenantId).toBe('t1')
  })

  it('POST negado para VENDEDOR (sem registrations.warranties)', async () => {
    const res = await warrPOST(jsonReq('http://x/api/warranties', 'POST', {}))
    expect(res.status).toBe(403)
    expect(prismaMock.warranty.create).not.toHaveBeenCalled()
  })

  it('POST (FINANCEIRO) cria garantia com tenantId da sessão', async () => {
    authMock.mockResolvedValue(session('FINANCEIRO', 't1'))
    const res = await warrPOST(jsonReq('http://x/api/warranties', 'POST', {
      name: 'Garantia X',
      durationYears: 1,
      fullPrice: 1000,
      reducedPrice: 600,
    }))
    expect(res.status).toBe(201)
    expect(prismaMock.warranty.create.mock.calls[0][0].data.tenantId).toBe('t1')
  })
})

describe('/api/ranking', () => {
  it('VENDEDOR é restrito à própria unidade e tenant', async () => {
    const res = await rankingGET(req('http://x/api/ranking?period=MONTHLY&unitId=outraUnidade'))
    expect(res.status).toBe(200)
    const where = prismaMock.seller.findMany.mock.calls[0][0].where
    expect(where.unit.tenantId).toBe('t1')  // isolamento de tenant
    expect(where.unitId).toBe('unitA')       // ignora unitId da query; usa a própria
  })

  it('MASTER sem tenantId → 400', async () => {
    authMock.mockResolvedValue(session('MASTER', null))
    const res = await rankingGET(req('http://x/api/ranking?period=MONTHLY'))
    expect(res.status).toBe(400)
  })
})

describe('/api/commissions/calculations', () => {
  it('VENDEDOR vê apenas as próprias comissões, no seu tenant', async () => {
    const res = await commCalcGET(req('http://x/api/commissions/calculations'))
    expect(res.status).toBe(200)
    const where = prismaMock.commissionCalculation.findMany.mock.calls[0][0].where
    expect(JSON.stringify(where)).toContain('"tenantId":"t1"')
    expect(JSON.stringify(where)).toContain('"sellerId":"seller1"') // forçado ao próprio vendedor
  })
})
