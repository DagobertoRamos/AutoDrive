// =============================================================================
// /api/seller-queue/config — configuração da fila por unidade.
//   GET : sellerQueue.settings — config atual (ou defaults)
//   PUT : sellerQueue.settings — cria/atualiza (geofence/QR/timeout/regras)
// Tenant/unit-scoped, auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { configSchema } from '@/lib/validators/seller-queue'
import { unitFromRequest } from '@/lib/seller-queue/queue'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const unitOf = (req: Request, fallback: string | null) => unitFromRequest(req, fallback)

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.settings')) return forbiddenResponse('Sem acesso às configurações.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.settings'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitOf(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  try {
    const cfg = await prisma.sellerQueueUnitConfig.findUnique({ where: { tenantId_unitId: { tenantId, unitId } } })
    return NextResponse.json({ success: true, data: cfg, unitId })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.settings')) return forbiddenResponse('Sem permissão para configurar.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.settings'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitOf(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  try {
    const d = configSchema.parse(await req.json())

    // Estratégia anti-abuso vai no campo JSON `config` (sem coluna nova). Mescla
    // com o que já houver lá para não apagar outros extras.
    let mergedConfig: Record<string, unknown> | undefined
    if (d.autoBlock !== undefined || d.allowSellerFinish !== undefined || d.leadCloseReasons !== undefined || d.negotiationReasons !== undefined) {
      const existing = await prisma.sellerQueueUnitConfig.findUnique({ where: { tenantId_unitId: { tenantId, unitId } }, select: { config: true } })
      mergedConfig = { ...((existing?.config as Record<string, unknown>) ?? {}) }
      if (d.autoBlock !== undefined) mergedConfig.autoBlock = d.autoBlock
      if (d.allowSellerFinish !== undefined) mergedConfig.allowSellerFinish = d.allowSellerFinish
      if (d.leadCloseReasons !== undefined) mergedConfig.leadCloseReasons = d.leadCloseReasons
      if (d.negotiationReasons !== undefined) mergedConfig.negotiationReasons = d.negotiationReasons
    }

    const data = {
      active: d.active, presenceMethods: d.presenceMethods, geofenceLat: d.geofenceLat ?? null, geofenceLng: d.geofenceLng ?? null,
      geofenceRadiusM: d.geofenceRadiusM, qrSecret: d.qrSecret ?? null, acceptTimeoutSeconds: d.acceptTimeoutSeconds,
      requireRevalidationOnAccept: d.requireRevalidationOnAccept, openTime: d.openTime ?? null, closeTime: d.closeTime ?? null,
      allowedDays: d.allowedDays, recurringCustomerRule: d.recurringCustomerRule, requestByNameRequiresApproval: d.requestByNameRequiresApproval,
      alertSound: d.alertSound, alertSoundType: d.alertSoundType, alertBrowserPush: d.alertBrowserPush, alertWhatsapp: d.alertWhatsapp,
      alertWhatsappManagers: d.alertWhatsappManagers, alertRepeatSeconds: d.alertRepeatSeconds, allowChooseSeller: d.allowChooseSeller,
      config: mergedConfig,
      updatedById: user.id,
    }
    // Remove undefined (mantém só o que veio).
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
    const cfg = await prisma.sellerQueueUnitConfig.upsert({
      where: { tenantId_unitId: { tenantId, unitId } },
      update: clean,
      create: { tenantId, unitId, ...clean },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'SellerQueueUnitConfig', entityId: cfg.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: cfg })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
