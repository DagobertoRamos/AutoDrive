import { NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import {
  confirmAttendanceStillActive,
  requestAttendanceFinishFromReminder,
  sendAttendanceReminderNow,
} from '@/lib/seller-queue/reminders'

type Ctx = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  action: z.enum(['still-active', 'finish-requested', 'send-now']),
})

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const { id } = await params

  try {
    const body = bodySchema.parse(await req.json())
    const att = await prisma.sellerQueueAttendance.findUnique({ where: { id }, select: { tenantId: true, sellerId: true } })
    if (!att) return NextResponse.json({ success: false, error: 'Atendimento não encontrado.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, att.tenantId)) return forbiddenResponse('Atendimento de outra loja.')
    const isManager = canAccessModule(user.role, 'sellerQueue.lead')
    if (body.action === 'send-now') {
      if (!isManager) return forbiddenResponse('Apenas a gestão pode enviar lembrete manual.')
      const data = await sendAttendanceReminderNow(id, { tenantId, actorId: user.id, manual: true })
      return NextResponse.json({ success: data.sent, data, error: data.error }, { status: data.sent ? 200 : 404 })
    }
    if (att.sellerId !== user.id && !isManager) return forbiddenResponse('Apenas o vendedor do atendimento ou a gestão pode responder.')
    const data = body.action === 'still-active'
      ? await confirmAttendanceStillActive(id, { tenantId, actorId: user.id, userName: user.name, userRole: user.role })
      : await requestAttendanceFinishFromReminder(id, { tenantId, actorId: user.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: data.ok, data, error: data.error }, { status: data.ok ? 200 : 404 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
