// =============================================================================
// /api/marketing/sdr/leads — leads da Mesa SDR (loja).
//   GET  : marketing.sdr — lista leads do tenant (filtros ?status= &unassigned=)
//   POST : marketing.sdr — cria lead manual (NEW). Origem registrada em source.
// Tenant-scoped, auditado. (Fase 3.)
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/marketing/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { createLeadSchema } from '@/lib/validators/marketing'
import type { LeadStatus, Prisma } from '@prisma/client'

const STATUSES: LeadStatus[] = ['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'CONVERTED', 'LOST', 'DISCARDED', 'RECYCLED']

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.sdr')) return forbiddenResponse('Sem acesso à Mesa SDR.')
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  const sp = new URL(req.url).searchParams
  const statusParam = sp.get('status')
  const unassigned = sp.get('unassigned') === 'true'
  const where: Prisma.MarketingLeadWhereInput = { tenantId: tid }
  if (statusParam && (STATUSES as string[]).includes(statusParam)) where.status = statusParam as LeadStatus
  if (unassigned) where.assignedToUserId = null
  try {
    const rows = await prisma.marketingLead.findMany({
      where, orderBy: [{ createdAt: 'desc' }], take: 500,
    })
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.sdr')) return forbiddenResponse('Sem acesso à Mesa SDR.')
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  try {
    const d = createLeadSchema.parse(await req.json())
    const lead = await prisma.marketingLead.create({
      data: {
        tenantId: tid, status: 'NEW',
        name: d.name ?? null, phone: d.phone ?? null, email: d.email ?? null,
        source: d.source ?? 'manual', unitId: d.unitId ?? null, teamId: d.teamId ?? null,
        customerId: d.customerId ?? null, vehicleId: d.vehicleId ?? null, notes: d.notes ?? null,
        createdById: user.id,
      },
    })
    await createSafeAuditLog({ userId: user.id, tenantId: tid, action: 'CREATE', entity: 'MarketingLead', entityId: lead.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: lead.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
