// =============================================================================
// /api/master/ai/providers/[id] — editar/excluir provedor de IA (Master).
// PATCH re-cifra só os segredos informados (em branco = manter). DELETE remove.
// MASTER-only, auditado. Segredos nunca voltam ao front.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { updateAiProviderSchema } from '@/lib/validators/ai'
import { encryptSecrets, decryptSecrets, maskSecret, isAiCryptoConfigured } from '@/lib/ai/crypto'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Provedor não encontrado.' }, { status: 404 })

function buildHints(d: Record<string, string | null | undefined>) {
  const h: Record<string, string> = {}
  if (d.apiKey) h.apiKey = maskSecret(d.apiKey)
  if (d.clientSecret) h.clientSecret = maskSecret(d.clientSecret)
  return h
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.ai')) return forbiddenResponse('Área exclusiva do MASTER.')
  if (!isAiCryptoConfigured()) return NextResponse.json({ success: false, error: 'Criptografia não configurada (AI_ENCRYPTION_KEY).' }, { status: 503 })
  const { id } = await params
  try {
    const existing = await prisma.aiProvider.findUnique({ where: { id } })
    if (!existing) return notFound()
    const d = updateAiProviderSchema.parse(await req.json())

    const data: Record<string, unknown> = { updatedById: user.id }
    for (const k of ['name', 'kind', 'priority', 'model', 'authType', 'baseUrl', 'active', 'environment', 'maxTokensPerRequest', 'dailyLimit', 'monthlyLimit', 'timeoutMs', 'allowPdf', 'allowImage', 'allowReports', 'allowHelpChat', 'allowDocAnalysis', 'notes'] as const) {
      const v = (d as Record<string, unknown>)[k]
      if (v !== undefined) data[k] = v
    }
    // Segredos: mantém atuais; substitui só os enviados não-vazios.
    if (d.apiKey !== undefined || d.clientSecret !== undefined) {
      const current = decryptSecrets(existing.secretsEncrypted)
      const merged: Record<string, string> = { ...current }
      if (d.apiKey) merged.apiKey = d.apiKey
      if (d.clientSecret) merged.clientSecret = d.clientSecret
      data.secretsEncrypted = encryptSecrets(merged)
      data.maskedHints = buildHints(merged) as never
    }

    await prisma.aiProvider.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, action: 'UPDATE', entity: 'AiProvider', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.ai')) return forbiddenResponse('Área exclusiva do MASTER.')
  const { id } = await params
  try {
    const existing = await prisma.aiProvider.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return notFound()
    await prisma.aiProvider.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, action: 'DELETE', entity: 'AiProvider', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
