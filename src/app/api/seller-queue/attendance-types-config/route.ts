// =============================================================================
// /api/seller-queue/attendance-types-config — tipos de atendimento por unidade.
//   GET : sellerQueue.settings — tipos (ou defaults)
//   PUT : sellerQueue.settings — grava SÓ o bloco `config.attendanceTypes` (merge).
// Endpoint dedicado (não colide com /config). Escopo tenant+unidade.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { unitFromRequest } from '@/lib/seller-queue/queue'
import { readAttendanceTypesConfig, coerceAttendanceTypesConfig } from '@/lib/seller-queue/attendance-types-config'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.settings')) return forbiddenResponse('Sem acesso às configurações.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.settings'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  try {
    const cfg = await prisma.sellerQueueUnitConfig.findUnique({ where: { tenantId_unitId: { tenantId, unitId } }, select: { config: true } })
    return NextResponse.json({ success: true, data: readAttendanceTypesConfig(cfg?.config), unitId })
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
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  try {
    const next = coerceAttendanceTypesConfig(await req.json().catch(() => ({})))
    const existing = await prisma.sellerQueueUnitConfig.findUnique({ where: { tenantId_unitId: { tenantId, unitId } }, select: { config: true } })
    const mergedConfig = { ...((existing?.config as Record<string, unknown>) ?? {}), attendanceTypes: next }
    await prisma.sellerQueueUnitConfig.upsert({
      where: { tenantId_unitId: { tenantId, unitId } },
      update: { config: mergedConfig as never },
      create: { tenantId, unitId, config: mergedConfig as never },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'SellerQueueAttendanceTypesConfig', entityId: unitId, userName: user.name, userRole: user.role, afterData: { count: next.types.length } as never })
    return NextResponse.json({ success: true, data: next })
  } catch (err) {
    return handlePrismaError(err)
  }
}
