// =============================================================================
// GET /api/operations/list?view=renave|fiscal|transfer|queries&filter=&q=
// GET /api/operations/list?view=dashboard
// Menu Operações: listas da loja com a próxima ação. Gestão (ops.panel).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { resolveActingTenant } from '@/lib/acting-tenant'
import { opsPermissions } from '@/lib/automotive/access'
import { opsDashboard, opsList, type ListView } from '@/lib/automotive/lists'
import { opsError, opsSession, requireOps } from '@/lib/automotive/route-helpers'
import { activeConnection } from '@/lib/automotive/connections'
import { opsContext } from '@/lib/automotive/config'
import { providerEntry } from '@/lib/automotive/providers-catalog'

export const dynamic = 'force-dynamic'
const VIEWS = new Set<ListView>(['renave', 'fiscal', 'transfer', 'queries'])

export async function GET(req: NextRequest) {
  try {
    const s = await opsSession()
    if (s instanceof NextResponse) return s
    const d = await requireOps(s, 'ops.panel'); if (d) return d
    const tenantId = s.tenantId ?? await resolveActingTenant(s.user, req)
    if (!tenantId) return NextResponse.json({ success: false, error: 'Escolha a loja no topo da tela.' }, { status: 400 })
    const sp = req.nextUrl.searchParams
    const view = sp.get('view') ?? 'dashboard'
    const permissions = await opsPermissions(s.user)
    if (view === 'dashboard') return NextResponse.json({ success: true, data: { ...(await opsDashboard(tenantId)), permissions } })
    if (!VIEWS.has(view as ListView)) return NextResponse.json({ success: false, error: 'Lista inválida.' }, { status: 400 })
    const rows = await opsList(tenantId, view as ListView, String(sp.get('filter') ?? ''), String(sp.get('q') ?? '').slice(0, 60))
    const [fiscalConn, ctx] = await Promise.all([activeConnection(tenantId, 'FISCAL'), opsContext(tenantId)])
    return NextResponse.json({ success: true, data: { rows, permissions, fiscalMode: providerEntry('FISCAL', fiscalConn.providerId)?.mode === 'API' ? 'API' : 'MANUAL', inspectionRequired: ctx.caps['transfer.inspectionRequired'] } })
  } catch (err) {
    return opsError(err)
  }
}
