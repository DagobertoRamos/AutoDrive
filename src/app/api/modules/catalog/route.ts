// =============================================================================
// GET /api/modules/catalog?positionId=<id> — catálogo de módulos liberados por
// um CARGO (para configurar no cadastro do colaborador NOVO, antes de existir
// userId). Retorna os mesmos grupos do editor por usuário, todos habilitados.
// Gate: gestão. Tenant-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, hasRole, MANAGEMENT_ROLES } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule, type Module } from '@/lib/permissions'
import { MODULE_CATALOG } from '@/lib/modules-catalog'
import { getDisabledModules } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const actor = await getSessionUser()
  if (!actor) return unauthorizedResponse()
  if (!hasRole(actor.role, MANAGEMENT_ROLES)) return forbiddenResponse('Apenas a gestão pode ver os módulos do cargo.')
  const tenantId = await resolveActingTenant(actor, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(actor))
  try {
    const { searchParams } = new URL(req.url)
    const positionId = searchParams.get('positionId')
    if (!positionId) return NextResponse.json({ success: false, error: 'positionId obrigatório.' }, { status: 400 })

    const pos = await prisma.position.findUnique({ where: { id: positionId }, select: { baseRole: true } })
    if (!pos?.baseRole) return NextResponse.json({ success: true, data: { groups: [] } })
    const role = pos.baseRole
    const disabled = new Set(await getDisabledModules(tenantId))

    const groups = MODULE_CATALOG.map((g) => ({
      area: g.area,
      features: g.features
        .map((f) => {
          const baseAllowed = canAccessModule(role, f.key as Module)
          return {
            key: f.key,
            label: f.label,
            level: f.level ?? 2,
            sensitive: f.sensitive ?? false,
            tenantDisabled: disabled.has(f.key),
            baseAllowed,
            extraAllowed: false,
            blocked: false,
            enabled: baseAllowed,
          }
        }),
    })).filter((g) => g.features.length > 0)

    return NextResponse.json({ success: true, data: { groups } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
