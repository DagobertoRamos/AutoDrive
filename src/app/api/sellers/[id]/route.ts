// =============================================================================
// /api/sellers/[id] — Atualizar e excluir vendedor
//
// Isolamento: Seller não tem tenantId direto.
// Segurança verificada via seller.unit.tenantId antes de qualquer escrita.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  unauthorizedResponse,
  forbiddenResponse,
  hasRole,
  MANAGEMENT_ROLES,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import type { UserRole } from '@prisma/client'

// ── Verificar se seller pertence ao tenant do usuário ────────────────────────

async function getSeller(id: string, tenantId: string | null, role: string) {
  if (role === 'MASTER') {
    return prisma.seller.findUnique({ where: { id } })
  }
  // Para roles normais, verifica via unidade
  return prisma.seller.findFirst({
    where: { id, unit: { tenantId: tenantId! } },
  })
}

// ── PATCH — Atualizar vendedor ───────────────────────────────────────────────

export async function PATCH(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'registrations.sellers'); if (gate) return gate }
  if (!hasRole(user.role, MANAGEMENT_ROLES)) return forbiddenResponse()

  try {
    const existing = await getSeller(params.id, user.tenantId, user.role)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Vendedor não encontrado.' },
        { status: 404 },
      )
    }

    const body = await req.json()
    const { fullName, shortName, cpf, whatsapp, email, unitId, cargo, active, receivesCharge, positionId } = body

    // Valida positionId (se fornecido) e captura o baseRole do cargo.
    let positionUpdate: string | null | undefined = undefined
    let positionBaseRole: string | null = null
    if (positionId !== undefined) {
      if (positionId === null || positionId === '') {
        positionUpdate = null
      } else {
        const pos = await prisma.position.findUnique({
          where:  { id: String(positionId) },
          select: { id: true, tenantId: true, baseRole: true },
        })
        if (!pos || (pos.tenantId !== null && user.role !== 'MASTER' && pos.tenantId !== user.tenantId)) {
          return NextResponse.json(
            { success: false, error: 'Cargo inválido para este tenant.' },
            { status: 400 },
          )
        }
        positionUpdate = pos.id
        positionBaseRole = pos.baseRole ?? null
      }
    }
    // O cargo/role acompanham a POSIÇÃO escolhida (mesma regra do cadastro). Sem
    // isso, mudar alguém para "Vendedor Líder" na edição NÃO o tornava líder —
    // permissões e escalonamento olham user.role/seller.cargo, não a posição.
    // MASTER nunca é atribuído por aqui (igual ao CREATE).
    const derivedRole: UserRole | null = (positionBaseRole && positionBaseRole !== 'MASTER')
      ? (positionBaseRole as UserRole)
      : null

    const seller = await prisma.seller.update({
      where: { id: params.id },
      data: {
        fullName:       fullName       !== undefined ? String(fullName).trim()       : undefined,
        shortName:      shortName      !== undefined ? (shortName ? String(shortName).trim() : null) : undefined,
        cpf:            cpf            !== undefined ? (cpf ? String(cpf).replace(/\D/g, '') : null) : undefined,
        whatsapp:       whatsapp       !== undefined ? String(whatsapp).replace(/\D/g, '')           : undefined,
        email:          email          !== undefined ? String(email).toLowerCase().trim()             : undefined,
        unitId:         unitId         !== undefined ? String(unitId)                                 : undefined,
        cargo:          derivedRole ?? (cargo !== undefined ? String(cargo) : undefined),
        active:         active         !== undefined ? Boolean(active)                                : undefined,
        receivesCharge: receivesCharge !== undefined ? Boolean(receivesCharge)                        : undefined,
        positionId:     positionUpdate,
      },
    })

    // Propaga nome/e-mail e o PAPEL (derivado do cargo) para o User vinculado.
    if (fullName !== undefined || email !== undefined || derivedRole) {
      await prisma.user.update({
        where: { id: existing.userId },
        data: {
          ...(fullName !== undefined && { name:  String(fullName).trim()               }),
          ...(email    !== undefined && { email: String(email).toLowerCase().trim()    }),
          ...(derivedRole            && { role:  derivedRole                            }),
        },
      })
    }

    return NextResponse.json({ success: true, data: seller })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── PUT — alias de PATCH (compatibilidade com frontend) ─────────────────────

export { PATCH as PUT }

// ── DELETE — Excluir vendedor ────────────────────────────────────────────────

export async function DELETE(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  { const gate = await assertModuleEnabled(user, 'registrations.sellers'); if (gate) return gate }
  if (!hasRole(user.role, MANAGEMENT_ROLES)) return forbiddenResponse()

  try {
    const existing = await getSeller(params.id, user.tenantId, user.role)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Vendedor não encontrado.' },
        { status: 404 },
      )
    }

    await prisma.seller.delete({ where: { id: params.id } })

    return NextResponse.json({ success: true, message: 'Vendedor removido.' })
  } catch (err) {
    return handlePrismaError(err)
  }
}
