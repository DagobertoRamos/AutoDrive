import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock, matcherMock } = vi.hoisted(() => ({
  prismaMock: {
    deal: { findUnique: vi.fn() },
    manager: { findFirst: vi.fn(), findUnique: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    seller: { findUnique: vi.fn() },
    systemSetting: { findFirst: vi.fn() },
    commissionCalculation: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    dealVehicle: { count: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  matcherMock: {
    findCommissionRule: vi.fn(),
    computeCommissionValue: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/commission-matcher', () => ({
  findCommissionRule: matcherMock.findCommissionRule,
  computeCommissionValue: matcherMock.computeCommissionValue,
}))

import { generateCommissionsForDeal } from '@/lib/commission-generator'

const baseDate = new Date('2026-06-10T12:00:00.000Z')

function makeDeal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'deal1',
    tenantId: 'tenant1',
    unitId: 'unit1',
    type: 'TROCA',
    status: 'AGUARDANDO_CONTRATO',
    saleAmount: 100000,
    purchaseAmount: null,
    vehicleValue: null,
    documentationFee: null,
    returnNetValue: null,
    paymentBank: null,
    saleDate: baseDate,
    approvedAt: baseDate,
    finalizedAt: null,
    createdAt: baseDate,
    vehicles: [
      { id: 'dealVehicleSold', role: 'VENDIDO', brand: 'Honda', model: 'Civic', plate: 'AAA1A11', agreedValue: 100000 },
      { id: 'dealVehicleTrade', role: 'TROCA', brand: 'Fiat', model: 'Argo', plate: 'BBB2B22', agreedValue: 40000 },
    ],
    services: [],
    warrantySales: [],
    seller: {
      id: 'seller1',
      fullName: 'Anderson',
      unitId: 'unit1',
      positionId: 'posSeller',
      userId: 'userSeller',
      user: { role: 'VENDEDOR' },
    },
    manager: null,
    ...overrides,
  }
}

function setDefaultMocks() {
  prismaMock.systemSetting.findFirst.mockResolvedValue(null)
  prismaMock.manager.findFirst.mockResolvedValue({
    id: 'manager1',
    userId: 'userManager',
    fullName: 'Dagoberto',
    positionId: 'posManager',
    user: { role: 'GERENTE', name: 'Dagoberto' },
  })
  prismaMock.user.findMany.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
    if (args?.where?.role === 'GERENTE_GERAL') {
      return [{ id: 'userGeneralManager', name: 'Marcelo', positionId: 'posGeneralManager', role: 'GERENTE_GERAL' }]
    }
    return []
  })
  prismaMock.seller.findUnique.mockImplementation(async (args: { where?: { id?: string } }) => {
    if (args?.where?.id === 'sellerManager') return { positionId: 'posManager', user: { role: 'GERENTE' } }
    return { positionId: 'posSeller', user: { role: 'VENDEDOR' } }
  })
  prismaMock.manager.findUnique.mockResolvedValue({ userId: 'userManager', unitId: 'unit1', positionId: 'posManager', user: { role: 'GERENTE' } })
  prismaMock.user.findUnique.mockImplementation(async (args: { where?: { id?: string } }) => {
    if (args?.where?.id === 'userGeneralManager') return { positionId: 'posGeneralManager', role: 'GERENTE_GERAL' }
    return { positionId: 'posManager', role: 'GERENTE' }
  })
  prismaMock.commissionCalculation.findMany.mockResolvedValue([])
  prismaMock.dealVehicle.count.mockResolvedValue(1)
  matcherMock.findCommissionRule.mockImplementation(async (ctx: { ruleType: string }) => ({
    rule: {
      id: `rule-${ctx.ruleType}`,
      name: `Regra ${ctx.ruleType}`,
      commissionType: 'PERCENTUAL',
      percentage: 1,
      fixedValue: null,
      priority: 0,
      updatedAt: baseDate,
    },
    matchedBy: 'ROLE',
  }))
  matcherMock.computeCommissionValue.mockImplementation((rule: { percentage?: number }, baseValue: number) => {
    return baseValue * ((rule.percentage ?? 0) / 100)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setDefaultMocks()
})

describe('generateCommissionsForDeal', () => {
  it('normaliza negociacao TROCA para uma unica comissao principal de VENDA', async () => {
    prismaMock.deal.findUnique.mockResolvedValue(makeDeal())

    const result = await generateCommissionsForDeal({
      dealId: 'deal1',
      tenantId: 'tenant1',
      triggeredBy: 'tester',
      dryRun: true,
    })

    const principal = result.items.filter((it) => [
      'SELLER_MAIN_COMMISSION',
      'UNIT_MANAGER_COMMISSION',
      'GENERAL_MANAGER_COMMISSION',
    ].includes(it.commissionScope))

    expect(principal).toHaveLength(3)
    expect(principal.map((it) => it.ruleType)).toEqual(['VENDA', 'VENDA', 'VENDA'])
    expect(result.items.some((it) => it.ruleType === 'TROCA')).toBe(false)
    expect(principal.find((it) => it.commissionScope === 'SELLER_MAIN_COMMISSION')?.employeeLabel).toBe('Anderson')
    expect(principal.find((it) => it.commissionScope === 'UNIT_MANAGER_COMMISSION')?.employeeLabel).toBe('Dagoberto')
    expect(principal.find((it) => it.commissionScope === 'GENERAL_MANAGER_COMMISSION')?.employeeLabel).toBe('Marcelo')
  })

  it('mantem comissao de vendedor e de gerente em escopos separados quando o gerente vende', async () => {
    prismaMock.deal.findUnique.mockResolvedValue(makeDeal({
      type: 'VENDA',
      seller: {
        id: 'sellerManager',
        fullName: 'Dagoberto',
        unitId: 'unit1',
        positionId: 'posManager',
        userId: 'userManager',
        user: { role: 'GERENTE' },
      },
    }))

    const result = await generateCommissionsForDeal({
      dealId: 'deal1',
      tenantId: 'tenant1',
      triggeredBy: 'tester',
      dryRun: true,
    })

    const dagoberto = result.items.filter((it) => it.employeeUserId === 'userManager')

    expect(dagoberto.some((it) => it.commissionScope === 'SELLER_MAIN_COMMISSION')).toBe(true)
    expect(dagoberto.some((it) => it.commissionScope === 'UNIT_MANAGER_COMMISSION')).toBe(true)
  })

  it('trata lancamento legado por veiculo como existente para nao duplicar no reprocessamento', async () => {
    prismaMock.deal.findUnique.mockResolvedValue(makeDeal())
    prismaMock.commissionCalculation.findMany
      .mockResolvedValueOnce([{
        id: 'oldCalc',
        ruleType: 'VENDA',
        sellerId: 'seller1',
        managerId: null,
        ruleDetails: {
          dealId: 'deal1',
          vehicleId: 'dealVehicleSold',
          employeeKind: 'SELLER',
          employeeUserId: 'userSeller',
        },
      }])
      .mockResolvedValueOnce([])

    const result = await generateCommissionsForDeal({
      dealId: 'deal1',
      tenantId: 'tenant1',
      triggeredBy: 'tester',
      dryRun: true,
    })

    const sellerMain = result.items.find((it) => it.commissionScope === 'SELLER_MAIN_COMMISSION')
    expect(sellerMain?.alreadyExisted).toBe(true)
  })
})
