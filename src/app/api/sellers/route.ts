// =============================================================================
// /api/sellers — Listar e criar vendedores com isolamento multi-tenant
//
// Isolamento de tenant: o modelo Seller não tem tenantId direto.
// O vínculo é feito via:
//   • Seller.unit.tenantId  (unidade pertence ao tenant)
//   • Seller.user.tenantId  (User criado junto ao Seller)
//
// Ao criar um vendedor, um User com role VENDEDOR é automaticamente criado.
// Login = email | Senha inicial = CPF (sem pontuação) ou dígitos do WhatsApp
// =============================================================================

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
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

// ── GET — Listar vendedores ──────────────────────────────────────────────────

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'registrations.sellers'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const { searchParams } = new URL(req.url)
    const unitId = searchParams.get('unitId') ?? undefined

    // Seller não tem tenantId direto — filtra pela unidade
    const where: Record<string, unknown> = {}
    if (user.role !== 'MASTER') {
      where.unit = { tenantId: tenantId! }
    }
    if (unitId) {
      where.unitId = unitId
    }

    const sellers = await prisma.seller.findMany({
      where,
      include: {
        unit: { select: { id: true, name: true } },
        position: { select: { id: true, name: true, slug: true, baseRole: true } },
      },
      orderBy: { fullName: 'asc' },
    })

    return NextResponse.json({ success: true, data: sellers })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST — Criar vendedor (e usuário vinculado) ──────────────────────────────

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'registrations.sellers'); if (gate) return gate }

  if (!hasRole(user.role, MANAGEMENT_ROLES)) {
    return forbiddenResponse('Apenas gerentes e administradores podem cadastrar vendedores.')
  }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const body = await req.json()
    const { fullName, shortName, cpf, whatsapp, email, unitId, cargo, active, receivesCharge, positionId } = body

    // ── Validações básicas ───────────────────────────────────────────────────
    if (!fullName?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Nome completo é obrigatório.' },
        { status: 400 },
      )
    }
    if (!whatsapp?.trim()) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp é obrigatório.' },
        { status: 400 },
      )
    }
    if (!unitId) {
      return NextResponse.json(
        { success: false, error: 'Unidade é obrigatória.' },
        { status: 400 },
      )
    }
    if (!email?.trim()) {
      return NextResponse.json(
        { success: false, error: 'E-mail é obrigatório (usado como login do vendedor).' },
        { status: 400 },
      )
    }

    // ── Valida que a unidade pertence ao tenant ──────────────────────────────
    await assertUnitBelongsToTenant(String(unitId), tenantId, user.role)

    // ── Valida cargo (positionId) — sistema (tenantId null) ou do tenant ─────
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

    // ── Checa duplicidade de e-mail ──────────────────────────────────────────
    const emailNorm = String(email).toLowerCase().trim()
    const existingUserByEmail = await prisma.user.findUnique({ where: { email: emailNorm } })
    if (existingUserByEmail) {
      return NextResponse.json(
        { success: false, error: 'Já existe um usuário cadastrado com este e-mail.' },
        { status: 409 },
      )
    }

    // ── Checa duplicidade de CPF (se informado) ──────────────────────────────
    const cpfDigits = cpf ? String(cpf).replace(/\D/g, '') : null
    if (cpfDigits) {
      const existingByCpf = await prisma.seller.findFirst({ where: { cpf: cpfDigits } })
      if (existingByCpf) {
        return NextResponse.json(
          { success: false, error: 'Já existe um vendedor cadastrado com este CPF.' },
          { status: 409 },
        )
      }
    }

    // ── Senha inicial = CPF (sem pontuação) ou dígitos do WhatsApp ───────────
    const whatsappDigits = String(whatsapp).replace(/\D/g, '')
    const initialPassword = cpfDigits || whatsappDigits
    if (!initialPassword) {
      return NextResponse.json(
        { success: false, error: 'Não foi possível gerar senha inicial. Informe CPF ou WhatsApp com dígitos.' },
        { status: 400 },
      )
    }
    const passwordHash = await bcrypt.hash(initialPassword, 12)

    // ── Cria User + Seller em transação atômica ──────────────────────────────
    const { seller } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          tenantId:          tenantId!,
          unitId:            String(unitId),
          name:              String(fullName).trim(),
          email:             emailNorm,
          passwordHash,
          role:              'VENDEDOR',
          status:            'ATIVO',
          mustChangePassword: true,
        },
      })

      const seller = await tx.seller.create({
        data: {
          userId:         newUser.id,
          fullName:       String(fullName).trim(),
          shortName:      shortName      ? String(shortName).trim() : null,
          cpf:            cpfDigits      ?? null,
          whatsapp:       whatsappDigits,
          email:          emailNorm,
          unitId:         String(unitId),
          cargo:          cargo          ? String(cargo) : 'VENDEDOR',
          active:         active         !== undefined ? Boolean(active)         : true,
          receivesCharge: receivesCharge !== undefined ? Boolean(receivesCharge) : true,
          positionId:     validatedPositionId,
        },
      })

      return { user: newUser, seller }
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId: tenantId ?? undefined,
      action:   'CREATE',
      entity:   'Seller',
      entityId: seller.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json(
      {
        success: true,
        data:    seller,
        userCreated:         true,
        initialPasswordHint: cpfDigits ? 'CPF sem pontuação' : 'Dígitos do WhatsApp',
      },
      { status: 201 },
    )
  } catch (err) {
    return handlePrismaError(err)
  }
}
