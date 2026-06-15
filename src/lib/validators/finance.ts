// =============================================================================
// Zod validators — Financeiro (contas, categorias, lançamentos) — AutoDrive
// =============================================================================

import { z } from 'zod'

const money = z.number({ invalid_type_error: 'Valor inválido.' })
const dateish = z.coerce.date({ invalid_type_error: 'Data inválida.' }).nullish()

// ── Conta financeira (caixa/banco) ──────────────────────────────────────────
export const createAccountSchema = z.object({
  name:           z.string().min(2, 'Nome muito curto.').max(120),
  type:           z.enum(['CAIXA', 'BANCO', 'CARTAO', 'OUTRO']).default('CAIXA'),
  openingBalance: money.default(0),
  active:         z.boolean().default(true),
})
export const updateAccountSchema = createAccountSchema.partial()

// ── Categoria financeira ────────────────────────────────────────────────────
export const createCategorySchema = z.object({
  name:   z.string().min(2, 'Nome muito curto.').max(120),
  kind:   z.enum(['RECEITA', 'DESPESA']),
  color:  z.string().max(20).nullish(),
  active: z.boolean().default(true),
})
export const updateCategorySchema = createCategorySchema.partial()

// ── Lançamento financeiro ───────────────────────────────────────────────────
export const createEntrySchema = z.object({
  type:           z.enum(['RECEITA', 'DESPESA']),
  status:         z.enum(['PREVISTO', 'PAGO', 'RECEBIDO', 'CANCELADO']).default('PREVISTO'),
  description:    z.string().min(2, 'Descrição muito curta.').max(240),
  amount:         money.positive('Valor deve ser maior que zero.'),
  dueDate:        dateish,
  paidDate:       dateish,
  competenceDate: dateish,
  accountId:      z.string().cuid().nullish(),
  categoryId:     z.string().cuid().nullish(),
  unitId:         z.string().cuid().nullish(),
  sellerId:       z.string().cuid().nullish(),
  counterparty:   z.string().max(160).nullish(),
  documentNumber: z.string().max(80).nullish(),
  paymentMethod:  z.string().max(60).nullish(),
  notes:          z.string().max(1000).nullish(),
})
export const updateEntrySchema = createEntrySchema.partial()

// Liquidar (pagar/receber) um lançamento PREVISTO.
export const settleEntrySchema = z.object({
  paidDate: z.coerce.date({ invalid_type_error: 'Data inválida.' }).optional(),
})

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type CreateCategoryInput = z.infer<typeof createCategorySchema>
export type CreateEntryInput = z.infer<typeof createEntrySchema>
