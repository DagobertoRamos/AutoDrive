// Configurações dos documentos da venda — leitura/gravação (SystemSetting).
import { prisma } from '@/lib/prisma'
import { DEFAULT_DOC_SETTINGS, sanitizeDocSettings, type DocSettings } from './doc-settings-core'

const key = (tenantId: string) => `t:${tenantId}:documents:v1`

export async function loadDocSettings(tenantId: string): Promise<DocSettings> {
  const row = await prisma.systemSetting.findUnique({ where: { key: key(tenantId) }, select: { value: true } }).catch(() => null)
  if (!row) return { ...DEFAULT_DOC_SETTINGS }
  try { return sanitizeDocSettings(JSON.parse(row.value)) } catch { return { ...DEFAULT_DOC_SETTINGS } }
}

export async function saveDocSettings(tenantId: string, input: unknown, userId: string): Promise<DocSettings> {
  const next = sanitizeDocSettings(input, await loadDocSettings(tenantId))
  const value = JSON.stringify(next)
  await prisma.systemSetting.upsert({
    where: { key: key(tenantId) },
    create: { key: key(tenantId), tenantId, value, group: 'documents', description: 'Documentos da venda (cabeçalho e outorgados)', updatedByUserId: userId },
    update: { value, updatedByUserId: userId },
  })
  return next
}
