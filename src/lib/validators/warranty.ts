// =============================================================================
// Zod validators — Garantias (cadastro + venda) — AutoDrive
// =============================================================================

import { z } from 'zod'

const money = z.number({ invalid_type_error: 'Valor inválido.' }).nonnegative('Valor não pode ser negativo.')

// ── Cadastro de garantia ───────────────────────────────────────────────────────

const warrantyBase = z.object({
  name:                        z.string().min(2, 'Nome muito curto.').max(120, 'Nome muito longo.'),
  provider:                    z.string().max(120).nullish(),
  coverageType:                z.string().max(80, 'Cobertura muito longa.').nullish(),
  fullPrice:                   money,
  reducedPrice:                money,
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
  .refine((d) => !d.hasPremiumAddon || (d.premiumAddonValue ?? 0) > 0, {
    message: 'Informe o valor do adicional prêmio/luxo quando ele existir.',
    path: ['premiumAddonValue'],
  })
  .refine((d) => !d.hasPremiumAddon || !!d.premiumAddonName, {
    message: 'Informe o nome do adicional prêmio/luxo.',
    path: ['premiumAddonName'],
  })

export const updateWarrantySchema = warrantyBase.partial()

// ── Venda de garantia (dentro da negociação) ────────────────────────────────────

export const warrantySaleSchema = z.object({
  warrantyId:          z.string().cuid('Garantia inválida.'),
  saleType:            z.enum(['FULL', 'REDUCED'], { errorMap: () => ({ message: 'Tipo de venda inválido.' }) }),
  clientBoughtPremium: z.boolean().default(false),
})

export type CreateWarrantyInput = z.infer<typeof createWarrantySchema>
export type WarrantySaleInput = z.infer<typeof warrantySaleSchema>
