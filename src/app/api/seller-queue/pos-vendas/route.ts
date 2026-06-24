// =============================================================================
// /api/seller-queue/pos-vendas
//   GET  : sellerQueue.lead  — lista pós-vendas em aberto (para autorizar)
//   POST : sellerQueue.view  — inicia pós-vendas p/ um colaborador { sellerId }
// Tenant/unit-scoped, auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { unitFromRequest } from '@/lib/seller-queue/queue'
import { startPosVenda, listPosVendas } from '@/lib/seller-queue/pos-vendas'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.lead')) return forbiddenResponse('Sem acesso ao painel da fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  try {
    return NextResponse.json({ success: true, data: await listPosVendas(tenantId, unitId) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })
  try {
    const body = await req.json().catch(() => ({}))
    const sellerId = typeof body?.sellerId === 'string' ? body.sellerId : null
    if (!sellerId) return NextResponse.json({ success: false, error: 'Informe o colaborador (sellerId).' }, { status: 400 })
    const target = await prisma.user.findUnique({ where: { id: sellerId }, select: { tenantId: true, unitId: true } })
    if (!target || target.tenantId !== tenantId || target.unitId !== unitId) {
      return NextResponse.json({ success: false, error: 'Colaborador inválido para esta unidade.' }, { status: 400 })
    }
    const r = await startPosVenda({ tenantId, unitId, sellerId, startedById: user.id })
    if (!r.ok) return NextResponse.json({ success: false, error: r.reason ?? 'Não foi possível iniciar o pós-vendas.' }, { status: 409 })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'POS_VENDA_START', entity: 'SellerQueuePosVenda', entityId: sellerId, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
