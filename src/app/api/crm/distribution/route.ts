// =============================================================================
// CRM — resumo da distribuição (aba Distribuição da Central de Configurações).
// Só LEITURA das políticas da Mesa SDR (que continuam sendo editadas em
// /marketing/sdr/politicas) + membros aptos, para o gestor do CRM enxergar o
// que acontece com os leads novos. Gate: crm.settings.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.settings.manage')) return forbiddenResponse('Sem permissão para configurar o CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const [policies, members, unassigned] = await Promise.all([
      prisma.marketingLeadDistributionPolicy.findMany({
        where: { tenantId }, orderBy: [{ active: 'desc' }, { priority: 'desc' }, { createdAt: 'asc' }],
        select: { id: true, name: true, mode: true, active: true, priority: true, config: true },
      }),
      prisma.marketingSdrMember.count({ where: { tenantId, active: true } }).catch(() => 0),
      prisma.marketingLead.count({ where: { tenantId, assignedToUserId: null, status: { in: ['NEW', 'RECYCLED'] } } }),
    ])
    return NextResponse.json({
      success: true,
      data: {
        policies: policies.map((p) => {
          const cfg = (p.config && typeof p.config === 'object' ? p.config : {}) as Record<string, unknown>
          return { id: p.id, name: p.name, mode: p.mode, active: p.active, priority: p.priority, slaSeconds: Number(cfg.slaSeconds) || null }
        }),
        activeMembers: members,
        unassignedLeads: unassigned,
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
