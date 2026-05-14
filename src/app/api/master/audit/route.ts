// =============================================================================
// GET /api/master/audit — Logs de auditoria da plataforma (MASTER only)
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session || session.user.role !== 'MASTER') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const search   = searchParams.get('search')  ?? ''
  const action   = searchParams.get('action')  ?? ''
  const exportFmt= searchParams.get('export')  ?? ''
  const page     = Math.max(1, Number(searchParams.get('page')  ?? 1))
  const limit    = Math.min(200, Math.max(10, Number(searchParams.get('limit') ?? 50)))
  const skip     = (page - 1) * limit

  const where: Record<string, unknown> = {}

  if (search) {
    where.OR = [
      { userName: { contains: search, mode: 'insensitive' } },
      { entity:   { contains: search, mode: 'insensitive' } },
      { action:   { contains: search, mode: 'insensitive' } },
      { entityId: { contains: search } },
    ]
  }
  if (action) where.action = action

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id:        true,
        action:    true,
        entity:    true,
        entityId:  true,
        ipAddress: true,
        userAgent: true,
        status:    true,
        userName:  true,
        userRole:  true,
        tenantId:  true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ])

  // CSV export
  if (exportFmt === 'csv') {
    const header = 'Data,Usuário,Role,Ação,Entidade,EntityId,IP,Status'
    const rows   = logs.map((l) =>
      [
        new Date(l.createdAt).toLocaleString('pt-BR'),
        l.userName  ?? '',
        l.userRole  ?? '',
        l.action,
        l.entity,
        l.entityId  ?? '',
        l.ipAddress ?? '',
        l.status    ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    )
    const csv = [header, ...rows].join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="auditoria-${Date.now()}.csv"`,
      },
    })
  }

  return NextResponse.json({ data: logs, total, page, limit })
}
