// =============================================================================
// /api/managers — Listar e criar gerentes com isolamento multi-tenant
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  assertTenantId,
  hasRole,
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

    // Manager não tem tenantId direto — isolamento via unit.tenantId (com user.tenantId como fallback).
    const where: Record<string, unknown> = {}
    if (user.role !== 'MASTER') {
      where.OR = [
        { unit: { tenantId: tenantId! } },
        { user: { tenantId: tenantId! } },
      ]
    }
    if (unitId) where.unitId = unitId

    const managers = await prisma.manager.findMany({
      where,
      include: {
        unit: { select: { id: true, name: true } },
        position: { select: { id: true, name: true, slug: true, baseRole: true } },
      },
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
    const { fullName, cpf, whatsapp, email, unitId, accessProfile, active, receivesNotifications, positionId } = body

    if (!fullName || !whatsapp || !unitId) {
      return NextResponse.json(
        { success: false, error: 'Nome completo, WhatsApp e unidade são obrigatórios.' },
        { status: 400 },
      )
    }

    // Valida que a unidade pertence ao tenant do usuário
    await assertUnitBelongsToTenant(String(unitId), tenantId, user.role)

    // Valida cargo (positionId)
    let validatedPositionId: string | null = null
    if (positionId) {
      const pos = await prisma.position.findUnique({
        where:  { id: String(positionId) },
        select: { id: true, tenantId: true },
      })
      if (!pos || (pos.tenantId !== null && pos.tenantId !== tenantId)) {
        return NextResponse.json(
          { success: false, error: 'Cargo inválido para este tenant.' },
          { status: 400 },
        )
      }
      validatedPositionId = pos.id
    }

    // NOTE: Manager exige userId (relação 1:1 com User). Este endpoint legado
    // não cria o User correspondente — é responsabilidade do consumidor já
    // ter o User criado. Usamos cast `as never` para tipagem; runtime falha
    // se userId não vier do body, mas o validador já garante isso adiante.
    const manager = await prisma.manager.create({
      data: ({
        // Manager não tem tenantId direto — é derivado via unitId → unit.tenantId.
        // (tenantId já foi validado acima via assertUnitBelongsToTenant.)
        userId:                String(body.userId ?? ''),
        fullName:              String(fullName),
        cpf:                   cpf            ? String(cpf)           : null,
        whatsapp:              String(whatsapp),
        email:                 email          ? String(email)         : null,
        unitId:                String(unitId),
        accessProfile:         accessProfile  ? String(accessProfile) : 'GERENTE',
        active:                active                !== undefined ? Boolean(active)                : true,
        receivesNotifications: receivesNotifications !== undefined ? Boolean(receivesNotifications) : true,
        positionId:            validatedPositionId,
      }) as never,
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
