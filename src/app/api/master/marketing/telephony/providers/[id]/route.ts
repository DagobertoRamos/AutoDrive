// =============================================================================
// /api/master/marketing/telephony/providers/[id] — editar/excluir provedor.
// PATCH / DELETE : master.marketing.telephony (MASTER-only). Auditado.
// DELETE bloqueia se houver conexões de loja vinculadas (FK RESTRICT).
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { updateProviderSchema } from '@/lib/validators/telephony'
import type { Prisma } from '@prisma/client'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Provedor não encontrado.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.marketing.telephony')) return forbiddenResponse('Área exclusiva do MASTER.')
  const { id } = await params
  try {
    const existing = await prisma.telephonyProvider.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return notFound()
    const d = updateProviderSchema.parse(await req.json())
    const data: Record<string, unknown> = {}
    if (d.name !== undefined) data.name = d.name
    if (d.kind !== undefined) data.kind = d.kind
    if (d.active !== undefined) data.active = d.active
    if (d.supportsInbound !== undefined) data.supportsInbound = d.supportsInbound
    if (d.supportsOutbound !== undefined) data.supportsOutbound = d.supportsOutbound
    if (d.supportsRecording !== undefined) data.supportsRecording = d.supportsRecording
    if (d.supportsWebhook !== undefined) data.supportsWebhook = d.supportsWebhook
    if (d.baseUrl !== undefined) data.baseUrl = d.baseUrl ?? null
    if (d.apiVersion !== undefined) data.apiVersion = d.apiVersion ?? null
    if (d.notes !== undefined) data.notes = d.notes ?? null
    if (d.fieldMappings !== undefined) data.fieldMappings = (d.fieldMappings ?? undefined) as Prisma.InputJsonValue | undefined
    await prisma.telephonyProvider.update({ where: { id }, data })
    await createSafeAuditLog({ userId: user.id, tenantId: 'MASTER', action: 'UPDATE', entity: 'TelephonyProvider', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.marketing.telephony')) return forbiddenResponse('Área exclusiva do MASTER.')
  const { id } = await params
  try {
    const existing = await prisma.telephonyProvider.findUnique({ where: { id }, include: { _count: { select: { connections: true } } } })
    if (!existing) return notFound()
    if (existing._count.connections > 0) {
      return NextResponse.json({ success: false, error: `Há ${existing._count.connections} conexão(ões) de loja usando este provedor. Inative-o em vez de excluir.` }, { status: 409 })
    }
    await prisma.telephonyProvider.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId: 'MASTER', action: 'DELETE', entity: 'TelephonyProvider', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
