// =============================================================================
// GET /api/finance/center/reports — relatórios gerenciais (Centro Financeiro).
//   ?view=resultado-centros (alias antigo: centro-custo)|servicos|receitas-fi|
//         despesas-categoria|fornecedores|lucratividade-veiculo|
//         lucratividade-vendedor|lucratividade-unidade|comparativo-mensal|
//         orcado-realizado|aging
//   &from=YYYY-MM&to=YYYY-MM &regime=competencia|caixa
//   &costCenterId= (id | 'none') &unitId= &sellerId=
//   &center= (id | 'none') — resultado-centros: detalhe de uma área
// =============================================================================

import { NextResponse } from 'next/server'
import { financeGuard, hasFinanceAccess } from '@/lib/finance/access'
import { ensureFinanceSetup } from '@/lib/finance/setup'
import { getReport, isReportView } from '@/lib/finance/reports'
import { resolveRange } from '@/lib/finance/reports-core'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const sp = new URL(req.url).searchParams
  const view = sp.get('view')
  if (!isReportView(view)) return NextResponse.json({ success: false, error: 'Relatório inválido.' }, { status: 400 })
  try {
    await ensureFinanceSetup(g.tenantId)
    const now = new Date()
    // Sem intervalo: mês atual (a página sempre envia o intervalo escolhido).
    const { periods } = resolveRange(sp.get('from'), sp.get('to'), now, 0)
    const data = await getReport({
      tenantId: g.tenantId, view, periods,
      regime: sp.get('regime') === 'caixa' ? 'caixa' : 'competencia',
      costCenterId: sp.get('costCenterId') || null, unitId: sp.get('unitId') || null, sellerId: sp.get('sellerId') || null,
      center: sp.get('center') || null,
      canSeePayroll: await hasFinanceAccess({ ...g.user, tenantId: g.tenantId }, 'finance.payroll'),
      now,
    })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[finance/center/reports]', err)
    return NextResponse.json({ success: false, error: 'Erro ao gerar o relatório.' }, { status: 500 })
  }
}
