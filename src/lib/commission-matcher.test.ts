import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { commissionRule: { findMany: vi.fn() } },
}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { findCommissionRule } from '@/lib/commission-matcher'

function rule(over: Record<string, unknown> = {}) {
  return {
    id: 'r1', name: 'regra', ruleType: 'RETORNO', active: true,
    commissionType: 'PERCENTUAL', percentage: 8, fixedValue: null,
    fromQuantity: null, toQuantity: null, fromValue: null, toValue: null,
    sellerId: null, managerId: null, positionId: null, role: null,
    unitId: null, serviceId: null, warrantyId: null, bank: null,
    priority: 0, validFrom: null, validUntil: null, updatedAt: new Date('2026-07-01'),
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('findCommissionRule — faixa de quantidade', () => {
  it('RETORNO com fromQuantity=1 CASA mesmo sem quantidade (não é operação por volume)', async () => {
    prismaMock.commissionRule.findMany.mockResolvedValue([rule({ ruleType: 'RETORNO', positionId: 'posV', role: 'VENDEDOR', fromQuantity: 1 })])
    const m = await findCommissionRule({
      tenantId: 't1', ruleType: 'RETORNO', commissionKind: 'REGULAR',
      employee: { kind: 'SELLER', id: 's1', positionId: 'posV', role: 'VENDEDOR' },
      unitId: 'u1', baseValue: 691.34, // sem quantityInPeriod
    })
    expect(m).not.toBeNull()
    expect(m?.rule.id).toBe('r1')
  })

  it('DOCUMENTO com fromQuantity=1 CASA sem quantidade', async () => {
    prismaMock.commissionRule.findMany.mockResolvedValue([rule({ ruleType: 'DOCUMENTO', commissionType: 'FIXO', fixedValue: 200, percentage: null, positionId: 'posV', role: 'VENDEDOR', fromQuantity: 1 })])
    const m = await findCommissionRule({ tenantId: 't1', ruleType: 'DOCUMENTO', commissionKind: 'REGULAR', employee: { kind: 'SELLER', id: 's1', positionId: 'posV', role: 'VENDEDOR' }, unitId: 'u1', baseValue: 539.91 })
    expect(m).not.toBeNull()
  })

  it('VENDA faixa 6–9 continua NÃO casando quando a quantidade (3) está fora', async () => {
    prismaMock.commissionRule.findMany.mockResolvedValue([rule({ ruleType: 'VENDA', positionId: 'posV', role: 'VENDEDOR', fromQuantity: 6, toQuantity: 9 })])
    const m = await findCommissionRule({ tenantId: 't1', ruleType: 'VENDA', commissionKind: 'REGULAR', employee: { kind: 'SELLER', id: 's1', positionId: 'posV', role: 'VENDEDOR' }, unitId: 'u1', baseValue: 50000, quantityInPeriod: 3 })
    expect(m).toBeNull()
  })

  it('VENDA faixa 1–5 CASA quando a quantidade (3) está dentro', async () => {
    prismaMock.commissionRule.findMany.mockResolvedValue([rule({ ruleType: 'VENDA', positionId: 'posV', role: 'VENDEDOR', fromQuantity: 1, toQuantity: 5 })])
    const m = await findCommissionRule({ tenantId: 't1', ruleType: 'VENDA', commissionKind: 'REGULAR', employee: { kind: 'SELLER', id: 's1', positionId: 'posV', role: 'VENDEDOR' }, unitId: 'u1', baseValue: 50000, quantityInPeriod: 3 })
    expect(m).not.toBeNull()
  })
})

describe('findCommissionRule — bônus dezenal', () => {
  it('filtra regra pelo metadado da dezena', async () => {
    prismaMock.commissionRule.findMany.mockResolvedValue([
      rule({
        id: 'd1',
        ruleType: 'BONUS_DEZENA',
        commissionType: 'BONUS_QTD',
        fixedValue: 500,
        percentage: null,
        fromQuantity: 4,
        role: 'VENDEDOR',
        notes: '__decendBonus__={"groupId":"g1","decend":"FIRST_DECEND"}',
      }),
      rule({
        id: 'd2',
        ruleType: 'BONUS_DEZENA',
        commissionType: 'BONUS_QTD',
        fixedValue: 500,
        percentage: null,
        fromQuantity: 4,
        role: 'VENDEDOR',
        notes: '__decendBonus__={"groupId":"g1","decend":"SECOND_DECEND"}',
      }),
    ])

    const m = await findCommissionRule({
      tenantId: 't1',
      ruleType: 'BONUS_DEZENA',
      employee: { kind: 'SELLER', id: 's1', positionId: null, role: 'VENDEDOR' },
      quantityInPeriod: 4,
      decend: 'SECOND_DECEND',
    })

    expect(m?.rule.id).toBe('d2')
  })

  it('mantém compatibilidade com regra antiga sem metadado', async () => {
    prismaMock.commissionRule.findMany.mockResolvedValue([
      rule({
        id: 'legacy',
        ruleType: 'BONUS_DEZENA',
        commissionType: 'BONUS_QTD',
        fixedValue: 500,
        percentage: null,
        fromQuantity: 4,
        role: 'VENDEDOR',
        notes: null,
      }),
    ])

    const m = await findCommissionRule({
      tenantId: 't1',
      ruleType: 'BONUS_DEZENA',
      employee: { kind: 'SELLER', id: 's1', positionId: null, role: 'VENDEDOR' },
      quantityInPeriod: 4,
      decend: 'THIRD_DECEND',
    })

    expect(m?.rule.id).toBe('legacy')
  })
})
