// =============================================================================
// /api/seller-queue/blocks — bloqueios da fila por unidade.
//   GET  : sellerQueue.manage — lista vendedores bloqueados (auto + manual)
//   POST : sellerQueue.manage — libera 1 vendedor ({sellerId}) ou todos ({all:true})
// Auto-bloqueados saem da fila; por isso não aparecem no Painel. Aqui a gestão
// vê e libera/zera. Tenant/unit-scoped, auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { unitFromRequest, isUserQueueResponsible } from '@/lib/seller-queue/queue'
import { listBlockedSellers, releaseSeller, releaseAllSellers } from '@/lib/seller-queue/penalty'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const isResponsible = await isUserQueueResponsible({ id: user.id, role: user.role, tenantId: user.tenantId ?? '', unitId: user.unitId })
  if (!isResponsible && !await canAccessModuleForUser(user, 'queue.unblock_participant')) return forbiddenResponse('Apenas pessoas autorizadas podem gerir bloqueios.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.manage'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  try {
    const data = await listBlockedSellers(tenantId, unitId)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const isResponsible = await isUserQueueResponsible({ id: user.id, role: user.role, tenantId: user.tenantId ?? '', unitId: user.unitId })
  if (!isResponsible && !await canAccessModuleForUser(user, 'queue.unblock_participant')) return forbiddenResponse('Apenas pessoas autorizadas podem liberar vendedores.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.manage'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  try {
    const body = await req.json().catch(() => ({}))
    const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : null
    if (!reason) {
      return NextResponse.json({ success: false, error: 'Informe o motivo da liberação.' }, { status: 400 })
    }
    if (body?.all === true) {
      const count = await releaseAllSellers(tenantId, unitId)
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'UNBLOCK', entity: 'SellerQueue', entityId: unitId, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true, data: { released: count } })
    }
    const sellerId = typeof body?.sellerId === 'string' ? body.sellerId : null
    if (!sellerId) return NextResponse.json({ success: false, error: 'Informe sellerId ou all:true.' }, { status: 400 })
    await releaseSeller(tenantId, unitId, sellerId)
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UNBLOCK', entity: 'SellerQueueEntry', entityId: sellerId, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
