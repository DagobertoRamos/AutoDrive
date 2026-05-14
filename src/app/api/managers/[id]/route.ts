import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, hasRole, MANAGEMENT_ROLES } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!hasRole(user.role, MANAGEMENT_ROLES)) return forbiddenResponse()

  try {
    const body = await req.json()
    const { fullName, cpf, whatsapp, email, unitId, accessProfile, active, receivesNotifications } = body

    const manager = await prisma.manager.update({
      where: { id: params.id, ...(user.role !== 'MASTER' ? { tenantId: user.tenantId } : {}) },
      data: {
        fullName:              fullName              !== undefined ? String(fullName)               : undefined,
        cpf:                   cpf                   !== undefined ? String(cpf)                   : undefined,
        whatsapp:              whatsapp              !== undefined ? String(whatsapp)               : undefined,
        email:                 email                 !== undefined ? String(email)                 : undefined,
        unitId:                unitId                !== undefined ? String(unitId)                : undefined,
        accessProfile:         accessProfile         !== undefined ? String(accessProfile)         : undefined,
        active:                active                !== undefined ? Boolean(active)               : undefined,
        receivesNotifications: receivesNotifications !== undefined ? Boolean(receivesNotifications) : undefined,
      },
    })
    return NextResponse.json({ success: true, data: manager })
  } catch (err) {
    return handlePrismaError(err)
  }
}
