import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, recalcSellerSpy } = vi.hoisted(() => ({
  prismaMock: {
    commissionCalculation: { findMany: vi.fn() },
    seller: { findMany: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
  recalcSellerSpy: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/commission/retroactive', () => ({
  recalculateSellerMainForPeriod: recalcSellerSpy,
}))

import { recalcCommissionsForPeriod, isValidPeriod } from '@/lib/commission/recalc'

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.seller.findMany.mockResolvedValue([
    { id: 's1', fullName: 'Ana' },
    { id: 's2', fullName: 'Bruno' },
  ])
})

describe('isValidPeriod', () => {
  it('aceita AAAA-MM e rejeita o resto', () => {
    expect(isValidPeriod('2026-07')).toBe(true)
    expect(isValidPeriod('2026-13')).toBe(false)
    expect(isValidPeriod('2026-00')).toBe(false)
    expect(isValidPeriod('2026/07')).toBe(false)
    expect(isValidPeriod('')).toBe(false)
  })
})

describe('recalcCommissionsForPeriod', () => {
  it('prévia (dryRun) agrega deltas e NÃO grava auditoria', async () => {
    prismaMock.commissionCalculation.findMany.mockResolvedValue([{ sellerId: 's1' }, { sellerId: 's2' }])
    recalcSellerSpy
      .mockResolvedValueOnce({ sellerId: 's1', period: '2026-07', count: 6, tierRuleId: 't6', repriced: 6,
        changes: Array.from({ length: 6 }, () => ({ id: 'x', oldValue: 300, newValue: 400, status: 'PREVISTO' })) })
      .mockResolvedValueOnce({ sellerId: 's2', period: '2026-07', count: 3, tierRuleId: 't1', repriced: 0, changes: [] })

    const res = await recalcCommissionsForPeriod({ tenantId: 't1', period: '2026-07', dryRun: true, triggeredBy: 'u1' })

    expect(res.dryRun).toBe(true)
    expect(res.totalSellers).toBe(2)
    expect(res.totalRepriced).toBe(6)
    expect(res.oldTotal).toBe(1800)  // 6 × 300
    expect(res.newTotal).toBe(2400)  // 6 × 400
    expect(res.delta).toBe(600)
    // engine chamado com dryRun=true
    expect(recalcSellerSpy).toHaveBeenCalledWith(expect.objectContaining({ sellerId: 's1', dryRun: true }))
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
    // ordenado por |delta| desc: Ana (600) antes de Bruno (0)
    expect(res.sellers[0].sellerName).toBe('Ana')
  })

  it('aplicar (apply) grava auditoria e chama o motor com dryRun=false', async () => {
    prismaMock.commissionCalculation.findMany.mockResolvedValue([{ sellerId: 's1' }])
    recalcSellerSpy.mockResolvedValue({ sellerId: 's1', period: '2026-07', count: 6, tierRuleId: 't6', repriced: 6,
      changes: [{ id: 'x', oldValue: 300, newValue: 400, status: 'PREVISTO' }] })

    const res = await recalcCommissionsForPeriod({ tenantId: 't1', period: '2026-07', dryRun: false, triggeredBy: 'u1' })

    expect(res.dryRun).toBe(false)
    expect(recalcSellerSpy).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }))
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1)
  })

  it('sem vendedores no período → resultado vazio, sem auditoria', async () => {
    prismaMock.commissionCalculation.findMany.mockResolvedValue([])
    const res = await recalcCommissionsForPeriod({ tenantId: 't1', period: '2026-07', dryRun: false, triggeredBy: 'u1' })
    expect(res.totalSellers).toBe(0)
    expect(res.totalRepriced).toBe(0)
    expect(recalcSellerSpy).not.toHaveBeenCalled()
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
  })

  it('filtro por vendedor repassa o sellerId ao motor', async () => {
    prismaMock.commissionCalculation.findMany.mockResolvedValue([{ sellerId: 's1' }])
    recalcSellerSpy.mockResolvedValue({ sellerId: 's1', period: '2026-07', count: 2, tierRuleId: 't1', repriced: 0, changes: [] })
    await recalcCommissionsForPeriod({ tenantId: 't1', period: '2026-07', sellerId: 's1', dryRun: true })
    expect(recalcSellerSpy).toHaveBeenCalledWith(expect.objectContaining({ sellerId: 's1' }))
  })
})
