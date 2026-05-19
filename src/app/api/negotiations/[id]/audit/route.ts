// =============================================================================
// GET /api/negotiations/[id]/audit — Auditoria da negociação (paginada)
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule, canAccessModule } from '@/lib/permissions'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const deal = await prisma.deal.findUnique({ where: { id: params.id } })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  // Vendedor só vê auditoria da própria negociação
  const isManager = canAccessModule(session.user.role, 'negotiations.manage')
  if (!isManager) {
    const seller = await prisma.seller.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!seller || deal.sellerId !== seller.id) {
      return NextResponse.json({ error: 'Sem permissão para ver auditoria desta negociação' }, { status: 403 })
    }
  }

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
