// =============================================================================
// /api/marketing/telephony/connections/[id] — editar/excluir conexão (BYOC).
// PATCH / DELETE : marketing.telephony.manage. Tenant-scoped, auditado.
// PATCH com `secrets` ROTACIONA as credenciais (upsert cifrado). DELETE remove
// as credenciais da conexão junto (não deixa segredo órfão).
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { updateConnectionSchema } from '@/lib/validators/telephony'
import { encryptSecrets, buildMaskedHints, isTelephonyCryptoConfigured } from '@/lib/telephony/crypto'
import type { Prisma } from '@prisma/client'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Conexão não encontrada.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony.manage')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'marketing.telephony.manage'); if (gate) return gate }
  const { id } = await params
  try {
    const existing = await prisma.telephonyTenantConnection.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Conexão de outro tenant.')
    const d = updateConnectionSchema.parse(await req.json())

    const data: Record<string, unknown> = {}
    if (d.environment !== undefined) data.environment = d.environment
    if (d.label !== undefined) data.label = d.label ?? null
    if (d.active !== undefined) data.active = d.active
    if (d.webhookActive !== undefined) data.webhookActive = d.webhookActive

    const secrets = d.secrets ?? null
    if (secrets && Object.keys(secrets).length > 0 && !isTelephonyCryptoConfigured()) {
      return NextResponse.json({ success: false, error: 'TELEPHONY_ENCRYPTION_KEY não configurada no servidor.' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.telephonyTenantConnection.update({ where: { id }, data })
      if (secrets && Object.keys(secrets).length > 0) {
        const cred = await tx.telephonyCredential.findFirst({ where: { connectionId: id }, orderBy: { updatedAt: 'desc' } })
        const payload = {
          tenantId: existing.tenantId, connectionId: id, label: (d.label ?? existing.label) ?? null,
          secretsEncrypted: encryptSecrets(secrets), maskedHints: buildMaskedHints(secrets) as Prisma.InputJsonValue, updatedById: user.id,
        }
        if (cred) await tx.telephonyCredential.update({ where: { id: cred.id }, data: payload })
        else await tx.telephonyCredential.create({ data: { ...payload, createdById: user.id } })
        await tx.telephonyIntegrationLog.create({ data: { tenantId: existing.tenantId, connectionId: id, action: 'ROTATE_CREDENTIALS', status: 'OK', createdByUserId: user.id } })
      }
    })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'TelephonyTenantConnection', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony.manage')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'marketing.telephony.manage'); if (gate) return gate }
  const { id } = await params
  try {
    const existing = await prisma.telephonyTenantConnection.findUnique({ where: { id }, select: { id: true, tenantId: true } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Conexão de outro tenant.')
    await prisma.$transaction(async (tx) => {
      await tx.telephonyCredential.deleteMany({ where: { connectionId: id } })
      await tx.telephonyTenantConnection.delete({ where: { id } })
    })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'DELETE', entity: 'TelephonyTenantConnection', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
