import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, hasRole, MANAGEMENT_ROLES } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { parseCurrency } from '@/lib/parsers/currency'

export async function PATCH(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!hasRole(user.role, MANAGEMENT_ROLES)) return forbiddenResponse()

  try {
    const body = await req.json()
    const { name, category, defaultValue, defaultCommission, active, notes } = body

    const service = await prisma.service.update({
      where: { id: params.id, ...(user.role !== 'MASTER' ? { tenantId: user.tenantId } : {}) },
      data: {
        name:              name              !== undefined ? String(name)                              : undefined,
        category:          category          !== undefined ? String(category)                          : undefined,
        defaultValue:      defaultValue      !== undefined ? parseCurrency(defaultValue)    ?? undefined : undefined,
        defaultCommission: defaultCommission !== undefined ? parseCurrency(defaultCommission) ?? undefined : undefined,
        active:            active            !== undefined ? Boolean(active)                           : undefined,
        notes:             notes             !== undefined ? String(notes)                             : undefined,
      },
    })
    return NextResponse.json({ success: true, data: service })
  } catch (err) {
    return handlePrismaError(err)
  }
}
