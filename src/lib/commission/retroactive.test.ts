import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock do Prisma: matcher lê commissionRule.findMany; recalc lê
// commissionCalculation.findMany + seller.findUnique e grava com update.
const { prismaMock, updateSpy } = vi.hoisted(() => {
  const updateSpy = vi.fn().mockResolvedValue({})
  return {
    updateSpy,
    prismaMock: {
      commissionCalculation: { findMany: vi.fn(), update: updateSpy },
      commissionRule: { findMany: vi.fn() },
      seller: { findUnique: vi.fn() },
    },
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { recalculateSellerMainForPeriod } from '@/lib/commission/retroactive'

// Faixas por carro (FIXO): 1–5=300, 6–9=400, 10–14=500, 15+=700.
function tier(fromQuantity: number, toQuantity: number | null, fixedValue: number) {
  return {
    id: `tier-${fromQuantity}`,
    ruleType: 'VENDA', active: true, commissionType: 'FIXO',
    fixedValue, percentage: null,
    fromQuantity, toQuantity, fromValue: null, toValue: null,
    sellerId: null, managerId: null, positionId: null, role: null,
    priority: 0, validFrom: null, validUntil: null,
    updatedAt: new Date('2026-07-01'),
  }
}
const TIERS = [tier(1, 5, 300), tier(6, 9, 400), tier(10, 14, 500), tier(15, null, 700)]

function mainEntries(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `calc-${i}`,
    baseValue: 50000,
    commissionValue: 0,
    status: 'PREVISTO',
    ruleDetails: { commissionScope: 'SELLER_MAIN_COMMISSION', dealId: `deal-${i}` },
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.commissionRule.findMany.mockResolvedValue(TIERS)
  prismaMock.seller.findUnique.mockResolvedValue({ positionId: null, unitId: 'unit-1', user: { role: 'VENDEDOR' } })
})

async function repricedValueFor(count: number): Promise<{ repriced: number; value: number | null; tier: string | null }> {
  prismaMock.commissionCalculation.findMany.mockResolvedValue(mainEntries(count))
  updateSpy.mockClear()
  const res = await recalculateSellerMainForPeriod({ tenantId: 't1', sellerId: 's1', period: '2026-07' })
  const firstUpdate = updateSpy.mock.calls[0]?.[0]?.data?.commissionValue ?? null
  return { repriced: res.repriced, value: firstUpdate, tier: res.tierRuleId }
}

describe('faixa retroativa por período', () => {
  it('5 vendas → todos os carros a R$300 (faixa 1–5)', async () => {
    const r = await repricedValueFor(5)
    expect(r.repriced).toBe(5)
    expect(r.value).toBe(300)
    expect(r.tier).toBe('tier-1')
  })

  it('6 vendas → todos a R$400 (faixa 6–9), retroativo', async () => {
    const r = await repricedValueFor(6)
    expect(r.repriced).toBe(6)
    expect(r.value).toBe(400)
    expect(r.tier).toBe('tier-6')
  })

  it('10 vendas → todos a R$500 (faixa 10–14)', async () => {
    const r = await repricedValueFor(10)
    expect(r.repriced).toBe(10)
    expect(r.value).toBe(500)
    expect(r.tier).toBe('tier-10')
  })

  it('15 vendas → todos a R$700 (faixa 15+)', async () => {
    const r = await repricedValueFor(15)
    expect(r.repriced).toBe(15)
    expect(r.value).toBe(700)
    expect(r.tier).toBe('tier-15')
  })

  it('cancelou e caiu para 5 → todos voltam a R$300', async () => {
    // Simula pós-cancelamento: agora restam 5 lançamentos ativos.
    const r = await repricedValueFor(5)
    expect(r.value).toBe(300)
  })

  it('não reprecifica PAGO/APROVADO/AJUSTADO (só PREVISTO)', async () => {
    const rows = mainEntries(6)
    rows[0].status = 'PAGO'
    rows[1].status = 'APROVADO'
    prismaMock.commissionCalculation.findMany.mockResolvedValue(rows)
    updateSpy.mockClear()
    const res = await recalculateSellerMainForPeriod({ tenantId: 't1', sellerId: 's1', period: '2026-07' })
    // Conta os 6 carros (faixa 6–9), mas só reprecifica os 4 PREVISTOS.
    expect(res.count).toBe(6)
    expect(res.repriced).toBe(4)
  })

  it('sem lançamentos → nada a fazer', async () => {
    prismaMock.commissionCalculation.findMany.mockResolvedValue([])
    const res = await recalculateSellerMainForPeriod({ tenantId: 't1', sellerId: 's1', period: '2026-07' })
    expect(res.count).toBe(0)
    expect(res.repriced).toBe(0)
  })
})
