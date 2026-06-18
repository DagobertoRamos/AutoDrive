// =============================================================================
// /api/marketing/telephony/numbers/[id] — editar número/ramal.
// PATCH : marketing.telephony.manage. Tenant-scoped, auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { updateNumberSchema } from '@/lib/validators/telephony'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Número não encontrado.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.telephony.manage')) return forbiddenResponse('Sem permissão.')
  const { id } = await params
  try {
    const existing = await prisma.telephonyNumber.findUnique({ where: { id } })
    if (!existing) return notFound()
    if (!ownsTenant(user.role, user.tenantId, existing.tenantId)) return forbiddenResponse('Número de outro tenant.')
    const d = updateNumberSchema.parse(await req.json())
    if (d.connectionId) {
      const conn = await prisma.telephonyTenantConnection.findFirst({ where: { id: d.connectionId, tenantId: existing.tenantId }, select: { id: true } })
      if (!conn) return NextResponse.json({ success: false, error: 'Conexão inválida para esta loja.' }, { status: 400 })
    }
    const data: Record<string, unknown> = {}
    if (d.number !== undefined) data.number = d.number
    if (d.connectionId !== undefined) data.connectionId = d.connectionId ?? null
    if (d.label !== undefined) data.label = d.label ?? null
    if (d.extension !== undefined) data.extension = d.extension ?? null
    if (d.unitId !== undefined) data.unitId = d.unitId ?? null
    if (d.source !== undefined) data.source = d.source ?? null
    if (d.inbound !== undefined) data.inbound = d.inbound
    if (d.outbound !== undefined) data.outbound = d.outbound
    if (d.active !== undefined) data.active = d.active
    await prisma.telephonyNumber.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, tenantId: existing.tenantId, action: 'UPDATE', entity: 'TelephonyNumber', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
