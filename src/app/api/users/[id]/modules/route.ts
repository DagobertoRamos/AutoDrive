// =============================================================================
// /api/users/:id/modules — permissões por colaborador (override do cargo).
//   GET : gestão — catálogo, padrão do cargo, extras e bloqueios
//   PUT : gestão — salva extras/bloqueios ({ allowed, denied, reason })
// Cargo base + extras individuais - bloqueios individuais. Tenant-scoped,
// hierarquia aplicada, auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, hasRole, MANAGEMENT_ROLES, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule, getRoleLevel, type Module } from '@/lib/permissions'
import { MODULE_CATALOG } from '@/lib/modules-catalog'
import { canAccessModuleForUser, getDisabledModules } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }

async function loadActorAndTarget(req: Request, id: string) {
  const actor = await getSessionUser()
  if (!actor) return { error: unauthorizedResponse() }
  if (!hasRole(actor.role, MANAGEMENT_ROLES)) return { error: forbiddenResponse('Apenas a gestão pode gerir módulos do colaborador.') }
  const tenantId = await resolveActingTenant(actor, req)
  if (!tenantId) return { error: forbiddenResponse(actingTenantError(actor)) }
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, tenantId: true, unitId: true, status: true } })
  if (!target) return { error: NextResponse.json({ success: false, error: 'Colaborador não encontrado.' }, { status: 404 }) }
  if (actor.role !== 'MASTER' && target.tenantId !== tenantId) return { error: forbiddenResponse('Colaborador de outra loja.') }
  if (!['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO'].includes(actor.role) && actor.unitId && target.unitId !== actor.unitId) {
    return { error: forbiddenResponse('Você só pode alterar colaboradores da sua unidade.') }
  }
  return { actor, tenantId, target }
}

function maxGrantLevel(role: string): number {
  if (role === 'MASTER' || role === 'ADM' || role === 'GERENTE_GERAL') return 4
  if (role === 'GERENTE_ADMINISTRATIVO') return 3
  if (role === 'GERENTE') return 2
  return 0
}

function featureMeta(key: string) {
  for (const group of MODULE_CATALOG) {
    const feature = group.features.find((f) => f.key === key)
    if (feature) return { ...feature, area: group.area, level: feature.level ?? 2, sensitive: feature.sensitive ?? false }
  }
  return null
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
    const allowSet = new Set(overrides.filter((o) => o.allowed).map((o) => o.moduleKey))
    const disabledSet = new Set(tenantDisabled)

    const groups = MODULE_CATALOG.map((g) => ({
      area: g.area,
      features: g.features
        .map((f) => {
          const baseAllowed = canAccessModule(target.role, f.key as Module)
          const extraAllowed = allowSet.has(f.key)
          const blocked = denySet.has(f.key)
          return {
            key: f.key,
            label: f.label,
            level: f.level ?? 2,
            sensitive: f.sensitive ?? false,
            tenantDisabled: disabledSet.has(f.key),
            baseAllowed,
            extraAllowed,
            blocked,
            enabled: (baseAllowed || extraAllowed) && !blocked,
          }
        }),
    })).filter((g) => g.features.length > 0)

    const history = await prisma.auditLog.findMany({
      where: { entity: 'UserModule', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { id: true, action: true, userName: true, userRole: true, createdAt: true, beforeData: true, afterData: true },
    })
    return NextResponse.json({ success: true, data: { user: { id: target.id, name: target.name, role: target.role, unitId: target.unitId, status: target.status }, groups, history } })
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

    if (getRoleLevel(actor.role) <= getRoleLevel(target.role)) return forbiddenResponse('Você não pode alterar permissões de cargo igual ou superior ao seu.')

    const body = await req.json().catch(() => ({}))
    const restoreDefault = body?.restoreDefault === true
    const deniedRaw: string[] = Array.isArray(body?.denied) ? body.denied.filter((x: unknown) => typeof x === 'string') : []
    const allowedRaw: string[] = Array.isArray(body?.allowed) ? body.allowed.filter((x: unknown) => typeof x === 'string') : []
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    const catalogKeys = new Set(MODULE_CATALOG.flatMap((g) => g.features.map((f) => f.key)))

    const before = await prisma.userModule.findMany({ where: { userId: id }, select: { moduleKey: true, allowed: true } })
    if (restoreDefault) {
      await prisma.userModule.deleteMany({ where: { userId: id } })
      await createSafeAuditLog({
        userId: actor.id, tenantId, action: 'PERMISSION_RESTORE_DEFAULT', entity: 'UserModule', entityId: id, userName: actor.name, userRole: actor.role,
        beforeData: { overrides: before }, afterData: { overrides: [], targetUserId: id, targetRole: target.role, reason: reason || null },
      })
      return NextResponse.json({ success: true, data: { allowed: [], denied: [] } })
    }

    const maxLevel = maxGrantLevel(actor.role)
    const cleanAllowed = [...new Set(allowedRaw)].filter((k) => catalogKeys.has(k) && !canAccessModule(target.role, k as Module))
    const cleanDenied = [...new Set(deniedRaw)].filter((k) => catalogKeys.has(k) && canAccessModule(target.role, k as Module))
    const changedKeys = [...new Set([...cleanAllowed, ...cleanDenied])]
    const sensitive = changedKeys.map(featureMeta).filter((f) => f && f.sensitive) as Array<NonNullable<ReturnType<typeof featureMeta>>>

    for (const key of cleanAllowed) {
      const meta = featureMeta(key)
      if (!meta) continue
      if (meta.level > maxLevel) return forbiddenResponse(`Seu cargo não pode conceder a permissão "${meta.label}".`)
      const actorCan = await canAccessModuleForUser(actor, key)
      if (!actorCan) return forbiddenResponse(`Você não possui a permissão "${meta.label}" para concedê-la.`)
    }
    if (sensitive.length > 0 && !reason) {
      return NextResponse.json({ success: false, error: 'Informe o motivo para alterar permissões sensíveis.' }, { status: 400 })
    }

    const data = [
      ...cleanAllowed.map((k) => ({ userId: id, moduleKey: k, allowed: true })),
      ...cleanDenied.filter((k) => !cleanAllowed.includes(k)).map((k) => ({ userId: id, moduleKey: k, allowed: false })),
    ]
    await prisma.$transaction([
      prisma.userModule.deleteMany({ where: { userId: id } }),
      ...(data.length ? [prisma.userModule.createMany({ data })] : []),
    ])
    await createSafeAuditLog({
      userId: actor.id,
      tenantId,
      action: 'PERMISSION_UPDATE',
      entity: 'UserModule',
      entityId: id,
      userName: actor.name,
      userRole: actor.role,
      beforeData: { overrides: before },
      afterData: { allowed: cleanAllowed, denied: cleanDenied, targetUserId: id, targetRole: target.role, reason: reason || null },
    })
    return NextResponse.json({ success: true, data: { allowed: cleanAllowed, denied: cleanDenied } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
