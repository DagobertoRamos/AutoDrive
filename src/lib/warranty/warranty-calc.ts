// =============================================================================
// warranty/warranty-calc.ts — Cálculo de venda e comissão de GARANTIA (AutoDrive)
//
// Regra (spec):
//   basePrice  = saleType === FULL ? fullPrice : reducedPrice
//   finalPrice = basePrice + (clienteComprouPremium && hasPremiumAddon ? premiumAddonValue : 0)
//   comissão   = (FULL ? fullSaleCommissionValue : reducedSaleCommissionValue)
//                + (premium ? premiumAddonCommissionValue : 0)
//
// Comissões são VALORES FIXOS configurados no cadastro da garantia (não %).
// Funções puras — sem acesso a banco.
// =============================================================================

import type { WarrantySaleType } from '@prisma/client'

function num(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber()
  }
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Campos da garantia usados nos cálculos (aceita Decimal ou number). */
export interface WarrantyPricing {
  fullPrice:                   unknown
  reducedPrice:                unknown
  hasPremiumAddon:             boolean
  premiumAddonValue:           unknown
  reducedSaleCommissionValue:  unknown
  fullSaleCommissionValue:     unknown
  premiumAddonCommissionValue: unknown
}

export interface WarrantySaleComputation {
  basePrice:         number
  premiumAddonValue: number
  finalPrice:        number
}

/** Preço final da garantia conforme tipo de venda + adicional prêmio/luxo. */
export function calculateWarrantySale(
  w: WarrantyPricing,
  saleType: WarrantySaleType,
  clientBoughtPremium: boolean,
): WarrantySaleComputation {
  const basePrice = saleType === 'FULL' ? num(w.fullPrice) : num(w.reducedPrice)
  const premiumAddonValue = w.hasPremiumAddon && clientBoughtPremium ? num(w.premiumAddonValue) : 0
  return {
    basePrice:         round2(basePrice),
    premiumAddonValue: round2(premiumAddonValue),
    finalPrice:        round2(basePrice + premiumAddonValue),
  }
}

export interface WarrantyCommissionComputation {
  baseCommissionValue:    number
  premiumCommissionValue: number
  totalCommissionValue:   number
}

/** Comissão fixa da garantia conforme tipo de venda + adicional. */
export function calculateWarrantyCommission(
  w: WarrantyPricing,
  saleType: WarrantySaleType,
  clientBoughtPremium: boolean,
): WarrantyCommissionComputation {
  const baseCommissionValue =
    saleType === 'FULL' ? num(w.fullSaleCommissionValue) : num(w.reducedSaleCommissionValue)
  const premiumCommissionValue =
    w.hasPremiumAddon && clientBoughtPremium ? num(w.premiumAddonCommissionValue) : 0
  return {
    baseCommissionValue:    round2(baseCommissionValue),
    premiumCommissionValue: round2(premiumCommissionValue),
    totalCommissionValue:   round2(baseCommissionValue + premiumCommissionValue),
  }
}
