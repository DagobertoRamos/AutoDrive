// =============================================================================
// /api/units — Listar e criar unidades com isolamento multi-tenant
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  assertTenantId,
  hasRole,
  tenantWhere,
  ADMIN_ROLES,
  unauthorizedResponse,
  forbiddenResponse,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'

// ── GET — Listar unidades ────────────────────────────────────────────────────

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const units = await prisma.unit.findMany({
      where: tenantWhere(user.role, tenantId),
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ success: true, data: units })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST — Criar unidade ─────────────────────────────────────────────────────

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  if (!hasRole(user.role, ADMIN_ROLES)) {
    return forbiddenResponse('Apenas administradores podem cadastrar unidades.')
  }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const body = await req.json()
    const { name, razaoSocial, cnpj, address, city, state, phone, email, responsavel, active } = body

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Nome da unidade é obrigatório.' },
        { status: 400 },
      )
    }

    const unit = await prisma.unit.create({
      data: {
        tenantId,
        name:        String(name),
        razaoSocial: razaoSocial ? String(razaoSocial) : null,
        cnpj:        cnpj        ? String(cnpj)        : null,
        address:     address     ? String(address)     : null,
        city:        city        ? String(city)        : null,
        state:       state       ? String(state)       : null,
        phone:       phone       ? String(phone)       : null,
        email:       email       ? String(email)       : null,
        responsavel: responsavel ? String(responsavel) : null,
        active:      active !== undefined ? Boolean(active) : true,
      },
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'CREATE',
      entity:   'Unit',
      entityId: unit.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: unit }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
