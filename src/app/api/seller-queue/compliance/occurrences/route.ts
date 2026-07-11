// =============================================================================
// GET  /api/seller-queue/compliance/occurrences — lista SellerQueueFraudFlags
//      paginadas. Suporta ?status=OPEN|REVIEWED|CONFIRMED|DISMISSED&unitId=&sellerId=
// POST /[id]/decide — confirmar ou descartar uma ocorrência.
// Gate: sellerQueue.reports (view) / sellerQueue.manage (decide).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
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
  const perPage = Math.min(50, Math.max(1, Number(sp.get('perPage') ?? 25)))
  const status  = sp.get('status') ?? undefined
  const sellerFilter = sp.get('sellerId') ?? undefined

  try {
    const where = {
      tenantId,
      ...(unitId     ? { unitId }              : {}),
      ...(status     ? { status }              : { status: { in: ['OPEN','REVIEWED','CONFIRMED','DISMISSED'] as string[] } }),
      ...(sellerFilter ? { sellerId: sellerFilter } : {}),
    }
    const [total, rows] = await Promise.all([
      prisma.sellerQueueFraudFlag.count({ where }),
      prisma.sellerQueueFraudFlag.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page-1)*perPage, take: perPage }),
    ])

    const sellerIds = [...new Set(rows.map(r => r.sellerId).filter(Boolean) as string[])]
    const sellers = sellerIds.length ? await prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true } }).catch(() => []) : []
    const nameMap = new Map(sellers.map(s => [s.id, s.name]))

    return NextResponse.json({
      success: true,
      data: rows.map(r => ({ ...r, sellerName: r.sellerId ? (nameMap.get(r.sellerId) ?? r.sellerId) : null })),
      meta: { total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) },
    })
  } catch (err) {
    console.error('[compliance/occurrences]', err)
    return NextResponse.json({ success: false, error: 'Erro ao carregar ocorrências.' }, { status: 500 })
  }
}
