// =============================================================================
// /api/marketing/sdr/inbox — caixa de leads da Mesa SDR.
//   GET : marketing.sdr — devolve duas listas:
//     - available : leads sem responsável (tanque de tubarão / fila) — elegíveis
//                   p/ assumir (respeitando unidade do agente quando houver).
//     - mine      : leads atribuídos ao usuário atual (em atendimento).
// Tenant-scoped. (Fase 3 — distribuição inteligente/SLA virão depois.)
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/marketing/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import type { Prisma } from '@prisma/client'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'marketing.sdr')) return forbiddenResponse('Sem acesso à Mesa SDR.')
  { const gate = await assertModuleEnabled(user, 'marketing.sdr'); if (gate) return gate }
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))

  // Elegibilidade simples desta fase: leads abertos sem responsável, da mesma
  // unidade do agente (ou sem unidade). Regras finas (presença, carga, SLA,
  // origem, fila) entram na Fase de distribuição inteligente.
  const availableWhere: Prisma.MarketingLeadWhereInput = {
    tenantId: tid,
    assignedToUserId: null,
    claimedByUserId: null,
    status: { in: ['NEW', 'RECYCLED'] },
    ...(user.unitId ? { OR: [{ unitId: user.unitId }, { unitId: null }] } : {}),
  }

  try {
    const [available, mine] = await Promise.all([
      prisma.marketingLead.findMany({ where: availableWhere, orderBy: [{ createdAt: 'asc' }], take: 200 }),
      prisma.marketingLead.findMany({
        where: { tenantId: tid, assignedToUserId: user.id, status: { in: ['ASSIGNED', 'WORKING', 'QUALIFIED'] } },
        orderBy: [{ lastContactAt: 'asc' }, { createdAt: 'asc' }], take: 200,
      }),
    ])
    return NextResponse.json({ success: true, data: { available, mine } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
