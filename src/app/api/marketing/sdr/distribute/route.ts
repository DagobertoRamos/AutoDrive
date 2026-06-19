// =============================================================================
// POST /api/marketing/sdr/distribute — roda a distribuição automática agora.
// Distribui os leads pendentes (conforme a política ativa) e processa os SLAs
// estourados (devolve à fila e redistribui). Gate: marketing.leads.distribute.
// Tenant-scoped (loja ativa p/ MASTER). Sob demanda — não exige cron.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { distributePendingLeads, processSlaBreaches } from '@/lib/marketing/distribution'

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.leads.distribute')) return forbiddenResponse('Sem permissão para distribuir leads.')
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))
  try {
    const sla = await processSlaBreaches(tid)
    const dist = await distributePendingLeads(tid)
    await createSafeAuditLog({ userId: user.id, tenantId: tid, action: 'DISTRIBUTE', entity: 'MarketingLead', entityId: 'batch', userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, distribution: dist, sla })
  } catch (err) {
    return handlePrismaError(err)
  }
}
