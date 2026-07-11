// =============================================================================
// GET /api/seller-queue/compliance/my — dados de conformidade do próprio usuário.
// Gate: qualquer usuário autenticado.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { forbiddenResponse } from '@/lib/auth-guards'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse('Tenant não identificado.')

  try {
    const [myPenalties, myFlags] = await Promise.all([
      prisma.sellerQueuePenalty.findMany({ where: { tenantId, sellerId: user.id }, orderBy: { createdAt: 'desc' }, take: 30 }).catch(() => []),
      prisma.sellerQueueFraudFlag.findMany({ where: { tenantId, sellerId: user.id }, orderBy: { createdAt: 'desc' }, take: 20 }).catch(() => []),
    ])
    const activePoints = myPenalties.filter(p => p.active).reduce((sum, p) => sum + p.points, 0)
    const activeRestriction = myPenalties.find(p => p.active && p.endsAt && p.endsAt > new Date()) ?? null
    return NextResponse.json({ success: true, data: { activePoints, activeRestriction, penalties: myPenalties, occurrences: myFlags } })
  } catch (err) { return NextResponse.json({ success: false, error: 'Erro.' }, { status: 500 }) }
}
