import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, hasRole, MANAGEMENT_ROLES } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'

export const dynamic = 'force-dynamic'

// Manager não tem tenantId direto — o isolamento é feito via unit.tenantId
// (e via user.tenantId, ambos devem coincidir). Para MASTER, sem filtro.
async function getManagerInTenant(id: string, tenantId: string | null, role: string) {
  if (role === 'MASTER') {
    return prisma.manager.findUnique({ where: { id } })
  }
  return prisma.manager.findFirst({
    where: {
      id,
      OR: [
        { unit: { tenantId: tenantId! } },
        { user: { tenantId: tenantId! } },
      ],
    },
  })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!hasRole(user.role, MANAGEMENT_ROLES)) return forbiddenResponse()

  try {
    const existing = await getManagerInTenant(params.id, user.tenantId, user.role)
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Gerente não encontrado.' },
        { status: 404 },
      )
    }

    const body = await req.json()
    const { fullName, cpf, whatsapp, email, unitId, accessProfile, active, receivesNotifications, positionId } = body

    // Valida positionId (se fornecido)
    let positionUpdate: string | null | undefined = undefined
    if (positionId !== undefined) {
      if (positionId === null || positionId === '') {
        positionUpdate = null
      } else {
        const pos = await prisma.position.findUnique({
          where:  { id: String(positionId) },
          select: { id: true, tenantId: true },
        })
        if (!pos || (pos.tenantId !== null && user.role !== 'MASTER' && pos.tenantId !== user.tenantId)) {
          return NextResponse.json(
            { success: false, error: 'Cargo inválido para este tenant.' },
            { status: 400 },
          )
        }
        positionUpdate = pos.id
      }
    }

    const manager = await prisma.manager.update({
      where: { id: params.id },
      data: {
        fullName:              fullName              !== undefined ? String(fullName)               : undefined,
        cpf:                   cpf                   !== undefined ? String(cpf)                   : undefined,
        whatsapp:              whatsapp              !== undefined ? String(whatsapp)               : undefined,
        email:                 email                 !== undefined ? String(email)                 : undefined,
        unitId:                unitId                !== undefined ? String(unitId)                : undefined,
        accessProfile:         accessProfile         !== undefined ? String(accessProfile)         : undefined,
        active:                active                !== undefined ? Boolean(active)               : undefined,
        receivesNotifications: receivesNotifications !== undefined ? Boolean(receivesNotifications) : undefined,
        positionId:            positionUpdate,
      },
    })
    return NextResponse.json({ success: true, data: manager })
  } catch (err) {
    return handlePrismaError(err)
  }
}
