// =============================================================================
// /api/positions/[id] — Detalhe, atualização e exclusão de cargo
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  unauthorizedResponse,
  forbiddenResponse,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { canAccessModule, canPerformAction, type UserRole } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'

export const dynamic = 'force-dynamic'

const VALID_ROLES: UserRole[] = [
  'MASTER',
  'ADM',
  'GERENTE_GERAL',
  'GERENTE',
  'VENDEDOR_LIDER',
  'VENDEDOR',
  'USUARIO_LIDER',
  'USUARIO',
]

/** Master sempre pode; outros só podem se for cargo do próprio tenant. */
function canMutate(user: { role: string; tenantId: string | null }, position: { tenantId: string | null }) {
  if (user.role === 'MASTER') return true
  // Cargos do sistema (tenantId=null) NÃO podem ser editados/deletados por não-MASTER
  if (position.tenantId == null) return false
  return position.tenantId === user.tenantId
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'registrations.positions')) return forbiddenResponse()

  try {
    const position = await prisma.position.findUnique({ where: { id: params.id } })
    if (!position) return NextResponse.json({ success: false, error: 'Cargo não encontrado.' }, { status: 404 })

    // MASTER vê tudo; demais veem do tenant ou do sistema
    if (user.role !== 'MASTER' && position.tenantId != null && position.tenantId !== user.tenantId) {
      return forbiddenResponse()
    }

    return NextResponse.json({ success: true, data: position })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canPerformAction(user.role, 'registrations.positions', 'update')) return forbiddenResponse()

  try {
    const position = await prisma.position.findUnique({ where: { id: params.id } })
    if (!position) return NextResponse.json({ success: false, error: 'Cargo não encontrado.' }, { status: 404 })
    if (!canMutate(user, position)) {
      return forbiddenResponse(
        position.isSystem && position.tenantId == null
          ? 'Cargos do sistema só podem ser editados pelo MASTER.'
          : 'Sem permissão para editar este cargo.',
      )
    }

    const body = await req.json()
    const { name, description, baseRole, sortOrder, active } = body

    const data: Record<string, unknown> = {}
    if (name !== undefined && String(name).trim()) {
      data.name = String(name).trim()
    }
    if (description !== undefined) {
      data.description = description ? String(description).trim() : null
    }
    if (baseRole !== undefined) {
      data.baseRole = baseRole && VALID_ROLES.includes(baseRole) ? baseRole : null
    }
    if (sortOrder !== undefined && typeof sortOrder === 'number') {
      data.sortOrder = sortOrder
    }
    if (active !== undefined) {
      data.active = Boolean(active)
    }

    // Nunca permite renomear slug de cargo do sistema (mantemos slug imutável de qualquer forma)
    const updated = await prisma.position.update({ where: { id: params.id }, data })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId: position.tenantId,
      action:   'UPDATE',
      entity:   'Position',
      entityId: position.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(_req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canPerformAction(user.role, 'registrations.positions', 'delete')) return forbiddenResponse()

  try {
    const position = await prisma.position.findUnique({ where: { id: params.id } })
    if (!position) return NextResponse.json({ success: false, error: 'Cargo não encontrado.' }, { status: 404 })

    if (!canMutate(user, position)) {
      return forbiddenResponse('Sem permissão para excluir este cargo.')
    }

    if (position.isSystem) {
      return NextResponse.json(
        { success: false, error: 'Cargos do sistema não podem ser excluídos.' },
        { status: 400 },
      )
    }

    const rulesUsing = await prisma.commissionRule.count({ where: { positionId: position.id } })
    if (rulesUsing > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Este cargo está em uso por ${rulesUsing} regra(s) de comissão. Remova-as antes de excluir.`,
        },
        { status: 409 },
      )
    }

    await prisma.position.delete({ where: { id: position.id } })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId: position.tenantId,
      action:   'DELETE',
      entity:   'Position',
      entityId: position.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
