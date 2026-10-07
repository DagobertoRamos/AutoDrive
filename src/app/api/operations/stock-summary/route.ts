// GET /api/operations/stock-summary[?detail=1]
// Indicadores críticos do estoque (RENAVE ok, pendentes, divergência, NF-e
// pendente) e, com detail=1, a lista para o relatório de conformidade.
import { NextRequest, NextResponse } from 'next/server'
import { resolveActingTenant } from '@/lib/acting-tenant'
import { canAccessModule } from '@/lib/permissions'
import { stockSummary } from '@/lib/automotive/jobs'
import { opsError, opsSession, requireOps } from '@/lib/automotive/route-helpers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const s = await opsSession()
    if (s instanceof NextResponse) return s
    if (!canAccessModule(s.user.role, 'stock')) return NextResponse.json({ success: false, error: 'Sem permissão.' }, { status: 403 })
    const d = await requireOps(s, 'ops.renave.view'); if (d) return d
    const tenantId = s.tenantId ?? await resolveActingTenant(s.user, req)
    if (!tenantId) return NextResponse.json({ success: true, data: null })
    const r = await stockSummary(tenantId)
    const detail = req.nextUrl.searchParams.get('detail') === '1'
    return NextResponse.json({ success: true, data: { indicators: r.indicators, tracking: r.tracking, ...(detail ? { issues: r.issues.slice(0, 500) } : {}) } })
  } catch (err) {
    return opsError(err)
  }
}
