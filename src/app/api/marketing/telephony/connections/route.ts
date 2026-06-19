// =============================================================================
// /api/marketing/telephony/connections — conexões de telefonia da loja (BYOC).
//   GET  : marketing.telephony        — lista conexões (sem segredos; só hints)
//   POST : marketing.telephony.manage — cria conexão; cifra credenciais (se houver)
// Tenant-scoped, auditado. Credenciais NUNCA retornadas em texto puro.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/marketing/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { createConnectionSchema } from '@/lib/validators/telephony'
import { encryptSecrets, buildMaskedHints, isTelephonyCryptoConfigured } from '@/lib/telephony/crypto'
import type { Prisma } from '@prisma/client'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony')) return forbiddenResponse('Sem acesso à telefonia.')
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  try {
    const rows = await prisma.telephonyTenantConnection.findMany({
      where: { tenantId: tid },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      include: {
        provider: { select: { id: true, name: true, kind: true } },
        credentials: { select: { maskedHints: true }, orderBy: { updatedAt: 'desc' }, take: 1 },
      },
    })
    return NextResponse.json({
      success: true,
      cryptoReady: isTelephonyCryptoConfigured(),
      data: rows.map((c) => ({
        id: c.id, providerId: c.providerId, provider: c.provider, environment: c.environment,
        active: c.active, label: c.label, webhookActive: c.webhookActive,
        lastTestAt: c.lastTestAt, lastTestStatus: c.lastTestStatus,
        hasCredentials: c.credentials.length > 0,
        maskedHints: c.credentials[0]?.maskedHints ?? null,
      })),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony.manage')) return forbiddenResponse('Sem permissão para gerenciar telefonia.')
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  try {
    const d = createConnectionSchema.parse(await req.json())
    const provider = await prisma.telephonyProvider.findFirst({ where: { id: d.providerId, active: true }, select: { id: true } })
    if (!provider) return NextResponse.json({ success: false, error: 'Provedor inválido ou inativo.' }, { status: 400 })

    const secrets = d.secrets ?? null
    if (secrets && Object.keys(secrets).length > 0 && !isTelephonyCryptoConfigured()) {
      return NextResponse.json({ success: false, error: 'TELEPHONY_ENCRYPTION_KEY não configurada no servidor — não é possível salvar credenciais com segurança.' }, { status: 400 })
    }

    const conn = await prisma.$transaction(async (tx) => {
      const c = await tx.telephonyTenantConnection.create({
        data: { tenantId: tid, providerId: d.providerId, environment: d.environment, label: d.label ?? null, webhookActive: d.webhookActive, createdById: user.id },
      })
      if (secrets && Object.keys(secrets).length > 0) {
        await tx.telephonyCredential.create({
          data: {
            tenantId: tid, connectionId: c.id, label: d.label ?? null,
            secretsEncrypted: encryptSecrets(secrets),
            maskedHints: buildMaskedHints(secrets) as Prisma.InputJsonValue,
            createdById: user.id, updatedById: user.id,
          },
        })
      }
      await tx.telephonyIntegrationLog.create({
        data: { tenantId: tid, connectionId: c.id, action: 'CREATE', status: 'OK', message: 'Conexão criada', createdByUserId: user.id },
      })
      return c
    })
    await createSafeAuditLog({ userId: user.id, tenantId: tid, action: 'CREATE', entity: 'TelephonyTenantConnection', entityId: conn.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: conn.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
