// =============================================================================
// Zod validators — Retorno financeiro — AutoDrive
//
// O vendedor informa APENAS returnRatePercent. ILA/IOF são campos
// administrativos: validados aqui, mas o controle de QUEM pode enviá-los é feito
// na rota (permissão negotiations.financing). O vendedor nunca altera ILA/IOF.
// =============================================================================

import { z } from 'zod'
import { RETURN_RATE_MIN } from '@/lib/finance/return-calc'

const pct = (max: number) =>
  z.number({ invalid_type_error: 'Percentual inválido.' }).min(0, 'Percentual não pode ser negativo.').max(max, `Máximo ${max}%.`)

/** Campo enviado pelo vendedor. */
export const returnRateSchema = z.object({
  returnRatePercent: pct(100).refine((v) => v >= RETURN_RATE_MIN, 'Retorno precisa ser maior ou igual a 0,01%.'),
})

/** Campos administrativos (ILA/IOF) — apenas perfis autorizados. */
export const returnFinancingSchema = z.object({
  ilaPercent: pct(100).optional(),
  iofPercent: pct(100).optional(),
})

export type ReturnRateInput = z.infer<typeof returnRateSchema>
export type ReturnFinancingInput = z.infer<typeof returnFinancingSchema>
