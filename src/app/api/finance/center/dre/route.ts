// =============================================================================
// GET /api/finance/center/dre — DRE gerencial (Centro Financeiro).
//   ?from=YYYY-MM&to=YYYY-MM (padrão: últimos 6 meses + o atual; máx. 36)
//   &regime=competencia|caixa &costCenterId= (id | 'none') &unitId=
// =============================================================================

import { NextResponse } from 'next/server'
import { financeGuard } from '@/lib/finance/access'
import { ensureFinanceSetup } from '@/lib/finance/setup'
import { getDre } from '@/lib/finance/dre'
import { resolveRange } from '@/lib/finance/reports-core'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  try {
    await ensureFinanceSetup(g.tenantId)
    const sp = new URL(req.url).searchParams
    const { periods } = resolveRange(sp.get('from'), sp.get('to'), new Date())
    const regime = sp.get('regime') === 'caixa' ? 'caixa' : 'competencia'
    const data = await getDre({
      tenantId: g.tenantId, periods, regime,
      costCenterId: sp.get('costCenterId') || null, unitId: sp.get('unitId') || null,
    })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[finance/center/dre]', err)
    return NextResponse.json({ success: false, error: 'Erro ao montar a DRE.' }, { status: 500 })
  }
}
