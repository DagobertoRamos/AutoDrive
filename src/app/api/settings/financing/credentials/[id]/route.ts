// =============================================================================
// /api/settings/financing/credentials/[id] — editar / excluir credencial (F&I).
// PATCH: re-cifra apenas os segredos informados (mantém os demais), sem revelar
// os anteriores. DELETE: remove. Tudo auditado. financing.config.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { updateCredentialSchema } from '@/lib/validators/financing'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { encryptSecrets, decryptSecrets, maskSecret, isCryptoConfigured } from '@/lib/finance/crypto'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Credencial não encontrada.' }, { status: 404 })

function buildHints(d: Record<string, string | null | undefined>) {
  const h: Record<string, string> = {}
  if (d.usuario) h.usuario = d.usuario
  if (d.clientId) h.clientId = d.clientId
  if (d.storeCode) h.storeCode = d.storeCode
  if (d.senha) h.senha = maskSecret(d.senha)
  if (d.token) h.token = maskSecret(d.token)
  if (d.clientSecret) h.clientSecret = maskSecret(d.clientSecret)
  return h
}

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'financing.config'); if (gate) return gate }
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  if (!isCryptoConfigured()) return NextResponse.json({ success: false, error: 'Criptografia não configurada (FINANCE_ENCRYPTION_KEY).' }, { status: 503 })
  const { id } = await params

  try {
    const existing = await prisma.financeCredential.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, tid, existing.tenantId)) return forbiddenResponse('Credencial de outro tenant.')

    const d = updateCredentialSchema.parse(await req.json())
    // Merge: mantém segredos atuais; substitui só os enviados não-vazios.
    const current = decryptSecrets(existing.secretsEncrypted)
    const merged: Record<string, string> = { ...current }
    for (const k of ['usuario', 'senha', 'token', 'clientId', 'clientSecret', 'storeCode'] as const) {
      const v = (d as Record<string, string | null | undefined>)[k]
      if (v !== undefined && v !== null && v !== '') merged[k] = v
    }
    const data: Record<string, unknown> = { updatedById: user.id, secretsEncrypted: encryptSecrets(merged), maskedHints: buildHints(merged) as never }
    if (d.bankId) data.bankId = d.bankId
    if (d.environment) data.environment = d.environment
    if (d.label !== undefined) data.label = d.label ?? null

    await prisma.financeCredential.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'FinanceCredential', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'financing.config'); if (gate) return gate }
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  const { id } = await params
  try {
    const existing = await prisma.financeCredential.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, tid, existing.tenantId)) return forbiddenResponse('Credencial de outro tenant.')
    await prisma.financeCredential.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'DELETE', entity: 'FinanceCredential', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
