// =============================================================================
// Zod validators — Garantias (cadastro + venda) — AutoDrive
// =============================================================================

import { z } from 'zod'

const money = z.number({ invalid_type_error: 'Valor inválido.' }).nonnegative('Valor não pode ser negativo.')
const positiveMoney = z.number({ invalid_type_error: 'Valor inválido.' }).positive('Valor deve ser maior que zero.')

// ── Cadastro de garantia ───────────────────────────────────────────────────────

const warrantyBase = z.object({
  name:                        z.string().min(2, 'Nome muito curto.').max(120, 'Nome muito longo.'),
  provider:                    z.string().max(120).nullish(),
  coverageType:                z.string().max(80, 'Cobertura muito longa.').nullish(),
  durationYears:               z.union([z.literal(1), z.literal(2)], { errorMap: () => ({ message: 'Tempo deve ser 01 ano ou 02 anos.' }) }),
  fullPrice:                   positiveMoney,
  reducedPrice:                positiveMoney,
  hasPremiumAddon:             z.boolean().default(false),
  premiumAddonName:            z.string().max(80).nullish(),
  premiumAddonValue:           money.default(0),
  reducedSaleCommissionValue:  money.default(0),
  fullSaleCommissionValue:     money.default(0),
  premiumAddonCommissionValue: money.default(0),
  active:                      z.boolean().default(true),
  notes:                       z.string().max(1000).nullish(),
})

export const createWarrantySchema = warrantyBase
  .superRefine((d, ctx) => {
    if (d.reducedPrice > d.fullPrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reducedPrice'], message: 'Valor com desconto não pode ser maior que o valor cheio.' })
    }
    if (d.fullSaleCommissionValue < d.reducedSaleCommissionValue) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fullSaleCommissionValue'], message: 'Comissão cheia deve ser maior ou igual à comissão com desconto.' })
    }
  })
  .refine((d) => !d.hasPremiumAddon || (d.premiumAddonValue ?? 0) > 0, {
    message: 'Informe o valor do adicional prêmio/luxo quando ele existir.',
    path: ['premiumAddonValue'],
  })
  .refine((d) => !d.hasPremiumAddon || !!d.premiumAddonName, {
    message: 'Informe o nome do adicional prêmio/luxo.',
    path: ['premiumAddonName'],
  })

export const updateWarrantySchema = warrantyBase.partial()
  .superRefine((d, ctx) => {
    if (d.reducedPrice != null && d.fullPrice != null && d.reducedPrice > d.fullPrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reducedPrice'], message: 'Valor com desconto não pode ser maior que o valor cheio.' })
    }
    if (
      d.fullSaleCommissionValue != null &&
      d.reducedSaleCommissionValue != null &&
      d.fullSaleCommissionValue < d.reducedSaleCommissionValue
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fullSaleCommissionValue'], message: 'Comissão cheia deve ser maior ou igual à comissão com desconto.' })
    }
  })

// ── Venda de garantia (dentro da negociação) ────────────────────────────────────

export const warrantySaleSchema = z.object({
  warrantyId:          z.string().cuid('Garantia inválida.'),
  saleType:            z.enum(['FULL', 'REDUCED'], { errorMap: () => ({ message: 'Tipo de venda inválido.' }) }).optional(),
  soldPrice:           positiveMoney.optional(),
  clientBoughtPremium: z.boolean().default(false),
}).superRefine((d, ctx) => {
  if (d.soldPrice == null && !d.saleType) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['soldPrice'], message: 'Informe o valor vendido da garantia.' })
  }
})

export type CreateWarrantyInput = z.infer<typeof createWarrantySchema>
export type WarrantySaleInput = z.infer<typeof warrantySaleSchema>
