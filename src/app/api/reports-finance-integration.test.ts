// =============================================================================
// Testes de integração — APIs de Relatórios e Financeiro (AutoDrive)
// Exercita os handlers REAIS com `prisma`/sessão MOCKADOS. Valida autenticação,
// RBAC (canAccessModule 'logs'/'finance'/'finance.manage') e isolamento
// multi-tenant (tenantWhere / escopo por relação) — sem banco.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock, authMock } = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    prismaMock: {
      deal: { findMany: fn(), groupBy: fn() },
      commissionCalculation: { findMany: fn(), groupBy: fn() },
      pendency: { findMany: fn(), groupBy: fn() },
      notification: { findMany: fn(), groupBy: fn() },
      pendencyMessage: { findMany: fn(), groupBy: fn() },
      messageReturn: { count: fn() },
      notificationDelivery: { findMany: fn(), groupBy: fn() },
      auditLog: { findMany: fn(), groupBy: fn(), create: fn() },
      financialEntry: { findMany: fn(), groupBy: fn(), aggregate: fn(), create: fn(), createMany: fn(), findUnique: fn(), update: fn(), updateMany: fn(), delete: fn(), deleteMany: fn() },
      financialAccount: { findMany: fn(), create: fn(), findUnique: fn(), update: fn() },
      financialCategory: { findMany: fn(), findFirst: fn(), create: fn(), findUnique: fn(), update: fn() },
      seller: { findMany: fn(), findFirst: fn() },
      unit: { findMany: fn(), findFirst: fn() },
      user: { findMany: fn() },
      userModule: { findUnique: fn() },
      tenantModule: { findUnique: fn() },
    },
    authMock: vi.fn(),
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/auth', () => ({ getServerAuthSession: authMock, authOptions: {} }))

import { GET as negGET } from '@/app/api/reports/negotiations/route'
import { GET as comReportGET } from '@/app/api/reports/commissions/route'
import { GET as pendGET } from '@/app/api/reports/pendencies/route'
import { GET as commGET } from '@/app/api/reports/communication/route'
import { GET as auditGET } from '@/app/api/reports/audit/route'
import { GET as finReportGET } from '@/app/api/reports/finance/route'
import { GET as accGET, POST as accPOST } from '@/app/api/finance/accounts/route'
import { PATCH as accPATCH } from '@/app/api/finance/accounts/[id]/route'
import { GET as catGET, POST as catPOST } from '@/app/api/finance/categories/route'
import { GET as entGET, POST as entPOST } from '@/app/api/finance/entries/route'
import { POST as syncPOST } from '@/app/api/finance/sync/route'

function session(role: string, tenantId: string | null, unitId: string | null = null) {
  return { user: { id: 'u1', name: 'U', email: 'u@x.com', role, tenantId, unitId, status: 'ATIVO' } }
}
const req = (url: string) => new Request(url)
const jsonReq = (url: string, method: string, body: unknown) =>
  new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const ctx = (id = 'x1') => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue(session('ADM', 't1'))
  // Defaults que evitam throw nos handlers (Promise.all etc.)
  for (const m of [prismaMock.deal, prismaMock.commissionCalculation, prismaMock.pendency, prismaMock.notification, prismaMock.pendencyMessage, prismaMock.notificationDelivery, prismaMock.auditLog, prismaMock.financialEntry, prismaMock.financialAccount, prismaMock.financialCategory, prismaMock.seller, prismaMock.unit, prismaMock.user]) {
    if ('findMany' in m) (m as { findMany: ReturnType<typeof vi.fn> }).findMany.mockResolvedValue([])
    if ('groupBy' in m) (m as { groupBy: ReturnType<typeof vi.fn> }).groupBy.mockResolvedValue([])
  }
  prismaMock.messageReturn.count.mockResolvedValue(0)
  prismaMock.financialEntry.aggregate.mockResolvedValue({ _sum: { amount: null } })
  prismaMock.financialEntry.create.mockResolvedValue({ id: 'e1', amount: 100 })
  prismaMock.financialEntry.createMany.mockResolvedValue({ count: 0 })
  prismaMock.financialEntry.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.financialEntry.updateMany.mockResolvedValue({ count: 0 })
  prismaMock.financialCategory.findFirst.mockResolvedValue({ id: 'cat1' })
  prismaMock.financialEntry.findUnique.mockResolvedValue({ id: 'e1', tenantId: 't1', source: 'MANUAL', amount: 100 })
  prismaMock.financialEntry.update.mockResolvedValue({ id: 'e1', amount: 100 })
  prismaMock.financialAccount.create.mockResolvedValue({ id: 'a1' })
  prismaMock.financialAccount.findUnique.mockResolvedValue({ id: 'a1', tenantId: 't1', active: true })
  prismaMock.financialAccount.update.mockResolvedValue({ id: 'a1' })
  prismaMock.financialCategory.create.mockResolvedValue({ id: 'c1' })
  prismaMock.auditLog.create.mockResolvedValue({})
})

// ── Relatórios: gating 'logs' + isolamento de tenant ─────────────────────────
describe('Relatórios — RBAC (logs) e tenant', () => {
  const cases: [string, (r: Request) => Promise<Response>, string][] = [
    ['negotiations', negGET, 'http://x/api/reports/negotiations?type=VENDA'],
    ['commissions', comReportGET, 'http://x/api/reports/commissions?view=geral'],
    ['pendencies', pendGET, 'http://x/api/reports/pendencies?view=abertas'],
    ['communication', commGET, 'http://x/api/reports/communication?view=avisos'],
    ['audit', auditGET, 'http://x/api/reports/audit?view=acessos'],
    ['finance', finReportGET, 'http://x/api/reports/finance?view=receitas'],
  ]

  for (const [name, handler, url] of cases) {
    it(`${name}: 401 sem sessão`, async () => {
      authMock.mockResolvedValueOnce(null)
      expect((await handler(req(url))).status).toBe(401)
    })
    it(`${name}: 403 para VENDEDOR (sem 'logs')`, async () => {
      authMock.mockResolvedValue(session('VENDEDOR', 't1'))
      expect((await handler(req(url))).status).toBe(403)
    })
    it(`${name}: 200 para ADM`, async () => {
      expect((await handler(req(url))).status).toBe(200)
    })
  }

  it("negotiations: where inclui tenantId da sessão e type", async () => {
    await negGET(req('http://x/api/reports/negotiations?type=TROCA'))
    const where = prismaMock.deal.findMany.mock.calls[0][0].where
    expect(where.tenantId).toBe('t1')
    expect(where.type).toBe('TROCA')
  })

  it('finance (receitas): findMany filtra por tenantId e type RECEITA', async () => {
    await finReportGET(req('http://x/api/reports/finance?view=receitas'))
    const where = prismaMock.financialEntry.findMany.mock.calls[0][0].where
    expect(where.tenantId).toBe('t1')
    expect(where.type).toBe('RECEITA')
  })

  it('audit (exclusoes): where tem tenantId e filtro de ação por DELETE/REMOVE', async () => {
    await auditGET(req('http://x/api/reports/audit?view=exclusoes'))
    const where = prismaMock.auditLog.findMany.mock.calls[0][0].where
    expect(where.tenantId).toBe('t1')
    expect(Array.isArray(where.OR)).toBe(true)
  })

  it('communication (whatsapp): escopa via relação pendency para não-MASTER', async () => {
    await commGET(req('http://x/api/reports/communication?view=whatsapp'))
    const where = prismaMock.pendencyMessage.findMany.mock.calls[0][0].where
    expect(where.pendency).toEqual({ tenantId: 't1' })
    expect(where.channel).toBe('WHATSAPP')
  })

  it('communication (avisos) MASTER: sem filtro de tenant (vê tudo)', async () => {
    authMock.mockResolvedValue(session('MASTER', null))
    await commGET(req('http://x/api/reports/communication?view=avisos'))
    const where = prismaMock.notification.findMany.mock.calls[0][0].where
    expect(where.tenantId).toBeUndefined()
  })
})

// ── Financeiro CRUD: gating 'finance' / 'finance.manage' ─────────────────────
describe('Financeiro — RBAC e tenant', () => {
  it('accounts GET: 403 VENDEDOR (sem finance)', async () => {
    authMock.mockResolvedValue(session('VENDEDOR', 't1'))
    expect((await accGET(req('http://x/api/finance/accounts'))).status).toBe(403)
  })
  it('accounts GET: 200 ADM, filtra tenant', async () => {
    const res = await accGET(req('http://x/api/finance/accounts'))
    expect(res.status).toBe(200)
    expect(prismaMock.financialAccount.findMany.mock.calls[0][0].where.tenantId).toBe('t1')
  })
  it('accounts POST: 403 sem finance.manage (GERENTE)', async () => {
    authMock.mockResolvedValue(session('GERENTE', 't1'))
    const res = await accPOST(jsonReq('http://x/api/finance/accounts', 'POST', { name: 'Caixa', type: 'CAIXA' }))
    expect(res.status).toBe(403)
    expect(prismaMock.financialAccount.create).not.toHaveBeenCalled()
  })
  it('accounts POST: 201 FINANCEIRO grava tenantId da sessão', async () => {
    authMock.mockResolvedValue(session('FINANCEIRO', 't1'))
    const res = await accPOST(jsonReq('http://x/api/finance/accounts', 'POST', { name: 'Caixa loja', type: 'CAIXA', openingBalance: 100 }))
    expect(res.status).toBe(201)
    expect(prismaMock.financialAccount.create.mock.calls[0][0].data.tenantId).toBe('t1')
  })
  it('accounts POST: 400 payload inválido', async () => {
    authMock.mockResolvedValue(session('FINANCEIRO', 't1'))
    const res = await accPOST(jsonReq('http://x/api/finance/accounts', 'POST', { name: 'x' }))
    expect(res.status).toBe(400)
  })

  it('accounts PATCH: 403 conta de outro tenant', async () => {
    prismaMock.financialAccount.findUnique.mockResolvedValue({ id: 'a1', tenantId: 'OUTRO', active: true })
    const res = await accPATCH(jsonReq('http://x/api/finance/accounts/a1', 'PATCH', { name: 'novo' }), ctx('a1'))
    expect(res.status).toBe(403)
    expect(prismaMock.financialAccount.update).not.toHaveBeenCalled()
  })
  it('accounts PATCH: 404 inexistente', async () => {
    prismaMock.financialAccount.findUnique.mockResolvedValue(null)
    const res = await accPATCH(jsonReq('http://x/api/finance/accounts/zz', 'PATCH', { name: 'n' }), ctx('zz'))
    expect(res.status).toBe(404)
  })

  it('categories GET: filtra ?kind=DESPESA + tenant', async () => {
    await catGET(req('http://x/api/finance/categories?kind=DESPESA'))
    const where = prismaMock.financialCategory.findMany.mock.calls[0][0].where
    expect(where.tenantId).toBe('t1')
    expect(where.kind).toBe('DESPESA')
  })
  it('categories POST: 201 FINANCEIRO', async () => {
    authMock.mockResolvedValue(session('FINANCEIRO', 't1'))
    const res = await catPOST(jsonReq('http://x/api/finance/categories', 'POST', { name: 'Aluguel', kind: 'DESPESA' }))
    expect(res.status).toBe(201)
    expect(prismaMock.financialCategory.create.mock.calls[0][0].data.tenantId).toBe('t1')
  })

  it('entries GET: filtros type/status + tenant', async () => {
    await entGET(req('http://x/api/finance/entries?type=DESPESA&status=PREVISTO'))
    const where = prismaMock.financialEntry.findMany.mock.calls[0][0].where
    expect(where.tenantId).toBe('t1')
    expect(where.type).toBe('DESPESA')
    expect(where.status).toBe('PREVISTO')
  })
  it('entries POST: 201 grava source=MANUAL e tenantId', async () => {
    authMock.mockResolvedValue(session('ADM', 't1'))
    const res = await entPOST(jsonReq('http://x/api/finance/entries', 'POST', { type: 'DESPESA', description: 'Luz', amount: 200 }))
    expect(res.status).toBe(201)
    const data = prismaMock.financialEntry.create.mock.calls[0][0].data
    expect(data.tenantId).toBe('t1')
    expect(data.source).toBe('MANUAL')
  })
  it('entries POST: 400 valor <= 0', async () => {
    const res = await entPOST(jsonReq('http://x/api/finance/entries', 'POST', { type: 'DESPESA', description: 'x', amount: 0 }))
    expect(res.status).toBe(400)
  })

  it('sync POST: 403 sem finance.manage', async () => {
    authMock.mockResolvedValue(session('VENDEDOR', 't1'))
    expect((await syncPOST()).status).toBe(403)
  })
  it('sync POST: 200 FINANCEIRO e escopa deals/comissões por tenant', async () => {
    authMock.mockResolvedValue(session('FINANCEIRO', 't1'))
    const res = await syncPOST()
    expect(res.status).toBe(200)
    expect(prismaMock.deal.findMany.mock.calls[0][0].where.tenantId).toBe('t1')
    expect(prismaMock.commissionCalculation.findMany.mock.calls[0][0].where.tenantId).toBe('t1')
  })
})
