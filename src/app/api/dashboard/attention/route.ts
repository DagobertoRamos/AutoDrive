// =============================================================================
// GET /api/dashboard/attention — "Precisa da sua atenção" + gargalos (SLA).
// Uma chamada só para o topo de qualquer dashboard. Tudo calculado no
// servidor, no escopo e com as permissões EFETIVAS do colaborador.
// =============================================================================

import { NextResponse } from 'next/server'
import { canAccessModule } from '@/lib/permissions'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { handlePrismaError } from '@/lib/prisma-errors'
import { resolveDashboardContext } from '@/lib/dashboard/context'
import { buildAttention } from '@/lib/dashboard/attention'
import { attentionHeadline } from '@/lib/dashboard/attention-core'
import { computeInsights } from '@/lib/dashboard/insights'
import { biggestBottleneck } from '@/lib/dashboard/insights-core'
import { computeTeamCoaching } from '@/lib/dashboard/team'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'dashboard')) return forbiddenResponse('Sem acesso ao dashboard.')
  { const gate = await assertModuleEnabled(user, 'dashboard'); if (gate) return gate }

  try {
    const { ctx } = await resolveDashboardContext(user)
    const [attention, insights, team] = await Promise.all([
      buildAttention(ctx),
      computeInsights(ctx).catch((err) => {
        console.error('[dashboard/attention] gargalos falharam:', err)
        return []
      }),
      computeTeamCoaching(ctx).catch((err) => {
        console.error('[dashboard/attention] equipe falhou:', err)
        return []
      }),
    ])
    const bottleneck = biggestBottleneck(insights)
    return NextResponse.json({
      success: true,
      data: {
        headline: attentionHeadline(attention),
        attention,
        insights,
        team,
        bottleneck: bottleneck ? { id: bottleneck.id, message: bottleneck.message, href: bottleneck.href } : null,
        generatedAt: new Date().toISOString(),
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
