// =============================================================================
// POST /api/goals/scan-alerts/run — Dispara a varredura de avisos de meta
// (meta abaixo do esperado → notificação ao responsável).
// MASTER/ADM/GERENTE_GERAL. MASTER sem tenantId varre todos.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerAuthSession } from '@/lib/auth'
import { scanGoalAlertsForTenant, scanAllGoalAlerts } from '@/services/goalAlertScanner'

const schema = z.object({ tenantId: z.string().optional() })

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })

    const role = session.user.role
    if (!['MASTER', 'ADM', 'GERENTE_GERAL'].includes(role)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const body = req.headers.get('content-type')?.includes('application/json')
      ? schema.parse(await req.json())
      : {}

    const isMaster = role === 'MASTER'
    const targetTenantId = body.tenantId ?? (isMaster ? undefined : session.user.tenantId ?? undefined)

    let data: unknown
    if (isMaster && !targetTenantId) {
      const results = await scanAllGoalAlerts()
      data = {
        results,
        totalCreated: results.reduce((s, r) => s + r.created, 0),
        totalScanned: results.reduce((s, r) => s + r.scanned, 0),
      }
    } else if (targetTenantId) {
      data = await scanGoalAlertsForTenant(targetTenantId)
    } else {
      return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0]?.message }, { status: 400 })
    }
    console.error('[POST /api/goals/scan-alerts/run]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
