// =============================================================================
// /api/master/financing/flags/[id] — editar/excluir feature flag fi_* (Master).
//   PATCH / DELETE : master.financing. Só atua sobre flags fi_*.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { featureFlagSchema } from '@/lib/validators/financing'
import { zodErrorResponse } from '@/lib/finance/finance-service'

type Ctx = { params: Promise<{ id: string }> }
const guardKey = (key: string) => key.startsWith('fi_')
const notFound = () => NextResponse.json({ success: false, error: 'Flag não encontrada.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.financing')) return forbiddenResponse('Área exclusiva do MASTER.')
  const { id } = await params
  try {
    const existing = await prisma.featureFlag.findUnique({ where: { id }, select: { id: true, key: true } })
    if (!existing || !guardKey(existing.key)) return notFound()
    const d = featureFlagSchema.parse(await req.json())
    const data: Record<string, unknown> = {}
    if (d.enabled !== undefined) data.enabled = d.enabled
    if (d.rolloutPct !== undefined) data.rolloutPct = d.rolloutPct
    if (d.notes !== undefined) data.notes = d.notes ?? null
    await prisma.featureFlag.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, action: 'UPDATE', entity: 'FeatureFlag', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.financing')) return forbiddenResponse('Área exclusiva do MASTER.')
  const { id } = await params
  try {
    const existing = await prisma.featureFlag.findUnique({ where: { id }, select: { id: true, key: true } })
    if (!existing || !guardKey(existing.key)) return notFound()
    await prisma.featureFlag.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, action: 'DELETE', entity: 'FeatureFlag', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
