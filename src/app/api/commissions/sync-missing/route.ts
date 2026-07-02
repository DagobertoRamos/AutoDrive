// =============================================================================
// POST /api/commissions/sync-missing
// Sincroniza comissões faltantes para negociações já elegíveis do tenant.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { syncMissingCommissionsForTenant } from '@/lib/commission/sync'

export const dynamic = 'force-dynamic'

const ALLOWED = new Set(['MASTER', 'ADM', 'GERENTE_GERAL'])

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!ALLOWED.has(session.user.role) || !canAccessModule(session.user.role, 'commissions.calculate')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }
    { const gate = await assertModuleEnabled(session.user, 'commissions.calculate'); if (gate) return gate }

    const body = await req.json().catch(() => ({}))
    const tenantId = session.user.role === 'MASTER'
      ? String(body?.tenantId ?? session.user.tenantId ?? '')
      : String(session.user.tenantId ?? '')

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant é obrigatório para sincronizar comissões.' }, { status: 400 })
    }

    const result = await syncMissingCommissionsForTenant({
      tenantId,
      triggeredBy: session.user.id,
      dealId: body?.dealId ? String(body.dealId) : null,
      limit: body?.limit != null ? Number(body.limit) : 100,
      dryRun: body?.dryRun === true,
    })

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    console.error('[POST /api/commissions/sync-missing]', err)
    return NextResponse.json({ success: false, error: 'Erro ao sincronizar comissões.' }, { status: 500 })
  }
}
