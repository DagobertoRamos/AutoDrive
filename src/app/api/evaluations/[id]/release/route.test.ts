// =============================================================================
// POST /api/evaluations/[id]/release — o release NÃO cria nem vincula Vehicle.
// Quem cria o veículo é a entrada no estoque (stock-entry), que recusa
// avaliação com vehicleId. Estes testes garantem que o release não trava isso.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock, authMock } = vi.hoisted(() => ({
  prismaMock: {
    vehicleEvaluation: { update: vi.fn(), findUnique: vi.fn() },
    vehicle: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  },
  authMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/auth', () => ({ getServerAuthSession: authMock, authOptions: {} }))
vi.mock('@/lib/evaluation/service', () => ({
  loadEvaluationContext: vi.fn(async (id: string) => ({ id, tenantId: 't1', status: 'AGUARDANDO_APROVACAO' })),
}))
vi.mock('@/lib/evaluation/history', () => ({ recordHistory: vi.fn(async () => {}) }))
vi.mock('@/services/notification.service', () => ({ notify: vi.fn(async () => {}) }))

import { POST } from './route'
import { blockConfirmStockEntry } from '@/lib/evaluation/stock-entry-core'

const session = (role: string) => ({ user: { id: 'u1', name: 'Gerente', role, tenantId: 't1', unitId: 'unitA' } })
const call = (body: unknown) =>
  POST(
    new Request('http://x/api/evaluations/ev1/release', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id: 'ev1' }) },
  )

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue(session('GERENTE'))
  prismaMock.vehicleEvaluation.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'ev1', vehicleId: null, customerDecision: 'ACEITA', ...data,
  }))
  prismaMock.vehicleEvaluation.findUnique.mockResolvedValue({ plate: 'ABC1D23', brand: 'Fiat', model: 'Argo', evaluatedById: 's1' })
})

describe('POST /api/evaluations/[id]/release', () => {
  it('libera a avaliação sem criar, atualizar ou vincular Vehicle', async () => {
    const res = await call({ evaluatedValue: 50000, suggestedSalePrice: 58000 })
    expect(res.status).toBe(200)

    expect(prismaMock.vehicle.create).not.toHaveBeenCalled()
    expect(prismaMock.vehicle.update).not.toHaveBeenCalled()
    expect(prismaMock.vehicle.findFirst).not.toHaveBeenCalled()

    expect(prismaMock.vehicleEvaluation.update).toHaveBeenCalledTimes(1)
    const { data } = prismaMock.vehicleEvaluation.update.mock.calls[0][0]
    expect(data).toMatchObject({ status: 'LIBERADA', evaluatedValue: 50000, suggestedSalePrice: 58000 })
    expect(data).not.toHaveProperty('vehicleId')
  })

  it('depois do release (cliente aceitou) o gestor ainda consegue dar entrada no estoque', async () => {
    const res = await call({ evaluatedValue: 50000 })
    const { data } = await res.json()
    expect(data.vehicleId).toBeNull()
    expect(blockConfirmStockEntry(data)).toBeNull()
  })

  it('403 para quem não é gerência', async () => {
    authMock.mockResolvedValueOnce(session('VENDEDOR'))
    const res = await call({})
    expect(res.status).toBe(403)
    expect(prismaMock.vehicleEvaluation.update).not.toHaveBeenCalled()
  })
})
