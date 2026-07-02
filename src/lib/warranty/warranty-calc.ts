// =============================================================================
// warranty/warranty-calc.ts — Cálculo de venda e comissão de GARANTIA (AutoDrive)
//
// Regra profissional:
//   soldPrice >= fullPrice     -> comissão cheia
//   soldPrice >= reducedPrice  -> comissão com desconto
//   soldPrice < reducedPrice   -> sem comissão
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
  commissionStatus:  WarrantyCommissionStatus
}

export type WarrantyCommissionStatus = 'FULL_PRICE_COMMISSION' | 'DISCOUNT_PRICE_COMMISSION' | 'NO_COMMISSION'

/** Preço final da garantia conforme tipo de venda + adicional prêmio/luxo. */
export function calculateWarrantySale(
  w: WarrantyPricing,
  saleType: WarrantySaleType,
  clientBoughtPremium: boolean,
): WarrantySaleComputation {
  const basePrice = saleType === 'FULL' ? num(w.fullPrice) : num(w.reducedPrice)
  const premiumAddonValue = w.hasPremiumAddon && clientBoughtPremium ? num(w.premiumAddonValue) : 0
  const finalPrice = round2(basePrice + premiumAddonValue)
  return {
    basePrice:         round2(basePrice),
    premiumAddonValue: round2(premiumAddonValue),
    finalPrice,
    commissionStatus:  warrantyCommissionStatus({
      warrantyFullPrice:     w.fullPrice,
      warrantyDiscountPrice: w.reducedPrice,
      soldPrice:             finalPrice,
    }),
  }
}

export interface WarrantyCommissionComputation {
  baseCommissionValue:    number
  premiumCommissionValue: number
  totalCommissionValue:   number
  status:                 WarrantyCommissionStatus
  commissionable:         boolean
}

export interface WarrantyCommissionInput {
  warrantyFullPrice:       unknown
  warrantyDiscountPrice:   unknown
  soldPrice:               unknown
  fullPriceCommission:     unknown
  discountPriceCommission: unknown
  premiumCommissionValue?: unknown
}

export function warrantyCommissionStatus(input: {
  warrantyFullPrice: unknown
  warrantyDiscountPrice: unknown
  soldPrice: unknown
}): WarrantyCommissionStatus {
  const fullPrice = num(input.warrantyFullPrice)
  const discountPrice = num(input.warrantyDiscountPrice)
  const soldPrice = num(input.soldPrice)
  if (fullPrice > 0 && soldPrice >= fullPrice) return 'FULL_PRICE_COMMISSION'
  if (discountPrice > 0 && soldPrice >= discountPrice) return 'DISCOUNT_PRICE_COMMISSION'
  return 'NO_COMMISSION'
}

export function calculateWarrantyCommission(input: WarrantyCommissionInput): WarrantyCommissionComputation
export function calculateWarrantyCommission(w: WarrantyPricing, saleType: WarrantySaleType, clientBoughtPremium: boolean): WarrantyCommissionComputation
export function calculateWarrantyCommission(
  inputOrWarranty: WarrantyCommissionInput | WarrantyPricing,
  saleType?: WarrantySaleType,
  clientBoughtPremium = false,
): WarrantyCommissionComputation {
  const input: WarrantyCommissionInput = saleType
    ? {
        warrantyFullPrice:       (inputOrWarranty as WarrantyPricing).fullPrice,
        warrantyDiscountPrice:   (inputOrWarranty as WarrantyPricing).reducedPrice,
        soldPrice:               calculateWarrantySale(inputOrWarranty as WarrantyPricing, saleType, clientBoughtPremium).finalPrice,
        fullPriceCommission:     (inputOrWarranty as WarrantyPricing).fullSaleCommissionValue,
        discountPriceCommission: (inputOrWarranty as WarrantyPricing).reducedSaleCommissionValue,
        premiumCommissionValue:  (inputOrWarranty as WarrantyPricing).hasPremiumAddon && clientBoughtPremium
          ? (inputOrWarranty as WarrantyPricing).premiumAddonCommissionValue
          : 0,
      }
    : inputOrWarranty as WarrantyCommissionInput

  const status = warrantyCommissionStatus(input)
  const baseCommissionValue = status === 'FULL_PRICE_COMMISSION'
    ? num(input.fullPriceCommission)
    : status === 'DISCOUNT_PRICE_COMMISSION'
      ? num(input.discountPriceCommission)
      : 0
  const premiumCommissionValue = status === 'NO_COMMISSION' ? 0 : num(input.premiumCommissionValue)
  return {
    baseCommissionValue:    round2(baseCommissionValue),
    premiumCommissionValue: round2(premiumCommissionValue),
    totalCommissionValue:   round2(baseCommissionValue + premiumCommissionValue),
    status,
    commissionable:         status !== 'NO_COMMISSION',
  }
}

export function calculateWarrantySaleBySoldPrice(
  w: WarrantyPricing,
  soldPrice: unknown,
  clientBoughtPremium: boolean,
): WarrantySaleComputation {
  const finalPrice = round2(Math.max(0, num(soldPrice)))
  const premiumAddonValue = w.hasPremiumAddon && clientBoughtPremium ? num(w.premiumAddonValue) : 0
  return {
    basePrice:         finalPrice,
    premiumAddonValue: round2(premiumAddonValue),
    finalPrice,
    commissionStatus:  warrantyCommissionStatus({
      warrantyFullPrice:     w.fullPrice,
      warrantyDiscountPrice: w.reducedPrice,
      soldPrice:             finalPrice,
    }),
  }
}
