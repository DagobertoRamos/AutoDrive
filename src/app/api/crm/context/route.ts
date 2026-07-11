// =============================================================================
// GET /api/crm/context — contexto do CRM para o usuário logado: scope + listas
// de filtros (responsáveis, unidades) adequadas ao escopo. O front usa isto para
// montar os filtros sem expor dados além do scope. Gate: crm.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { resolveCrmScope, resolveCrmAttendanceScope } from '@/lib/crm/shared'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  const [scope, attendanceScope] = await Promise.all([
    resolveCrmScope(user),
    resolveCrmAttendanceScope(user),
  ])
  if (!scope && !attendanceScope) return forbiddenResponse('Sem acesso ao CRM.')
  // Usa o scope mais amplo para carregar as listas de filtros.
  const effectiveScope = scope ?? attendanceScope

  // Carrega as listas de filtros somente para quem pode ver além dos próprios.
  const [sellers, units] = await Promise.all([
    effectiveScope !== 'own'
      ? prisma.user.findMany({
          where: {
            tenantId,
            status: 'ATIVO',
            ...(effectiveScope === 'unit' && user.unitId ? { unitId: user.unitId } : {}),
          },
          select: { id: true, name: true, role: true },
          orderBy: { name: 'asc' },
          take: 200,
        }).catch(() => [])
      : Promise.resolve([]),
    effectiveScope === 'all'
      ? prisma.unit.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }).catch(() => [])
      : Promise.resolve([]),
  ])

  return NextResponse.json({
    success: true,
    data: {
      scope: scope ?? 'own',
      attendanceScope: attendanceScope ?? 'own',
      userId: user.id,
      userName: user.name,
      unitId: user.unitId,
      sellers,
      units,
    },
  })
}
