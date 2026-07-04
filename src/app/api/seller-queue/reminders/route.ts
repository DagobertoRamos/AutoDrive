import { NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { unitFromRequest } from '@/lib/seller-queue/queue'
import { getReminderDashboard, sendQueueAlert } from '@/lib/seller-queue/reminders'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'

const alertSchema = z.object({
  action: z.literal('send-queue-alert'),
  message: z.string().trim().min(3, 'Informe a mensagem.').max(240),
  reason: z.string().trim().min(2, 'Informe o motivo.').max(240).optional(),
  scope: z.enum(['CURRENT_SELLER', 'CALLED_SELLER', 'ALL_ACTIVE_PARTICIPANTS', 'MANAGERS', 'MANAGERS_AND_CURRENT', 'ALL_QUEUE']),
})

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })

  try {
    const data = await getReminderDashboard({ tenantId, unitId, userId: user.id })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'queue.send_alert_all')) return forbiddenResponse('Sem permissão para enviar alertas da fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.lead'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=).' }, { status: 400 })

  try {
    const body = alertSchema.parse(await req.json())
    const data = await sendQueueAlert({ tenantId, unitId, actorId: user.id, scope: body.scope, message: body.message, reason: body.reason ?? null })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
