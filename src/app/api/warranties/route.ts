// =============================================================================
// /api/warranties — Listar e cadastrar garantias (multi-tenant + permissão)
//   GET  : qualquer usuário autenticado do tenant (para vender na negociação)
//   POST : apenas perfis com 'registrations.warranties' (admin/financeiro)
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  assertTenantId,
  tenantWhere,
  unauthorizedResponse,
  forbiddenResponse,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createWarrantySchema } from '@/lib/validators/warranty'
import { assertModuleEnabled } from '@/lib/tenant-modules'

// ── GET — listar garantias do tenant ──────────────────────────────────────────

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const onlyActive = searchParams.get('active') === 'true'

    const warranties = await prisma.warranty.findMany({
      where: tenantWhere(user.role, tenantId, onlyActive ? { active: true } : {}),
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ success: true, data: warranties })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST — cadastrar garantia ─────────────────────────────────────────────────

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'registrations.warranties')) {
    return forbiddenResponse('Sem permissão para cadastrar garantias.')
  }
  { const gate = await assertModuleEnabled(user, 'registrations.warranties'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const data = createWarrantySchema.parse(await req.json())

    // Sem adicional → zera os campos de prêmio (regra da spec).
    const premium = data.hasPremiumAddon
    const warranty = await prisma.warranty.create({
      data: {
        tenantId,
        name:                        data.name,
        provider:                    data.provider ?? null,
        coverageType:                data.coverageType ?? null,
        fullPrice:                   data.fullPrice,
        reducedPrice:                data.reducedPrice,
        hasPremiumAddon:             premium,
        premiumAddonName:            premium ? (data.premiumAddonName ?? null) : null,
        premiumAddonValue:           premium ? (data.premiumAddonValue ?? 0) : 0,
        reducedSaleCommissionValue:  data.reducedSaleCommissionValue ?? 0,
        fullSaleCommissionValue:     data.fullSaleCommissionValue ?? 0,
        premiumAddonCommissionValue: premium ? (data.premiumAddonCommissionValue ?? 0) : 0,
        active:                      data.active ?? true,
        notes:                       data.notes ?? null,
        createdById:                 user.id,
        updatedById:                 user.id,
      },
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'CREATE',
      entity:   'Warranty',
      entityId: warranty.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: warranty }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0]?.message ?? 'Dados inválidos.', issues: err.errors },
        { status: 400 },
      )
    }
    return handlePrismaError(err)
  }
}
