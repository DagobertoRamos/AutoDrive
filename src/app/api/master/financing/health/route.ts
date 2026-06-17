// =============================================================================
// /api/master/financing/health — saúde das integrações F&I (Master). Read-only.
// Agrega logs técnicos (OK/ERROR), webhooks (total/pendentes), provedores ativos
// e últimos erros. MASTER-only.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.financing')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const [byStatus, logsTotal, webhookTotal, webhookPending, providersTotal, providersActive, recentErrors, lastLog] = await Promise.all([
      prisma.financeIntegrationLog.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.financeIntegrationLog.count(),
      prisma.financeWebhookEvent.count(),
      prisma.financeWebhookEvent.count({ where: { processed: false } }),
      prisma.financeProvider.count(),
      prisma.financeProvider.count({ where: { active: true } }),
      prisma.financeIntegrationLog.findMany({ where: { status: 'ERROR' }, orderBy: { createdAt: 'desc' }, take: 8, select: { id: true, action: true, message: true, createdAt: true } }),
      prisma.financeIntegrationLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ])
    const counts = Object.fromEntries(byStatus.map((g) => [g.status ?? 'SEM_STATUS', g._count._all]))
    const ok = counts['OK'] ?? 0
    const err = counts['ERROR'] ?? 0
    return NextResponse.json({
      success: true,
      data: {
        logs: { total: logsTotal, ok, error: err, errorRate: (ok + err) > 0 ? Math.round((err / (ok + err)) * 100) : 0 },
        webhooks: { total: webhookTotal, pending: webhookPending },
        providers: { total: providersTotal, active: providersActive },
        lastActivity: lastLog?.createdAt ?? null,
        recentErrors,
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
