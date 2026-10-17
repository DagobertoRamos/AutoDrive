// =============================================================================
// /api/evaluations/pricing-settings — margem do preço sugerido da loja.
//   GET : quem avalia (stock.evaluate) ou configura → { marginPct }
//   PUT : gerente+ (stock.evaluate.config) → { marginPct }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, assertTenantId, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { loadPricingSettings, savePricingSettings } from '@/lib/evaluation/pricing-settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const canConfig = canAccessModule(user.role, 'stock.evaluate.config')
  if (!canConfig && !canAccessModule(user.role, 'stock.evaluate')) return forbiddenResponse()
  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    return NextResponse.json({ success: true, data: { ...(await loadPricingSettings(tenantId)), canEdit: canConfig } })
  } catch (err) { return handlePrismaError(err) }
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.evaluate.config')) return forbiddenResponse('Só gerente ou acima altera a margem.')
  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    if (!tenantId) return NextResponse.json({ success: false, error: 'Entre na loja para configurar.' }, { status: 400 })
    const body = await req.json().catch(() => ({})) as { marginPct?: unknown }
    const r = await savePricingSettings(tenantId, body, { id: user.id, name: user.name ?? null, role: user.role })
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
    return NextResponse.json({ success: true, data: r.data })
  } catch (err) { return handlePrismaError(err) }
}
