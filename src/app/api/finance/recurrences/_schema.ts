import { z } from 'zod'

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
const optId = z.string().max(40).nullable().optional()
const optText = (max: number) => z.string().trim().max(max).nullable().optional()

export const recurrenceSchema = z.object({
  type: z.enum(['RECEITA', 'DESPESA']),
  description: z.string().trim().min(2, 'Informe a descrição.').max(240),
  amount: z.coerce.number().positive('Informe o valor.').max(100_000_000),
  accountId: optId, categoryId: optId, costCenterId: optId, supplierId: optId, employeeUserId: optId,
  counterparty: optText(160),
  dayOfMonth: z.coerce.number().int().min(1, 'Dia inválido.').max(31, 'Dia inválido.'),
  startDate: ymd,
  endDate: ymd.nullable().optional(),
  notes: optText(2000),
  active: z.boolean().optional(),
})

export const recurrencePatchSchema = recurrenceSchema.partial()

export const serializeRecurrence = <T extends { amount: unknown; startDate: Date; endDate: Date | null; generatedUntil: Date | null }>(r: T) => ({
  ...r,
  amount: Number(r.amount),
  startDate: r.startDate.toISOString().slice(0, 10),
  endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
  generatedUntil: r.generatedUntil ? r.generatedUntil.toISOString().slice(0, 10) : null,
})
