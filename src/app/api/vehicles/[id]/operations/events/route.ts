// GET /api/vehicles/[id]/operations/events?before=<iso>&take=50
// Histórico completo do veículo (só leitura; nunca apagado). Eventos técnicos
// e detalhes de provedor só para quem tem ops.logs.view.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { vehicleGuard } from '@/lib/stock/vehicle-guard'
import { opsCan } from '@/lib/automotive/access'
import { opsError } from '@/lib/automotive/route-helpers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const g = await vehicleGuard(id, 'read')
    if ('error' in g) return g.error
    const logs = await opsCan(g.user, 'ops.logs.view')
    const before = req.nextUrl.searchParams.get('before')
    const take = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('take')) || 50))
    const rows = await prisma.operationEvent.findMany({
      where: { vehicleId: id, ...(logs ? {} : { technical: false }), ...(before && !isNaN(Date.parse(before)) ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: { createdAt: 'desc' }, take,
    })
    const codes = new Map((await prisma.vehicleOperation.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.operationId).filter(Boolean) as string[])] } }, select: { id: true, code: true } })).map((o) => [o.id, o.code]))
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id, type: r.type, title: r.title, detail: r.detail, actorName: r.actorName, origin: r.origin, createdAt: r.createdAt,
        operationCode: r.operationId ? codes.get(r.operationId) ?? null : null,
        ...(logs ? { providerId: r.providerId, externalOperationId: r.externalOperationId, requestId: r.requestId, before: r.beforeData, after: r.afterData } : {}),
      })),
      hasMore: rows.length === take,
    })
  } catch (err) {
    return opsError(err)
  }
}
