// =============================================================================
// /api/marketing/sdr/policies — políticas de distribuição de leads (loja).
//   GET  : marketing.sdr        — lista políticas do tenant
//   POST : marketing.sdr.manage — cria política (modo + parâmetros em config JSON)
// O MASTER define quais modos/limites a plataforma permite (fase futura); aqui a
// loja configura as próprias políticas. Tenant-scoped, auditado. (Fase 3.)
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/marketing/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { createPolicySchema } from '@/lib/validators/marketing'
import type { Prisma } from '@prisma/client'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.sdr')) return forbiddenResponse('Sem acesso à Mesa SDR.')
  { const gate = await assertModuleEnabled(user, 'marketing.sdr'); if (gate) return gate }
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  try {
    const rows = await prisma.marketingLeadDistributionPolicy.findMany({
      where: { tenantId: tid },
      orderBy: [{ active: 'desc' }, { priority: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.sdr.manage')) return forbiddenResponse('Sem permissão para configurar políticas.')
  { const gate = await assertModuleEnabled(user, 'marketing.sdr.manage'); if (gate) return gate }
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  try {
    const d = createPolicySchema.parse(await req.json())
    const p = await prisma.marketingLeadDistributionPolicy.create({
      data: {
        tenantId: tid, name: d.name, mode: d.mode, active: d.active,
        teamId: d.teamId ?? null, unitId: d.unitId ?? null, priority: d.priority,
        config: (d.config ?? undefined) as Prisma.InputJsonValue | undefined, createdById: user.id,
      },
    })
    await createSafeAuditLog({ userId: user.id, tenantId: tid, action: 'CREATE', entity: 'MarketingLeadDistributionPolicy', entityId: p.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: p.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
