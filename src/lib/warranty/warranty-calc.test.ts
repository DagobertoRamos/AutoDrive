import { describe, it, expect } from 'vitest'
import { calculateWarrantySale, calculateWarrantyCommission, type WarrantyPricing } from '@/lib/warranty/warranty-calc'

// Garantia Excelente (exemplo da spec 2.5)
const w: WarrantyPricing = {
  fullPrice: 3350, reducedPrice: 2250,
  hasPremiumAddon: true, premiumAddonValue: 300,
  reducedSaleCommissionValue: 350, fullSaleCommissionValue: 700, premiumAddonCommissionValue: 50,
}

describe('warranty-calc (garantia)', () => {
  it('Venda 1 — reduzido sem prêmio: preço 2250, comissão 350', () => {
    expect(calculateWarrantySale(w, 'REDUCED', false).finalPrice).toBe(2250)
    expect(calculateWarrantyCommission(w, 'REDUCED', false).totalCommissionValue).toBe(350)
  })

  it('Venda 2 — cheio sem prêmio: preço 3350, comissão 700', () => {
    expect(calculateWarrantySale(w, 'FULL', false).finalPrice).toBe(3350)
    expect(calculateWarrantyCommission(w, 'FULL', false).totalCommissionValue).toBe(700)
  })

  it('Venda 3 — cheio + prêmio: preço 3650, comissão 750', () => {
    const sale = calculateWarrantySale(w, 'FULL', true)
    expect(sale.basePrice).toBe(3350)
    expect(sale.premiumAddonValue).toBe(300)
    expect(sale.finalPrice).toBe(3650)
    const comm = calculateWarrantyCommission(w, 'FULL', true)
    expect(comm.baseCommissionValue).toBe(700)
    expect(comm.premiumCommissionValue).toBe(50)
    expect(comm.totalCommissionValue).toBe(750)
  })

  it('prêmio é ignorado quando a garantia não possui adicional', () => {
    const w2: WarrantyPricing = { ...w, hasPremiumAddon: false }
    expect(calculateWarrantySale(w2, 'FULL', true).finalPrice).toBe(3350)
    expect(calculateWarrantyCommission(w2, 'FULL', true).totalCommissionValue).toBe(700)
  })
})
