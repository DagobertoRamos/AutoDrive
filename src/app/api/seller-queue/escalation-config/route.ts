// =============================================================================
// /api/seller-queue/escalation-config — escalonamento da chamada por unidade.
//   GET : sellerQueue.settings — config de escalonamento (ou defaults)
//   PUT : sellerQueue.settings — grava SÓ o bloco `config.escalation` (merge,
//         preserva attendanceReminder/queuePush/autoBlock/etc.)
// Endpoint dedicado p/ não colidir com o /config (do Codex). Escopo tenant+unidade.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { unitFromRequest } from '@/lib/seller-queue/queue'
import { readEscalationConfig, coerceEscalationConfig } from '@/lib/seller-queue/escalation-config'

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
    return NextResponse.json({ success: true, data: readEscalationConfig(cfg?.config), unitId })
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
    const next = coerceEscalationConfig(await req.json().catch(() => ({})))
    const existing = await prisma.sellerQueueUnitConfig.findUnique({ where: { tenantId_unitId: { tenantId, unitId } }, select: { config: true } })
    const mergedConfig = { ...((existing?.config as Record<string, unknown>) ?? {}), escalation: next }
    await prisma.sellerQueueUnitConfig.upsert({
      where: { tenantId_unitId: { tenantId, unitId } },
      update: { config: mergedConfig as never },
      create: { tenantId, unitId, config: mergedConfig as never },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'SellerQueueEscalationConfig', entityId: unitId, userName: user.name, userRole: user.role, afterData: { active: next.active, levels: next.levels.length } as never })
    return NextResponse.json({ success: true, data: next })
  } catch (err) {
    return handlePrismaError(err)
  }
}
