// =============================================================================
// POST /api/quality/events/[id]/reverse — estorna um evento de qualidade.
// Pontos POSITIVOS aparecem em verde. Gate: sellerQueue.manage.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModule } from '@/lib/permissions'
import { reverseQualityEvent } from '@/lib/quality/events'
import { handlePrismaError } from '@/lib/prisma-errors'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.manage')) return forbiddenResponse('Sem permissão.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const b = await req.json().catch(() => ({}))
    const reason = String(b?.reason ?? '').trim()
    if (!reason || reason.length < 5) return NextResponse.json({ success: false, error: 'Informe o motivo do estorno (mín. 5 caracteres).' }, { status: 400 })
    const ok = await reverseQualityEvent(id, tenantId, user.id, reason)
    if (!ok) return NextResponse.json({ success: false, error: 'Evento não encontrado ou já estornado.' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) { return handlePrismaError(err) }
}
