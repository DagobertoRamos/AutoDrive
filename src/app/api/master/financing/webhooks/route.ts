// =============================================================================
// /api/master/financing/webhooks — eventos de webhook recebidos (Master).
// MASTER-only (master.financing). Read-only; não expõe o payload bruto (pode
// conter dados sensíveis) — só metadados de roteamento/processamento.
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
    const [events, total, pending] = await Promise.all([
      prisma.financeWebhookEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, provider: true, externalId: true, signatureValid: true, processed: true, error: true, createdAt: true } }),
      prisma.financeWebhookEvent.count(),
      prisma.financeWebhookEvent.count({ where: { processed: false } }),
    ])
    return NextResponse.json({
      success: true,
      enabled: !!process.env.FINANCE_WEBHOOK_SECRET && (process.env.FINANCE_WEBHOOK_SECRET?.trim().length ?? 0) >= 8,
      summary: { total, pending },
      data: events,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
