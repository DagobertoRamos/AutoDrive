// =============================================================================
// unit-config.ts — chave de comissão POR UNIDADE (liga/desliga) + cargos que
// recebem. Guardado em SystemSetting (sem migration). Usado no cadastro da
// unidade e, futuramente, pelo gerador de comissão (galpão = desligado → não
// paga a ninguém; ligado → só os cargos escolhidos recebem).
// =============================================================================

import { prisma } from '@/lib/prisma'

export interface UnitCommissionConfig {
  enabled: boolean
  roles: string[] // cargos (UserRole) que recebem comissão quando enabled
}

const key = (tenantId: string, unitId: string) => `t:${tenantId}:unit_commission:${unitId}`

// Default de compatibilidade: unidade existente sem config = comissão LIGADA,
// sem restrição de cargo (roles vazio = todos os elegíveis). Novas unidades e o
// galpão devem ser configurados explicitamente.
const DEFAULT: UnitCommissionConfig = { enabled: true, roles: [] }

function parse(value: string | null | undefined): UnitCommissionConfig {
  if (!value) return { ...DEFAULT }
  try {
    const j = JSON.parse(value)
    return {
      enabled: j?.enabled !== false,
      roles: Array.isArray(j?.roles) ? j.roles.filter((x: unknown): x is string => typeof x === 'string') : [],
    }
  } catch {
    return { ...DEFAULT }
  }
}

export async function getUnitCommissionConfig(tenantId: string, unitId: string): Promise<UnitCommissionConfig> {
  const row = await prisma.systemSetting.findFirst({ where: { key: key(tenantId, unitId) }, select: { value: true } }).catch(() => null)
  return parse(row?.value)
}

export async function setUnitCommissionConfig(tenantId: string, unitId: string, cfg: UnitCommissionConfig): Promise<void> {
  const k = key(tenantId, unitId)
  const value = JSON.stringify({ enabled: !!cfg.enabled, roles: Array.isArray(cfg.roles) ? [...new Set(cfg.roles)] : [] })
  const existing = await prisma.systemSetting.findFirst({ where: { key: k }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } })
  else await prisma.systemSetting.create({ data: { key: k, value, group: 'commission' } })
}

/** Todas as configs de comissão por unidade do tenant (para a listagem). */
export async function getAllUnitCommissionConfigs(tenantId: string): Promise<Record<string, UnitCommissionConfig>> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { startsWith: `t:${tenantId}:unit_commission:` } }, select: { key: true, value: true } }).catch(() => [])
  const out: Record<string, UnitCommissionConfig> = {}
  for (const r of rows) {
    const unitId = r.key.split(':').pop()
    if (unitId) out[unitId] = parse(r.value)
  }
  return out
}

/** Regra única de elegibilidade — a ser usada pelo gerador de comissão.
 *  Desligada → ninguém recebe. Ligada com roles vazio → todos elegíveis.
 *  Ligada com roles → só os cargos listados. */
export function isRoleCommissionEligible(cfg: UnitCommissionConfig, role: string): boolean {
  if (!cfg.enabled) return false
  if (!cfg.roles.length) return true
  return cfg.roles.includes(role)
}
