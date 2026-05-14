// =============================================================================
// /api/managers — Listar e criar gerentes com isolamento multi-tenant
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  assertTenantId,
  hasRole,
  tenantWhere,
  MANAGEMENT_ROLES,
  unauthorizedResponse,
  forbiddenResponse,
  assertUnitBelongsToTenant,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'

// ── GET — Listar gerentes ────────────────────────────────────────────────────

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const { searchParams } = new URL(req.url)
    const unitId = searchParams.get('unitId') ?? undefined

    const managers = await prisma.manager.findMany({
      where: tenantWhere(user.role, tenantId, unitId ? { unitId } : {}),
      include: { unit: { select: { id: true, name: true } } },
      orderBy: { fullName: 'asc' },
    })

    return NextResponse.json({ success: true, data: managers })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST — Criar gerente ─────────────────────────────────────────────────────

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  if (!hasRole(user.role, MANAGEMENT_ROLES)) {
    return forbiddenResponse('Apenas gerentes e administradores podem cadastrar gerentes.')
  }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const body = await req.json()
    const { fullName, cpf, whatsapp, email, unitId, accessProfile, active, receivesNotifications } = body

    if (!fullName || !whatsapp || !unitId) {
      return NextResponse.json(
        { success: false, error: 'Nome completo, WhatsApp e unidade são obrigatórios.' },
        { status: 400 },
      )
    }

    // Valida que a unidade pertence ao tenant do usuário
    await assertUnitBelongsToTenant(String(unitId), tenantId, user.role)

    const manager = await prisma.manager.create({
      data: {
        tenantId,
        fullName:              String(fullName),
        cpf:                   cpf            ? String(cpf)           : null,
        whatsapp:              String(whatsapp),
        email:                 email          ? String(email)         : null,
        unitId:                String(unitId),
        accessProfile:         accessProfile  ? String(accessProfile) : 'GERENTE',
        active:                active                !== undefined ? Boolean(active)                : true,
        receivesNotifications: receivesNotifications !== undefined ? Boolean(receivesNotifications) : true,
      },
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'CREATE',
      entity:   'Manager',
      entityId: manager.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: manager }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
