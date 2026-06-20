// =============================================================================
// /api/services — Listar e criar serviços com isolamento multi-tenant
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
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { parseCurrency } from '@/lib/parsers/currency'
import { assertModuleEnabled } from '@/lib/tenant-modules'

// ── GET — Listar serviços ────────────────────────────────────────────────────

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'registrations.services'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const services = await prisma.service.findMany({
      where: tenantWhere(user.role, tenantId),
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ success: true, data: services })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST — Criar serviço ─────────────────────────────────────────────────────

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'registrations.services'); if (gate) return gate }

  if (!hasRole(user.role, MANAGEMENT_ROLES)) {
    return forbiddenResponse('Apenas gerentes e administradores podem cadastrar serviços.')
  }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const body = await req.json()
    const { name, category, defaultValue, defaultCommission, active, notes } = body

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Nome do serviço é obrigatório.' },
        { status: 400 },
      )
    }

    // Usa parseCurrency para suportar formato pt-BR (ex: "1.500,00")
    const parsedValue      = parseCurrency(defaultValue)      ?? 0
    const parsedCommission = parseCurrency(defaultCommission) ?? 0

    const service = await prisma.service.create({
      data: {
        tenantId,
        name:              String(name),
        category:          category ? String(category) : null,
        defaultValue:      parsedValue,
        defaultCommission: parsedCommission,
        active:            active !== undefined ? Boolean(active) : true,
        notes:             notes ? String(notes) : null,
      },
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'CREATE',
      entity:   'Service',
      entityId: service.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: service }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
