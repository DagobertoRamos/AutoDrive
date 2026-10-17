// Etiquetas de origem no site ("Lojista parceiro" / "Particular intermediado").
// Desligadas por padrão; só o MASTER liga por loja (SystemSetting, sem migration).
import { prisma } from '@/lib/prisma'

const key = (tenantId: string) => `t:${tenantId}:site:originTags`

export async function siteOriginTagsOn(tenantId: string): Promise<boolean> {
  const row = await prisma.systemSetting.findFirst({ where: { key: key(tenantId) }, select: { value: true } }).catch(() => null)
  return row?.value === '1'
}

export async function setSiteOriginTags(tenantId: string, on: boolean, userId: string): Promise<void> {
  const value = on ? '1' : '0'
  await prisma.systemSetting.upsert({
    where: { key: key(tenantId) },
    create: { key: key(tenantId), value, tenantId, group: 'site', description: 'Etiquetas de origem no site (MASTER)', updatedByUserId: userId },
    update: { value, updatedByUserId: userId },
  })
}
