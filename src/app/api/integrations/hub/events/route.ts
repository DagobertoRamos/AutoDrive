// =============================================================================
// GET /api/integrations/hub/events — detalhes técnicos do Gateway de Entrada
// da loja (eventos recebidos, tentativas, erro, corpo MASCARADO). Só para a
// área técnica (Ver detalhes); nunca aparece para o vendedor.
// ?status=DEAD|FAILED|PROCESSED|IGNORED|RECEIVED &kind=LEAD|MESSAGE|EMAIL
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hubGuard } from '@/lib/integrations/hub/guard'
import { maskPayload } from '@/lib/integrations/inbox-core'

export const dynamic = 'force-dynamic'

const STATUSES = ['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED', 'DEAD']
const KINDS = ['LEAD', 'MESSAGE', 'EMAIL']

export async function GET(req: Request) {
  const g = await hubGuard(req)
  if (!g.ok) return g.response
  const sp = new URL(req.url).searchParams
  const status = sp.get('status')
  const kind = sp.get('kind')
  const rows = await prisma.webhookInbox.findMany({
    where: {
      tenantId: g.tenantId, kind: kind && KINDS.includes(kind) ? kind : { not: null },
      ...(status && STATUSES.includes(status) ? { status } : {}),
    },
    orderBy: { receivedAt: 'desc' },
    take: 100,
  })
  const counts = await prisma.webhookInbox.groupBy({ by: ['status'], where: { tenantId: g.tenantId, kind: { not: null }, receivedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, _count: { _all: true } })
  return NextResponse.json({
    success: true,
    data: {
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      items: rows.map((r) => ({
        id: r.id, correlationId: r.correlationId, provider: r.provider, kind: r.kind, status: r.status, attempts: r.attempts,
        error: r.error, receivedAt: r.receivedAt, processedAt: r.processedAt, nextAttemptAt: r.nextAttemptAt, resultRef: r.resultRef,
        payload: r.payload ? maskPayload(r.payload) : null,
      })),
    },
  })
}
