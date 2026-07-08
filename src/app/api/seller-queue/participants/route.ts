// =============================================================================
// /api/seller-queue/participants — Participação dos colaboradores na fila (GESTÃO).
//   GET : { defaults, participants } (flags por colaborador do JSON de config).
//   PUT : { sellerId, flags } salva as flags de um colaborador.
// Gate: queue.sellers.manage. Tenant/unit-scoped e auditado. Sem migration
// (guardado em SellerQueueUnitConfig.config.participants).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { unitFromRequest, getUnitConfig } from '@/lib/seller-queue/queue'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { PARTICIPANT_DEFAULTS, getParticipantsMap, coerceFlags } from '@/lib/seller-queue/participants'

export const dynamic = 'force-dynamic'

async function guard(req: Request) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() }
  if (!await canAccessModuleForUser(user, 'queue.sellers.manage')) return { error: forbiddenResponse('Sem permissão para gerir a participação na fila.') }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return { error: forbiddenResponse(actingTenantError(user)) }
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return { error: NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=) ou tenha unidade vinculada.' }, { status: 400 }) }
  return { user, tenantId, unitId }
}

export async function GET(req: Request) {
  const g = await guard(req)
  if ('error' in g) return g.error
  const { tenantId, unitId } = g
  try {
    const cfg = await getUnitConfig(tenantId, unitId)
    return NextResponse.json({ success: true, data: { defaults: PARTICIPANT_DEFAULTS, participants: getParticipantsMap(cfg?.config) } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: Request) {
  const g = await guard(req)
  if ('error' in g) return g.error
  const { user, tenantId, unitId } = g
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const sellerId = String(body.sellerId ?? '').trim()
    if (!sellerId) return NextResponse.json({ success: false, error: 'Informe o colaborador.' }, { status: 400 })
    const flags = coerceFlags(body.flags)

    const seller = await prisma.user.findFirst({ where: { id: sellerId, tenantId }, select: { id: true } })
    if (!seller) return NextResponse.json({ success: false, error: 'Colaborador não encontrado nesta empresa.' }, { status: 404 })

    const existing = await prisma.sellerQueueUnitConfig.findUnique({ where: { tenantId_unitId: { tenantId, unitId } }, select: { config: true } })
    const participants = getParticipantsMap(existing?.config)
    participants[sellerId] = { ...(participants[sellerId] ?? {}), ...flags }
    const mergedConfig = { ...((existing?.config as Record<string, unknown>) ?? {}), participants }
    await prisma.sellerQueueUnitConfig.upsert({
      where: { tenantId_unitId: { tenantId, unitId } },
      update: { config: mergedConfig, updatedById: user.id },
      create: { tenantId, unitId, config: mergedConfig, updatedById: user.id },
    })

    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'SellerQueueParticipant', entityId: sellerId, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { sellerId, flags: participants[sellerId] } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
