// =============================================================================
// GET  /api/seller-queue/compliance/penalties — SellerQueuePenalties paginadas.
// POST /[id]/reverse — estornar pontos de uma penalidade (com motivo).
// Gate: sellerQueue.reports (view) / sellerQueue.manage (reverse).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModule } from '@/lib/permissions'
import { unitFromRequest } from '@/lib/seller-queue/queue'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.reports')) return forbiddenResponse('Sem acesso.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  const sp = new URL(req.url).searchParams
  const page    = Math.max(1, Number(sp.get('page') ?? 1))
  const perPage = Math.min(50, Number(sp.get('perPage') ?? 25))
  const onlyActive = sp.get('active') === 'true'
  const sellerFilter = sp.get('sellerId') ?? undefined

  try {
    const where = { tenantId, ...(unitId ? { unitId } : {}), ...(onlyActive ? { active: true } : {}), ...(sellerFilter ? { sellerId: sellerFilter } : {}) }
    const [total, rows] = await Promise.all([
      prisma.sellerQueuePenalty.count({ where }),
      prisma.sellerQueuePenalty.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page-1)*perPage, take: perPage }),
    ])
    const sellerIds = [...new Set(rows.map(r => r.sellerId))]
    const sellers = sellerIds.length ? await prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true } }).catch(() => []) : []
    const nameMap = new Map(sellers.map(s => [s.id, s.name]))
    return NextResponse.json({ success: true, data: rows.map(r => ({ ...r, sellerName: nameMap.get(r.sellerId) ?? r.sellerId })), meta: { total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) } })
  } catch (err) { return NextResponse.json({ success: false, error: 'Erro.' }, { status: 500 }) }
}
