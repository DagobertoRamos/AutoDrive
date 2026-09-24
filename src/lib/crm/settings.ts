// =============================================================================
// CRM — listas configuráveis por loja: leitura/gravação em SystemSetting (JSON),
// sem migration. Sem registro → defaults (comportamento atual preservado).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { defaultCrmSettings, sanitizeCrmSettings, type CrmSettings } from './settings-core'

export * from './settings-core'

const key = (tenantId: string) => `t:${tenantId}:crm_settings:v1`

export async function loadCrmSettings(tenantId: string): Promise<CrmSettings> {
  try {
    const row = await prisma.systemSetting.findFirst({ where: { key: key(tenantId) }, select: { value: true } })
    return row ? sanitizeCrmSettings(JSON.parse(row.value)) : defaultCrmSettings()
  } catch {
    return defaultCrmSettings()
  }
}

export async function saveCrmSettings(tenantId: string, input: unknown, userId: string): Promise<CrmSettings> {
  const settings = sanitizeCrmSettings(input)
  const value = JSON.stringify(settings)
  const settingKey = key(tenantId)
  const existing = await prisma.systemSetting.findFirst({ where: { key: settingKey }, select: { id: true } })
  if (existing) {
    await prisma.systemSetting.update({ where: { id: existing.id }, data: { value, tenantId, updatedByUserId: userId } })
  } else {
    await prisma.systemSetting.create({
      data: { key: settingKey, value, tenantId, group: 'crm', description: 'Listas configuráveis do CRM', updatedByUserId: userId },
    })
  }
  return settings
}
