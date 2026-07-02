import { prisma } from '@/lib/prisma'

export interface CommissionBehaviorSettings {
  managerReceivesOnOwnSale: boolean
}

export const DEFAULT_COMMISSION_BEHAVIOR: CommissionBehaviorSettings = {
  managerReceivesOnOwnSale: false,
}

const key = (tenantId: string) => `t:${tenantId}:commission_behavior`

function parse(value: string | null | undefined): CommissionBehaviorSettings {
  if (!value) return { ...DEFAULT_COMMISSION_BEHAVIOR }
  try {
    const json = JSON.parse(value)
    return {
      managerReceivesOnOwnSale: json?.managerReceivesOnOwnSale === true,
    }
  } catch {
    return { ...DEFAULT_COMMISSION_BEHAVIOR }
  }
}

export async function getCommissionBehaviorSettings(tenantId: string): Promise<CommissionBehaviorSettings> {
  const row = await prisma.systemSetting
    .findFirst({ where: { key: key(tenantId) }, select: { value: true } })
    .catch(() => null)

  return parse(row?.value)
}

export async function setCommissionBehaviorSettings(
  tenantId: string,
  input: Partial<CommissionBehaviorSettings>,
): Promise<CommissionBehaviorSettings> {
  const next: CommissionBehaviorSettings = {
    managerReceivesOnOwnSale: input.managerReceivesOnOwnSale === true,
  }
  const settingKey = key(tenantId)
  const value = JSON.stringify(next)
  const existing = await prisma.systemSetting.findFirst({ where: { key: settingKey }, select: { id: true } })

  if (existing) {
    await prisma.systemSetting.update({ where: { id: existing.id }, data: { value, tenantId } })
  } else {
    await prisma.systemSetting.create({
      data: {
        tenantId,
        key:         settingKey,
        value,
        group:       'commission',
        description: 'Comportamento do motor de comissões',
      },
    })
  }

  return next
}
