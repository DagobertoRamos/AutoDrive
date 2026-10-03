// =============================================================================
// /api/evaluations/repair-prices — tabela de reparos da avaliação da loja.
//   GET  : quem avalia (stock.evaluate) → reparos ativos; gerente+ (?all=1)
//          → tabela completa + histórico de alterações.
//   PUT  : gerente+ (stock.evaluate.config) → { repairs } com log de alterações.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, assertTenantId, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { loadRepairs, repairHistory, saveRepairs } from '@/lib/evaluation/repair-prices'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const canConfig = canAccessModule(user.role, 'stock.evaluate.config')
  if (!canConfig && !canAccessModule(user.role, 'stock.evaluate')) return forbiddenResponse()
  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const repairs = await loadRepairs(tenantId)
    if (canConfig && req.nextUrl.searchParams.get('all') === '1') {
      return NextResponse.json({ success: true, data: { repairs, history: tenantId ? await repairHistory(tenantId) : [], canEdit: true } })
    }
    return NextResponse.json({ success: true, data: { repairs: repairs.filter((r) => r.active), canEdit: canConfig } })
  } catch (err) { return handlePrismaError(err) }
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.evaluate.config')) return forbiddenResponse('Só gerente ou acima altera a tabela de reparos.')
  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    if (!tenantId) return NextResponse.json({ success: false, error: 'Entre na loja para configurar.' }, { status: 400 })
    const body = await req.json().catch(() => ({})) as { repairs?: unknown }
    const r = await saveRepairs(tenantId, body.repairs, { id: user.id, name: user.name ?? null, role: user.role })
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
    return NextResponse.json({ success: true, data: { repairs: r.data, changes: r.changes, history: await repairHistory(tenantId) } })
  } catch (err) { return handlePrismaError(err) }
}
