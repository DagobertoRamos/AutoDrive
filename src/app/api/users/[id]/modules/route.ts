// =============================================================================
// /api/users/:id/modules — módulos liberados POR COLABORADOR (override do cargo).
//   GET : gestão — catálogo do que o CARGO permite + estado (ligado/desligado)
//   PUT : gestão — salva os módulos REMOVIDOS ({ denied: string[] })
// Só permite mexer no que o cargo do colaborador já dá acesso (não concede
// cross-cargo). Tenant-scoped, auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, hasRole, MANAGEMENT_ROLES, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule, type Module } from '@/lib/permissions'
import { MODULE_CATALOG } from '@/lib/modules-catalog'
import { getDisabledModules } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }

async function loadActorAndTarget(req: Request, id: string) {
  const actor = await getSessionUser()
  if (!actor) return { error: unauthorizedResponse() }
  if (!hasRole(actor.role, MANAGEMENT_ROLES)) return { error: forbiddenResponse('Apenas a gestão pode gerir módulos do colaborador.') }
  const tenantId = await resolveActingTenant(actor, req)
  if (!tenantId) return { error: forbiddenResponse(actingTenantError(actor)) }
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, tenantId: true } })
  if (!target) return { error: NextResponse.json({ success: false, error: 'Colaborador não encontrado.' }, { status: 404 }) }
  if (actor.role !== 'MASTER' && target.tenantId !== tenantId) return { error: forbiddenResponse('Colaborador de outra loja.') }
  return { actor, tenantId, target }
}

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params
  try {
    const r = await loadActorAndTarget(req, id)
    if ('error' in r) return r.error
    const { target } = r

    const [overrides, tenantDisabled] = await Promise.all([
      prisma.userModule.findMany({ where: { userId: id }, select: { moduleKey: true, allowed: true } }),
      target.tenantId ? getDisabledModules(target.tenantId) : Promise.resolve([] as string[]),
    ])
    const denySet = new Set(overrides.filter((o) => !o.allowed).map((o) => o.moduleKey))
    const disabledSet = new Set(tenantDisabled)

    const groups = MODULE_CATALOG.map((g) => ({
      area: g.area,
      features: g.features
        .filter((f) => canAccessModule(target.role, f.key as Module)) // só o que o cargo permite
        .map((f) => ({ key: f.key, label: f.label, tenantDisabled: disabledSet.has(f.key), enabled: !denySet.has(f.key) })),
    })).filter((g) => g.features.length > 0)

    return NextResponse.json({ success: true, data: { user: { id: target.id, name: target.name, role: target.role }, groups } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params
  try {
    const r = await loadActorAndTarget(req, id)
    if ('error' in r) return r.error
    const { actor, tenantId, target } = r

    const body = await req.json().catch(() => ({}))
    const denied: string[] = Array.isArray(body?.denied) ? body.denied.filter((x: unknown) => typeof x === 'string') : []
    // só cria override para chaves que o CARGO já permite
    const allowedByRole = new Set(
      MODULE_CATALOG.flatMap((g) => g.features.map((f) => f.key)).filter((k) => canAccessModule(target.role, k as Module)),
    )
    const cleanDenied = [...new Set(denied)].filter((k) => allowedByRole.has(k))

    await prisma.$transaction([
      prisma.userModule.deleteMany({ where: { userId: id } }),
      ...(cleanDenied.length ? [prisma.userModule.createMany({ data: cleanDenied.map((k) => ({ userId: id, moduleKey: k, allowed: false })) })] : []),
    ])
    await createSafeAuditLog({ userId: actor.id, tenantId, action: 'UPDATE', entity: 'UserModule', entityId: id, userName: actor.name, userRole: actor.role })
    return NextResponse.json({ success: true, data: { denied: cleanDenied } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
