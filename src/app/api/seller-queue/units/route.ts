// =============================================================================
// GET /api/seller-queue/units — unidades da loja ativa (p/ o seletor do MASTER).
// Gate: sellerQueue.view. Escopado pelo tenant (resolveActingTenant).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const units = await prisma.unit.findMany({ where: { tenantId, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
    return NextResponse.json({ success: true, data: units })
  } catch (err) {
    return handlePrismaError(err)
  }
}
