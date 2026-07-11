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
import { resolveCrmScope } from '@/lib/crm/shared'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  const scope = await resolveCrmScope(user)
  if (!scope) return forbiddenResponse('Sem acesso aos leads.')

  // Carrega as listas de filtros somente para quem pode ver além dos próprios.
  const [sellers, units] = await Promise.all([
    scope !== 'own'
      ? prisma.user.findMany({
          where: {
            tenantId,
            status: 'ATIVO',
            ...(scope === 'unit' && user.unitId ? { unitId: user.unitId } : {}),
          },
          select: { id: true, name: true, role: true },
          orderBy: { name: 'asc' },
          take: 200,
        }).catch(() => [])
      : Promise.resolve([]),
    scope === 'all'
      ? prisma.unit.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }).catch(() => [])
      : Promise.resolve([]),
  ])

  return NextResponse.json({
    success: true,
    data: {
      scope,
      userId: user.id,
      userName: user.name,
      unitId: user.unitId,
      sellers,
      units,
    },
  })
}
