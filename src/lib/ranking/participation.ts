// =============================================================================
// ranking/participation.ts — quem participa do ranking (colaborador e unidade).
// Default: TODOS participam. Guardamos apenas as EXCLUSÕES em SystemSetting
// (sem migration): colaborador desligado some do ranking; unidade desligada
// tira os colaboradores lotados nela E as negociações dela não pontuam para
// ninguém (ex.: galpão). Editável no cadastro do colaborador e da unidade.
// =============================================================================

import { prisma } from '@/lib/prisma'

const USERS_KEY = (tenantId: string) => `t:${tenantId}:ranking_excluded_users`
const UNITS_KEY = (tenantId: string) => `t:${tenantId}:ranking_excluded_units`

async function readList(key: string): Promise<string[]> {
  try {
    const row = await prisma.systemSetting.findFirst({ where: { key }, select: { value: true } })
    if (!row?.value) return []
    const arr = JSON.parse(row.value)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

async function writeList(key: string, list: string[]): Promise<void> {
  const value = JSON.stringify([...new Set(list)])
  const existing = await prisma.systemSetting.findFirst({ where: { key }, select: { id: true } })
  if (existing) await prisma.systemSetting.update({ where: { id: existing.id }, data: { value } })
  else await prisma.systemSetting.create({ data: { key, value, group: 'ranking' } })
}

/** userIds que NÃO participam do ranking. */
export function getRankingExcludedUsers(tenantId: string): Promise<string[]> {
  return readList(USERS_KEY(tenantId))
}

/** unitIds que NÃO participam do ranking. */
export function getRankingExcludedUnits(tenantId: string): Promise<string[]> {
  return readList(UNITS_KEY(tenantId))
}

export async function setUserRankingParticipation(tenantId: string, userId: string, participates: boolean): Promise<void> {
  const current = await getRankingExcludedUsers(tenantId)
  const next = participates ? current.filter((id) => id !== userId) : [...current, userId]
  await writeList(USERS_KEY(tenantId), next)
}

export async function setUnitRankingParticipation(tenantId: string, unitId: string, participates: boolean): Promise<void> {
  const current = await getRankingExcludedUnits(tenantId)
  const next = participates ? current.filter((id) => id !== unitId) : [...current, unitId]
  await writeList(UNITS_KEY(tenantId), next)
}
