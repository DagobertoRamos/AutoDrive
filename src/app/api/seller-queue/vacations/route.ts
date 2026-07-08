// =============================================================================
// /api/seller-queue/vacations — Férias/Ausências da fila (GESTÃO). Fase 2.
//   GET  : lista as ausências da unidade (com status derivado + nome).
//   POST : cria uma ausência { sellerId, type, startAt, endAt, reason?, autoReturn? }.
// Gate: queue.vacations.manage (gestão). Tenant/unit-scoped e auditado.
// Ao criar uma ausência JÁ em vigor, o colaborador sai da fila de hoje.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { queueDate, unitFromRequest, logQueueEvent } from '@/lib/seller-queue/queue'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { normalizeVacationType, effectiveStatus, vacationInEffect } from '@/lib/seller-queue/vacation'

export const dynamic = 'force-dynamic'

async function guard(req: Request) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() }
  if (!await canAccessModuleForUser(user, 'queue.vacations.manage')) return { error: forbiddenResponse('Sem permissão para gerir férias/ausências.') }
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
    const rows = await prisma.sellerVacation.findMany({
      where: { tenantId, unitId },
      orderBy: [{ startAt: 'desc' }],
      take: 500,
    })
    const sellerIds = [...new Set(rows.map((r) => r.sellerId).concat(rows.map((r) => r.createdById ?? '')))].filter(Boolean)
    const users = sellerIds.length
      ? await prisma.user.findMany({ where: { id: { in: sellerIds }, tenantId }, select: { id: true, name: true } })
      : []
    const nameById = new Map(users.map((u) => [u.id, u.name]))
    const now = new Date()
    const data = rows.map((r) => ({
      id: r.id,
      sellerId: r.sellerId,
      sellerName: nameById.get(r.sellerId) ?? '—',
      type: r.type,
      startAt: r.startAt,
      endAt: r.endAt,
      reason: r.reason,
      autoReturn: r.autoReturn,
      status: effectiveStatus(r, now),
      inEffect: vacationInEffect(r, now),
      createdByName: r.createdById ? (nameById.get(r.createdById) ?? null) : null,
      createdAt: r.createdAt,
    }))
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const g = await guard(req)
  if ('error' in g) return g.error
  const { user, tenantId, unitId } = g
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const sellerId = String(body.sellerId ?? '').trim()
    const type = normalizeVacationType(body.type)
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) || null : null
    const autoReturn = body.autoReturn !== false
    const startAt = body.startAt ? new Date(String(body.startAt)) : null
    const endAt = body.endAt ? new Date(String(body.endAt)) : null

    if (!sellerId) return NextResponse.json({ success: false, error: 'Informe o colaborador.' }, { status: 400 })
    if (!startAt || Number.isNaN(startAt.getTime())) return NextResponse.json({ success: false, error: 'Data inicial inválida.' }, { status: 400 })
    if (!endAt || Number.isNaN(endAt.getTime())) return NextResponse.json({ success: false, error: 'Data final inválida.' }, { status: 400 })
    if (endAt.getTime() <= startAt.getTime()) return NextResponse.json({ success: false, error: 'A data final deve ser depois da inicial.' }, { status: 400 })

    // Colaborador precisa ser da mesma empresa (isolamento multi-tenant).
    const seller = await prisma.user.findFirst({ where: { id: sellerId, tenantId }, select: { id: true, name: true } })
    if (!seller) return NextResponse.json({ success: false, error: 'Colaborador não encontrado nesta empresa.' }, { status: 404 })

    const created = await prisma.sellerVacation.create({
      data: { tenantId, unitId, sellerId, type, startAt, endAt, reason, autoReturn, status: 'PROGRAMADO', createdById: user.id },
    })

    // Se já está em vigor agora, tira o colaborador da fila de hoje.
    if (vacationInEffect(created)) {
      const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } }, select: { id: true } })
      if (queue) {
        const entry = await prisma.sellerQueueEntry.findUnique({ where: { queueId_sellerId: { queueId: queue.id, sellerId } }, select: { id: true, status: true } })
        if (entry && entry.status !== 'LEFT') {
          await prisma.sellerQueueEntry.update({ where: { id: entry.id }, data: { status: 'LEFT', leftAt: new Date() } }).catch(() => {})
          await logQueueEvent({ tenantId, unitId, queueId: queue.id, type: 'CHECK_OUT', sellerId, actorId: user.id, entryId: entry.id, reason: `ausência (${type}) cadastrada pela gestão` })
        }
      }
    }

    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'SellerVacation', entityId: created.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: created.id } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
