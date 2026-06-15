// =============================================================================
// /api/reports/audit?view=acessos|alteracoes|exclusoes|eventos — read-only
// Relatórios de auditoria sobre AuditLog. Multi-tenant via tenantWhere; gated
// por canAccessModule('logs').
//  - acessos:    LOGIN/LOGOUT
//  - alteracoes: CREATE*/UPDATE*/EDIT/CHANGE/APPROVE/REJECT
//  - exclusoes:  DELETE*/REMOVE*/CANCEL*
//  - eventos:    status != SUCCESS (erros) ou ações sensíveis (DELETE/CANCEL/DISCOUNT)
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'

const VIEWS = ['acessos', 'alteracoes', 'exclusoes', 'eventos'] as const
type View = (typeof VIEWS)[number]

function viewFilter(view: View): Record<string, unknown> {
  switch (view) {
    case 'acessos':
      return { action: { in: ['LOGIN', 'LOGOUT'] } }
    case 'alteracoes':
      return { OR: ['UPDATE', 'CREATE', 'EDIT', 'CHANGE', 'APPROVE', 'REJECT', 'SERVICE', 'PAYMENT'].map((k) => ({ action: { contains: k } })) }
    case 'exclusoes':
      return { OR: ['DELETE', 'REMOVE', 'CANCEL', 'ARCHIV'].map((k) => ({ action: { contains: k } })) }
    case 'eventos':
      return { OR: [{ status: { not: 'SUCCESS' } }, ...['DELETE', 'CANCEL', 'DISCOUNT', 'REJECT', 'ESCAL'].map((k) => ({ action: { contains: k } }))] }
  }
}

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'logs')) return forbiddenResponse('Sem acesso a relatórios.')

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const viewParam = (searchParams.get('view') ?? 'acessos') as View
    const view: View = VIEWS.includes(viewParam) ? viewParam : 'acessos'

    const where = tenantWhere(user.role, tenantId, viewFilter(view))

    const [rows, byAction, byEntity] = await Promise.all([
      prisma.auditLog.findMany({
        where: where as never, orderBy: { createdAt: 'desc' }, take: 500,
        select: { id: true, action: true, entity: true, entityId: true, userName: true, userRole: true, status: true, errorMessage: true, ipAddress: true, createdAt: true },
      }),
      prisma.auditLog.groupBy({ by: ['action'], where: where as never, _count: { _all: true } }),
      prisma.auditLog.groupBy({ by: ['entity'], where: where as never, _count: { _all: true } }),
    ])

    const data = rows.map((a) => ({
      id: a.id, action: a.action, entity: a.entity, entityId: a.entityId,
      usuario: a.userName ?? '—', papel: a.userRole ?? '—', status: a.status ?? 'SUCCESS',
      errorMessage: a.errorMessage, ip: a.ipAddress, createdAt: a.createdAt,
    }))

    return NextResponse.json({
      success: true, view,
      summary: { count: data.length, erros: data.filter((d) => d.status !== 'SUCCESS').length, usuarios: new Set(data.map((d) => d.usuario)).size },
      byAction: byAction.map((g) => ({ key: g.action, count: g._count._all })).sort((a, b) => b.count - a.count).slice(0, 12),
      byEntity: byEntity.map((g) => ({ key: g.entity, count: g._count._all })).sort((a, b) => b.count - a.count).slice(0, 12),
      data,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
