// =============================================================================
// GET /api/negotiations/[id]/audit — Auditoria da negociação (paginada)
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'

export async function GET(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations')
    { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const deal = await prisma.deal.findFirst({
    where: await buildNegotiationAccessWhere(session.user, { id: params.id }),
    select: { id: true },
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  const { searchParams } = req.nextUrl
  const page  = Math.max(1, Number(searchParams.get('page')  ?? 1))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 50)))
  const skip  = (page - 1) * limit

  const [logs, total] = await Promise.all([
    (prisma.dealAuditLog as any).findMany({
      where:   { dealId: params.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take:    limit,
    }),
    (prisma.dealAuditLog as any).count({ where: { dealId: params.id } }),
  ])

  return NextResponse.json({
    data: logs,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}
