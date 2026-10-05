// =============================================================================
// /api/positions — Listar e criar cargos (isolamento multi-tenant)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  unauthorizedResponse,
  forbiddenResponse,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { canAccessModule, canPerformAction, ROLE_LABELS, type UserRole } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { canActOn } from '@/lib/role-hierarchy'

export const dynamic = 'force-dynamic'

// Roles válidos para baseRole: todo o enum UserRole (via ROLE_LABELS) menos MASTER,
// que nunca é atribuído por cargo.
const VALID_ROLES: UserRole[] = (Object.keys(ROLE_LABELS) as UserRole[]).filter((r) => r !== 'MASTER')

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')            // remove diacríticos
    .toLowerCase()
    .replace(/&/g, 'e')
    .replace(/[^a-z0-9]+/g, '_')                // não-alfanum vira _
    .replace(/^_+|_+$/g, '')                    // strip _ das pontas
    .replace(/_+/g, '_')
}

// MASTER vê tudo; demais veem do tenant + sistema (tenantId=null)
function tenantOrSystemWhere(role: string, tenantId: string | null) {
  if (role === 'MASTER') return {}
  return {
    OR: [
      { tenantId: null },
      ...(tenantId ? [{ tenantId }] : []),
    ],
  }
}

// ── GET — Listar cargos ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  // Leitura: quem administra cargos vê todos; quem só cadastra colaboradores
  // (vendedores/gerentes) também precisa da lista para o formulário — mas apenas
  // dos cargos ABAIXO do próprio nível (anti-escalonamento).
  const canManagePositions = canAccessModule(user.role, 'registrations.positions')
  const readModule = canManagePositions
    ? 'registrations.positions'
    : canAccessModule(user.role, 'registrations.sellers')
      ? 'registrations.sellers'
      : canAccessModule(user.role, 'registrations.managers')
        ? 'registrations.managers'
        : null
  if (!readModule) return forbiddenResponse()
  { const gate = await assertModuleEnabled(user, readModule); if (gate) return gate }

  try {
    const url = new URL(req.url)
    const activeParam = url.searchParams.get('active')

    const where: Record<string, unknown> = {
      ...tenantOrSystemWhere(user.role, user.tenantId),
    }
    if (activeParam === 'true')  where.active = true
    if (activeParam === 'false') where.active = false

    const positions = await prisma.position.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })

    const visible = canManagePositions
      ? positions
      : positions.filter((p) => canActOn(user.role, p.baseRole ?? null))

    return NextResponse.json({ success: true, data: visible })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST — Criar cargo ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canPerformAction(user.role, 'registrations.positions', 'create')) return forbiddenResponse()

  try {
    const body = await req.json()
    const { name, description, baseRole, sortOrder, active } = body

    if (!name || !String(name).trim()) {
      return NextResponse.json({ success: false, error: 'Nome do cargo é obrigatório.' }, { status: 400 })
    }

    const cleanName = String(name).trim()
    const slug = slugify(cleanName)
    if (!slug) {
      return NextResponse.json({ success: false, error: 'Nome inválido para gerar identificador.' }, { status: 400 })
    }

    // MASTER cria cargos globais (tenantId=null); demais escrevem no próprio tenant
    const tenantId = user.role === 'MASTER' ? null : (user.tenantId ?? null)
    if (user.role !== 'MASTER' && !tenantId) {
      return NextResponse.json({ success: false, error: 'Usuário sem empresa vinculada.' }, { status: 400 })
    }

    // Checa duplicidade dentro do mesmo escopo (tenantId, slug)
    const existing = await prisma.position.findFirst({
      where: { tenantId, slug },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Já existe um cargo com esse nome.' },
        { status: 409 },
      )
    }

    const validatedBaseRole = baseRole && VALID_ROLES.includes(baseRole) ? baseRole : null

    const position = await prisma.position.create({
      data: {
        tenantId,
        name:        cleanName,
        slug,
        description: description ? String(description).trim() : null,
        baseRole:    validatedBaseRole,
        isSystem:    false,
        active:      active !== false,
        sortOrder:   typeof sortOrder === 'number' ? sortOrder : 0,
      },
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'CREATE',
      entity:   'Position',
      entityId: position.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: position }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
