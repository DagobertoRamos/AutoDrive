// =============================================================================
// Zod validators — Metas (Goals) — AutoDrive
// Regras de negócio centralizadas: escopo define filtros obrigatórios.
// =============================================================================

import { z } from 'zod'

import { UserRole } from '@prisma/client'

export const goalTypeEnum = z.enum(
  ['SALES_EXCHANGE', 'PURCHASE', 'RETURN', 'DOCUMENTATION', 'EXTENDED_WARRANTY', 'SERVICE'],
  { errorMap: () => ({ message: 'Tipo de meta inválido.' }) },
)

export const goalScopeEnum = z.enum(['USER', 'ROLE', 'UNIT', 'TENANT', 'GLOBAL'], {
  errorMap: () => ({ message: 'Escopo de meta inválido.' }),
})

export const goalPeriodEnum = z.enum(
  ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'],
  { errorMap: () => ({ message: 'Período inválido.' }) },
)

export const goalStatusEnum = z.enum(['ATIVA', 'INATIVA', 'ARQUIVADA'], {
  errorMap: () => ({ message: 'Status inválido.' }),
})

export const measureUnitEnum = z.enum(['QTD', 'BRL', 'PERCENT'], {
  errorMap: () => ({ message: 'Unidade de medição inválida.' }),
})

// ── Degrau de progressão ──────────────────────────────────────────────────────

export const goalLevelInput = z.object({
  level:       z.number().int().positive('Nível deve ser positivo.'),
  targetValue: z.number().nonnegative('Alvo do nível não pode ser negativo.'),
  label:       z.string().max(60, 'Rótulo muito longo.').nullish(),
  reward:      z.string().max(200, 'Premiação muito longa.').nullish(),
})

// ── Objeto base (reutilizado por create/update) ────────────────────────────────

const goalBaseObject = z.object({
  type:        goalTypeEnum,
  scope:       goalScopeEnum,
  period:      goalPeriodEnum,
  title:       z.string().max(120, 'Título muito longo.').nullish(),
  unitId:      z.string().cuid('unitId inválido.').nullish(),
  userId:      z.string().cuid('userId inválido.').nullish(),
  targetRole:  z.nativeEnum(UserRole).nullish(),
  startDate:   z.coerce.date({ invalid_type_error: 'Data inicial inválida.' }),
  endDate:     z.coerce.date({ invalid_type_error: 'Data final inválida.' }),
  targetValue: z.number().nonnegative('Alvo não pode ser negativo.'),
  measureUnit: measureUnitEnum.default('QTD'),
  progressive: z.boolean().default(false),
  levels:      z.array(goalLevelInput).max(20, 'Máximo de 20 níveis.').optional(),
  notes:       z.string().max(1000, 'Observação muito longa.').nullish(),
})

// Cross-field: escopo define quais ids são obrigatórios; datas coerentes.
export const createGoalSchema = goalBaseObject
  .refine((d) => d.endDate >= d.startDate, {
    message: 'Data final deve ser maior ou igual à inicial.',
    path: ['endDate'],
  })
  .refine((d) => d.scope !== 'USER' || !!d.userId, {
    message: 'userId é obrigatório para metas de escopo USER.',
    path: ['userId'],
  })
  .refine((d) => d.scope !== 'ROLE' || !!d.targetRole, {
    message: 'targetRole é obrigatório para metas de escopo ROLE.',
    path: ['targetRole'],
  })
  .refine((d) => d.scope !== 'UNIT' || !!d.unitId, {
    message: 'unitId é obrigatório para metas de escopo UNIT.',
    path: ['unitId'],
  })
  .refine((d) => !d.progressive || (d.levels?.length ?? 0) > 0, {
    message: 'Metas progressivas precisam de ao menos um nível.',
    path: ['levels'],
  })

// Update: todos os campos opcionais; mantém as regras de coerência quando presentes.
export const updateGoalSchema = goalBaseObject
  .partial()
  .extend({ status: goalStatusEnum.optional(), active: z.boolean().optional() })

// Substituição completa dos níveis de uma meta.
export const replaceLevelsSchema = z.object({
  levels: z.array(goalLevelInput).max(20, 'Máximo de 20 níveis.'),
})

export type CreateGoalInput = z.infer<typeof createGoalSchema>
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>
