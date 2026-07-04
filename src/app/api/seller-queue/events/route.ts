// =============================================================================
// GET /api/seller-queue/events — log/auditoria da fila (antifraude).
// Mostra os eventos do dia (chamadas, aceites, timeouts, pausas/pós-vendas,
// bloqueios, reordenações, fraudes…) com nomes do ator e do vendedor.
// Gate: sellerQueue.lead. Filtros opcionais: ?type=, ?sellerId=, ?limit=.
// Tenant/unit-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { queueDate, unitFromRequest } from '@/lib/seller-queue/queue'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'
import type { SellerQueueEventType } from '@prisma/client'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'queue.view_logs')) return forbiddenResponse('Sem acesso ao log da fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })

  const sp = new URL(req.url).searchParams
  const type = sp.get('type') as SellerQueueEventType | null
  const sellerId = sp.get('sellerId')
  const limit = Math.min(Number(sp.get('limit') ?? 100) || 100, 300)

  try {
    // Eventos do dia (a partir da meia-noite UTC da fila).
    const rows = await prisma.sellerQueueEvent.findMany({
      where: {
        tenantId, unitId, createdAt: { gte: queueDate() },
        ...(type ? { type } : {}),
        ...(sellerId ? { sellerId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    const ids = [...new Set(rows.flatMap((r) => [r.sellerId, r.actorId].filter(Boolean) as string[]))]
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []
    const nameOf = new Map(users.map((u) => [u.id, u.name]))

    const data = rows.map((r) => ({
      id: r.id,
      type: r.type,
      sellerName: r.sellerId ? (nameOf.get(r.sellerId) ?? '—') : null,
      actorName: r.actorId ? (nameOf.get(r.actorId) ?? '—') : null,
      reason: r.reason,
      createdAt: r.createdAt,
    }))
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
