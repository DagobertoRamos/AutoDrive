import { describe, expect, it } from 'vitest'
import { dealResult, groupServices } from './deal-result-core'

describe('dealResult', () => {
  it('soma receitas e custos da venda completa', () => {
    const r = dealResult({
      vehicleSale: 100_000, discount: 2_000,
      vehicleCost: { acquisition: 80_000, preparation: 3_000, documentation: 500 },
      fi: 1_800,
      services: [{ kind: 'GARANTIA', label: 'Garantia', charged: 2_350, cost: 1_500 }, { kind: 'DOCUMENTACAO', label: 'Documentação', charged: 1_500, cost: 725 }],
      storeDebts: 300, commissions: 1_200,
    })
    expect(r.revenue.total).toBe(98_000 + 3_850 + 1_800)
    expect(r.cost.total).toBe(83_500 + 2_225 + 300 + 1_200)
    expect(r.profit).toBe(103_650 - 87_225)
    expect(r.vehicleMargin).toBe(14_500)
    expect(r.margin).toBeCloseTo((16_425 / 103_650) * 100, 1)
  })

  it('sem receita não tem margem', () => {
    const r = dealResult({ vehicleSale: 0, discount: 0, vehicleCost: { acquisition: 0, preparation: 0, documentation: 0 }, fi: 0, services: [], storeDebts: 0, commissions: 0 })
    expect(r.margin).toBeNull()
    expect(r.profit).toBe(0)
  })

  it('agrupa serviços do mesmo tipo', () => {
    expect(groupServices([
      { kind: 'ESTETICA', label: 'Estética', charged: 100.1, cost: 50 },
      { kind: 'ESTETICA', label: 'Estética', charged: 200.2, cost: 25.5 },
    ])).toEqual([{ kind: 'ESTETICA', label: 'Estética', charged: 300.3, cost: 75.5 }])
  })
})
