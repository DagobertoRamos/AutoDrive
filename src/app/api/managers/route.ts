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
import { assertModuleEnabled } from '@/lib/tenant-modules'
import bcrypt from 'bcryptjs'

// ── GET — Listar gerentes ────────────────────────────────────────────────────

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'registrations.managers'); if (gate) return gate }

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
  { const gate = await assertModuleEnabled(user, 'registrations.managers'); if (gate) return gate }

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

    // Valida cargo (positionId) e deriva o papel (baseRole → role do User).
    let validatedPositionId: string | null = null
    let positionBaseRole: string | null = null
    if (positionId) {
      const pos = await prisma.position.findUnique({
        where:  { id: String(positionId) },
        select: { id: true, tenantId: true, baseRole: true },
      })
      if (!pos || (pos.tenantId !== null && pos.tenantId !== tenantId)) {
        return NextResponse.json(
          { success: false, error: 'Cargo inválido para este tenant.' },
          { status: 400 },
        )
      }
      validatedPositionId = pos.id
      positionBaseRole = pos.baseRole ?? null
    }
    // Papel do gerente vem do cargo (baseRole); sem cargo → GERENTE. MASTER nunca aqui.
    const managerRole = (positionBaseRole && positionBaseRole !== 'MASTER')
      ? (positionBaseRole as 'ADM' | 'GERENTE_GERAL' | 'GERENTE_ADMINISTRATIVO' | 'GERENTE' | 'VENDEDOR_LIDER' | 'VENDEDOR' | 'FINANCEIRO' | 'USUARIO_LIDER' | 'USUARIO')
      : 'GERENTE'

    const cpfDigits = cpf ? String(cpf).replace(/\D/g, '') : null
    const whatsappDigits = String(whatsapp).replace(/\D/g, '')
    const emailNorm = email ? String(email).toLowerCase().trim() : ''

    let manager
    if (body.userId) {
      // Promoção de um usuário já existente a gerente (1:1 com User).
      manager = await prisma.manager.create({
        data: {
          userId:                String(body.userId),
          fullName:              String(fullName),
          cpf:                   cpfDigits,
          whatsapp:              whatsappDigits,
          email:                 emailNorm || null,
          unitId:                String(unitId),
          accessProfile:         accessProfile ? String(accessProfile) : 'GERENTE',
          active:                active                !== undefined ? Boolean(active)                : true,
          receivesNotifications: receivesNotifications !== undefined ? Boolean(receivesNotifications) : true,
          positionId:            validatedPositionId,
        },
      })
    } else {
      // Cria o ACESSO (User) + Manager, como no cadastro de vendedores.
      if (!emailNorm) {
        return NextResponse.json({ success: false, error: 'E-mail é obrigatório para criar o acesso do gerente.' }, { status: 400 })
      }
      const dup = await prisma.user.findUnique({ where: { email: emailNorm } })
      if (dup) {
        return NextResponse.json({ success: false, error: 'Já existe um usuário cadastrado com este e-mail.' }, { status: 409 })
      }
      const initialPassword = cpfDigits || whatsappDigits
      if (!initialPassword) {
        return NextResponse.json({ success: false, error: 'Informe CPF ou WhatsApp para gerar a senha inicial.' }, { status: 400 })
      }
      const passwordHash = await bcrypt.hash(initialPassword, 12)
      manager = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            tenantId,
            unitId:             String(unitId),
            name:               String(fullName).trim(),
            email:              emailNorm,
            passwordHash,
            role:               managerRole,
            positionId:         validatedPositionId,
            status:             'ATIVO',
            mustChangePassword: true,
          },
        })
        return tx.manager.create({
          data: {
            userId:                newUser.id,
            fullName:              String(fullName).trim(),
            cpf:                   cpfDigits,
            whatsapp:              whatsappDigits,
            email:                 emailNorm,
            unitId:                String(unitId),
            accessProfile:         accessProfile ? String(accessProfile) : 'GERENTE',
            active:                active                !== undefined ? Boolean(active)                : true,
            receivesNotifications: receivesNotifications !== undefined ? Boolean(receivesNotifications) : true,
            positionId:            validatedPositionId,
          },
        })
      })
    }

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
