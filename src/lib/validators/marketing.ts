// =============================================================================
// Zod validators — Marketing / Mesa SDR (Fase 3) — AutoDrive
// Times, membros, políticas de distribuição e ações de lead (claim/assign/...).
// =============================================================================

import { z } from 'zod'

const reqStr = (label: string, min = 2) => z.string().trim().min(min, `${label} é obrigatório.`)
const optStr = z.string().trim().max(2000).nullish()

export const distributionModes = ['ROUND_ROBIN', 'SHARK_TANK', 'MANUAL', 'LOAD_BALANCED', 'PERFORMANCE_WEIGHTED', 'PRIORITY_RULES'] as const
export const presenceStatuses = ['ONLINE', 'BUSY', 'AWAY', 'OFFLINE', 'ON_CALL'] as const
export const memberRoles = ['SDR', 'LEADER'] as const

// ── Times ─────────────────────────────────────────────────────────────────────
export const createTeamSchema = z.object({
  name:        reqStr('Nome do time', 2),
  description: optStr,
  unitId:      optStr,
  active:      z.boolean().default(true),
})
export const updateTeamSchema = z.object({
  name:        z.string().trim().min(2).optional(),
  description: optStr,
  unitId:      optStr,
  active:      z.boolean().optional(),
})

// ── Membros ────────────────────────────────────────────────────────────────────
export const createMemberSchema = z.object({
  teamId:       reqStr('Time', 1),
  userId:       reqStr('Usuário', 1),
  role:         z.enum(memberRoles).default('SDR'),
  active:       z.boolean().default(true),
  maxOpenLeads: z.number().int().positive().max(9999).nullish(),
  weight:       z.number().nonnegative().max(9999).nullish(),
  unitId:       optStr,
})
export const updateMemberSchema = z.object({
  role:         z.enum(memberRoles).optional(),
  active:       z.boolean().optional(),
  presence:     z.enum(presenceStatuses).optional(),
  maxOpenLeads: z.number().int().positive().max(9999).nullish(),
  weight:       z.number().nonnegative().max(9999).nullish(),
  unitId:       optStr,
})

// ── Políticas de distribuição ───────────────────────────────────────────────────
export const createPolicySchema = z.object({
  name:     reqStr('Nome da política', 2),
  mode:     z.enum(distributionModes).default('ROUND_ROBIN'),
  active:   z.boolean().default(true),
  teamId:   optStr,
  unitId:   optStr,
  priority: z.number().int().min(0).max(9999).default(0),
  config:   z.record(z.unknown()).nullish(), // { slaSeconds, fallbackMode, maxOpenLeads, allowedSources, weights, ... }
})
export const updatePolicySchema = z.object({
  name:     z.string().trim().min(2).optional(),
  mode:     z.enum(distributionModes).optional(),
  active:   z.boolean().optional(),
  teamId:   optStr,
  unitId:   optStr,
  priority: z.number().int().min(0).max(9999).optional(),
  config:   z.record(z.unknown()).nullish(),
})

// ── Leads (criação manual + ações) ──────────────────────────────────────────────
export const createLeadSchema = z.object({
  name:       z.string().trim().max(200).nullish(),
  phone:      z.string().trim().max(40).nullish(),
  email:      z.string().trim().email('E-mail inválido.').nullish(),
  source:     optStr,
  unitId:     optStr,
  teamId:     optStr,
  customerId: optStr,
  vehicleId:  optStr,
  notes:      optStr,
}).refine((d) => Boolean(d.name || d.phone || d.email), { message: 'Informe ao menos nome, telefone ou e-mail.' })

export const assignLeadSchema = z.object({
  assignedToUserId: reqStr('Responsável', 1),
  reason:           optStr,
})

export const releaseLeadSchema = z.object({
  reason: optStr,
  // recycle = devolve para a fila/tanque; senão fica apenas sem responsável.
  recycle: z.boolean().default(true),
})

export const convertLeadSchema = z.object({
  dealId: optStr, // negociação resultante (se houver)
  notes:  optStr,
})
