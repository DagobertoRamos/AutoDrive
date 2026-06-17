// =============================================================================
// /api/master/financing/flags — feature flags de F&I (Master, GLOBAL).
// Usa o model global FeatureFlag por convenção de chave `fi_*`.
//   GET  : master.financing — lista as flags fi_*
//   POST : master.financing — cria uma flag fi_*
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createFeatureFlagSchema } from '@/lib/validators/financing'
import { zodErrorResponse } from '@/lib/finance/finance-service'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.financing')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const rows = await prisma.featureFlag.findMany({ where: { key: { startsWith: 'fi_' } }, orderBy: { key: 'asc' } })
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.financing')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const d = createFeatureFlagSchema.parse(await req.json())
    const exists = await prisma.featureFlag.findUnique({ where: { key: d.key }, select: { id: true } })
    if (exists) return NextResponse.json({ success: false, error: 'Já existe uma flag com essa chave.' }, { status: 409 })
    const f = await prisma.featureFlag.create({ data: { key: d.key, name: d.name, enabled: d.enabled, rolloutPct: d.rolloutPct, notes: d.notes ?? null } })
    await createSafeAuditLog({ userId: user.id, action: 'CREATE', entity: 'FeatureFlag', entityId: f.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: f.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
