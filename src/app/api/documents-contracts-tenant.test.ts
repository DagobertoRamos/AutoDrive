// =============================================================================
// Testes de integração — /api/documents/contracts (AutoDrive)
// Exercita o handler REAL com `prisma`/sessão MOCKADOS. O mock de prisma aplica o
// `where.tenantId` sobre um conjunto fixo de contratos de duas lojas, provando que
// o ADM da loja A não recebe contratos da loja B.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock, authMock } = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    prismaMock: {
      contract: { findMany: fn(), count: fn(), create: fn() },
      userModule: { findUnique: fn() },
      tenantModule: { findUnique: fn() },
    },
    authMock: vi.fn(),
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/auth', () => ({ getServerAuthSession: authMock, authOptions: {} }))

import { GET, POST } from '@/app/api/documents/contracts/route'

const CONTRACTS = [
  { id: 'cA1', tenantId: 'tA', number: 'A-001', type: 'VENDA', status: 'ATIVO', saleValue: 10, saleDate: null, createdAt: new Date(), customer: { name: 'Cliente A' }, vehicle: null },
  { id: 'cA2', tenantId: 'tA', number: 'A-002', type: 'VENDA', status: 'ATIVO', saleValue: 20, saleDate: null, createdAt: new Date(), customer: { name: 'Cliente A2' }, vehicle: null },
  { id: 'cB1', tenantId: 'tB', number: 'B-001', type: 'VENDA', status: 'ATIVO', saleValue: 30, saleDate: null, createdAt: new Date(), customer: { name: 'Cliente B' }, vehicle: null },
]
const applyWhere = (where: { tenantId?: string } = {}) =>
  CONTRACTS.filter((c) => where.tenantId === undefined || c.tenantId === where.tenantId)

function session(role: string, tenantId: string | null) {
  return { user: { id: 'u1', name: 'U', email: 'u@x.com', role, tenantId, unitId: null, status: 'ATIVO' } }
}
const req = (url = 'http://x/api/documents/contracts') => new Request(url) as never
const ids = async (res: Response) => ((await res.json()).data as { id: string }[]).map((c) => c.id).sort()

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue(session('ADM', 'tA'))
  prismaMock.contract.findMany.mockImplementation(async (args: { where?: { tenantId?: string } }) => applyWhere(args?.where))
  prismaMock.contract.count.mockImplementation(async (args: { where?: { tenantId?: string } }) => applyWhere(args?.where).length)
  prismaMock.contract.create.mockImplementation(async (args: { data: unknown }) => ({ id: 'new', ...(args.data as object) }))
  prismaMock.tenantModule.findUnique.mockResolvedValue(null)
  prismaMock.userModule.findUnique.mockResolvedValue(null)
})

describe('GET /api/documents/contracts — isolamento de loja', () => {
  it('401 sem sessão', async () => {
    authMock.mockResolvedValueOnce(null)
    expect((await GET(req())).status).toBe(401)
  })

  it('ADM da loja A recebe só contratos da loja A', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await ids(res)).toEqual(['cA1', 'cA2'])
    expect(prismaMock.contract.findMany.mock.calls[0][0].where.tenantId).toBe('tA')
    expect(prismaMock.contract.count.mock.calls[0][0].where.tenantId).toBe('tA')
  })

  it('ADM da loja B não vê contratos da loja A', async () => {
    authMock.mockResolvedValue(session('ADM', 'tB'))
    expect(await ids(await GET(req()))).toEqual(['cB1'])
  })

  it('busca mantém o filtro de loja', async () => {
    await GET(req('http://x/api/documents/contracts?search=B-001'))
    const where = prismaMock.contract.findMany.mock.calls[0][0].where
    expect(where.tenantId).toBe('tA')
    expect(where.OR).toBeDefined()
  })

  it('usuário comum sem loja → 403 e nenhuma consulta', async () => {
    authMock.mockResolvedValue(session('ADM', null))
    expect((await GET(req())).status).toBe(403)
    expect(prismaMock.contract.findMany).not.toHaveBeenCalled()
  })

  it('MASTER fora de loja vê todos', async () => {
    authMock.mockResolvedValue(session('MASTER', null))
    expect(await ids(await GET(req()))).toEqual(['cA1', 'cA2', 'cB1'])
  })

  it('MASTER dentro de uma loja vê só ela', async () => {
    authMock.mockResolvedValue(session('MASTER', 'tB'))
    expect(await ids(await GET(req()))).toEqual(['cB1'])
  })
})

describe('POST /api/documents/contracts — grava a loja da sessão', () => {
  const post = (body: unknown) =>
    new Request('http://x/api/documents/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never

  it('contrato importado recebe o tenantId do usuário', async () => {
    const res = await POST(post({ contractNumber: 'A-003', tenantId: 'tB' }))
    expect(res.status).toBe(201)
    expect(prismaMock.contract.create.mock.calls[0][0].data.tenantId).toBe('tA')
  })
})
