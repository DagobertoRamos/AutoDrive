// =============================================================================
// /api/finance/center/period-close — fechamento de período (lib/finance/period-lock).
//   GET  : finance → { closedUntil, history, canClose }
//   POST : finance.period (ADM/MASTER ou liberado) → { closedUntil: 'YYYY-MM-DD' | null, reason? }
// =============================================================================

import { NextResponse } from 'next/server'
import { financeCan, financeGuard } from '@/lib/finance/access'
import { getClosedUntil, periodHistory, setClosedUntil } from '@/lib/finance/period-lock'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const [closedUntil, history] = await Promise.all([getClosedUntil(g.tenantId), periodHistory(g.tenantId)])
  return NextResponse.json({ success: true, data: { closedUntil, history, canClose: await financeCan(g.user, 'finance.period') } })
}

export async function POST(req: Request) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  if (!(await financeCan(g.user, 'finance.period'))) return NextResponse.json({ success: false, error: 'Sem permissão para fechar ou reabrir o período.' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { closedUntil?: string | null; reason?: string | null }
  const err = await setClosedUntil(g.tenantId, b.closedUntil || null, { id: g.user.id, name: g.user.name, role: g.user.role }, b.reason ?? null)
  if (err) return NextResponse.json({ success: false, error: err }, { status: 400 })
  return NextResponse.json({ success: true })
}
