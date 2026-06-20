// =============================================================================
// POST /api/seller-queue/customer-arrivals/:id/call-next — chama o próximo vendedor.
// Gate: sellerQueue.lead (líder/gerente). Usado em timeout/recusa ou para chamar
// um cliente que ficou PENDING. Pode forçar um vendedor (`sellerId`) com
// justificativa (override) — registra LEADER/MANAGER_OVERRIDE. Auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { callNextSchema } from '@/lib/validators/seller-queue'
import { logQueueEvent } from '@/lib/seller-queue/queue'
import { callForArrival } from '@/lib/seller-queue/call'

type Ctx = { params: Promise<{ id: string }> }
const MGMT_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.lead')) return forbiddenResponse('Apenas líder/gerência pode chamar manualmente.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const { id } = await params
  try {
    const arrival = await prisma.sellerQueueCustomerArrival.findUnique({ where: { id } })
    if (!arrival) return NextResponse.json({ success: false, error: 'Registro de cliente não encontrado.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, arrival.tenantId)) return forbiddenResponse('Registro de outra loja.')
    if (['DONE', 'CANCELED'].includes(arrival.status)) return NextResponse.json({ success: false, error: 'Atendimento já encerrado.' }, { status: 409 })

    const d = callNextSchema.parse(await req.json().catch(() => ({})))
    // Forçar um vendedor específico = override (exige sellerQueue.override + justificativa).
    let preferSellerId: string | null = null
    if (d.sellerId) {
      if (!canAccessModule(user.role, 'sellerQueue.override')) return forbiddenResponse('Sem permissão para forçar um vendedor.')
      if (!d.reason?.trim()) return NextResponse.json({ success: false, error: 'Justificativa obrigatória para forçar um vendedor.' }, { status: 400 })
      preferSellerId = d.sellerId
      await logQueueEvent({ tenantId, unitId: arrival.unitId, queueId: arrival.queueId, type: MGMT_ROLES.includes(user.role) ? 'MANAGER_OVERRIDE' : 'LEADER_OVERRIDE', sellerId: d.sellerId, actorId: user.id, arrivalId: arrival.id, reason: d.reason.trim() })
    }

    const call = await callForArrival({ tenantId, unitId: arrival.unitId, queueId: arrival.queueId, arrivalId: arrival.id, actorId: user.id, preferSellerId, reason: d.reason ?? null })
    if (!call.ok) return NextResponse.json({ success: false, error: call.reason ?? 'Não foi possível chamar.', call }, { status: 409 })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CALL_NEXT', entity: 'SellerQueueCustomerArrival', entityId: arrival.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { call } })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
