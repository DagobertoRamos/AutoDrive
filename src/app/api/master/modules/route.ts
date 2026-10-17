// =============================================================================
// /api/master/modules — Listar e atualizar módulos por tenant (MASTER only)
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ALL_FEATURE_KEYS, applyModuleChanges, normalizeFullState } from '@/lib/modules-catalog'
import { invalidateTenantModulesCache } from '@/lib/tenant-modules'

// ── GET — Todos os tenants com seus módulos ──────────────────────────────────

export async function GET() {
  const session = await getServerAuthSession()
  if (!session || session.user.role !== 'MASTER') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const tenants = await prisma.tenant.findMany({
    orderBy: { name: 'asc' },
    select: {
      id:           true,
      publicId:     true,
      name:         true,
      plan:         true,
      status:       true,
      primaryColor: true,
      modules: {
        select: {
          tenantId:  true,
          module:    true,
          active:    true,
          enabledAt: true,
          disabledAt: true,
        },
      },
    },
  })

  return NextResponse.json({ data: tenants })
}

// ── PUT — Ativar / desativar funcionalidades de um tenant ─────────────────────
// Aceita: { tenantId, module, active } (uma) · { tenantId, changes: {chave: bool} }
// (lote: "selecionar tudo/nada") · { tenantId, enabled: string[] } (estado completo).
// Sempre com cascata da hierarquia (modules-catalog): ligar um filho liga os
// pais; desligar um pai desliga os filhos — o menu nunca fica inconsistente.

export async function PUT(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session || session.user.role !== 'MASTER') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const tenantId: string | undefined = typeof body?.tenantId === 'string' ? body.tenantId : undefined
  if (!tenantId) return NextResponse.json({ error: 'tenantId é obrigatório' }, { status: 400 })

  const rows = await prisma.tenantModule.findMany({ where: { tenantId }, select: { module: true, active: true } })
  const currentOff = rows.filter((r) => !r.active).map((r) => r.module)

  let nextOff: Set<string>
  if (Array.isArray(body?.enabled)) {
    nextOff = new Set(normalizeFullState(body.enabled.filter((x: unknown) => typeof x === 'string')).disabled)
  } else {
    const changes: Record<string, boolean> = {}
    if (body?.changes && typeof body.changes === 'object') {
      for (const [k, v] of Object.entries(body.changes as Record<string, unknown>)) if (typeof v === 'boolean') changes[k] = v
    } else if (typeof body?.module === 'string' && typeof body?.active === 'boolean') {
      changes[body.module] = body.active
    }
    if (!Object.keys(changes).length) return NextResponse.json({ error: 'Informe module/active, changes ou enabled.' }, { status: 400 })
    nextOff = applyModuleChanges(currentOff, changes)
  }

  const stored = new Map(rows.map((r) => [r.module, r.active]))
  const now = new Date()
  const turnedOn: string[] = [], turnedOff: string[] = []
  const ops = []
  for (const key of ALL_FEATURE_KEYS) {
    const active = !nextOff.has(key)
    const prev = stored.get(key)
    if (prev === undefined && active) continue // sem registro = ligado
    if (prev === active) continue
    ;(active ? turnedOn : turnedOff).push(key)
    ops.push(prisma.tenantModule.upsert({
      where: { tenantId_module: { tenantId, module: key } },
      create: { tenantId, module: key, active, enabledAt: active ? now : null, disabledAt: active ? null : now, enabledBy: session.user.id },
      update: { active, enabledAt: active ? now : undefined, disabledAt: active ? undefined : now },
    }))
  }
  if (ops.length) await prisma.$transaction(ops)
  invalidateTenantModulesCache(tenantId)

  if (ops.length) {
    await prisma.auditLog.create({
      data: {
        userId:   session.user.id,
        tenantId,
        action:   turnedOff.length && !turnedOn.length ? 'DISABLE_MODULE' : 'ENABLE_MODULE',
        entity:   'TenantModule',
        entityId: tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        status:   'SUCCESS',
        afterData: { turnedOn, turnedOff },
      },
    })
  }

  const modules = await prisma.tenantModule.findMany({ where: { tenantId }, select: { module: true, active: true } })
  return NextResponse.json({ data: { tenantId, modules, turnedOn, turnedOff } })
}
