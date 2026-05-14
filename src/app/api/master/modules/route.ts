// =============================================================================
// /api/master/modules — Listar e atualizar módulos por tenant (MASTER only)
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

// ── PUT — Ativar / desativar módulo de um tenant ─────────────────────────────

export async function PUT(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session || session.user.role !== 'MASTER') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { tenantId, module, active } = await req.json()

  if (!tenantId || !module || active === undefined) {
    return NextResponse.json({ error: 'tenantId, module e active são obrigatórios' }, { status: 400 })
  }

  const updated = await prisma.tenantModule.upsert({
    where: { tenantId_module: { tenantId, module } },
    create: {
      tenantId,
      module,
      active,
      enabledAt:  active ? new Date() : null,
      disabledAt: active ? null : new Date(),
      enabledBy:  session.user.id,
    },
    update: {
      active,
      enabledAt:  active ? new Date() : undefined,
      disabledAt: active ? undefined : new Date(),
    },
  })

  await prisma.auditLog.create({
    data: {
      userId:   session.user.id,
      action:   active ? 'ENABLE_MODULE' : 'DISABLE_MODULE',
      entity:   'TenantModule',
      entityId: tenantId,
      userName: session.user.name,
      userRole: session.user.role,
      status:   'SUCCESS',
      afterData: { module, active },
    },
  })

  return NextResponse.json({ data: updated })
}
