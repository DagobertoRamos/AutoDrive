// =============================================================================
// POST /api/negotiations/[id]/commissions/regenerate
// Re-roda o gerador de comissões para a negociação. Útil quando regras mudam.
// Restrito a MASTER | ADM | GERENTE_GERAL.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import {
  getSessionUser,
  forbiddenResponse,
  unauthorizedResponse,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { generateCommissionsForDeal } from '@/lib/commission-generator'

export const dynamic = 'force-dynamic'

const ALLOWED = new Set(['MASTER', 'ADM', 'GERENTE_GERAL'])

export async function POST(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!ALLOWED.has(user.role)) return forbiddenResponse('Apenas MASTER, ADM ou Gerente Geral podem recalcular comissões.')

  const deal = await prisma.deal.findUnique({
    where:  { id: params.id },
    select: { id: true, tenantId: true },
  })
  if (!deal) return NextResponse.json({ success: false, error: 'Negociação não encontrada' }, { status: 404 })

  if (user.tenantId && deal.tenantId !== user.tenantId) {
    return forbiddenResponse('Acesso negado a esta negociação.')
  }

  try {
    const result = await generateCommissionsForDeal({
      dealId:      params.id,
      tenantId:    deal.tenantId ?? null,
      triggeredBy: user.id,
      dryRun:      false,
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId: user.tenantId ?? null,
      action:   'COMMISSIONS_REGENERATE',
      entity:   'Deal',
      entityId: params.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[commissions/regenerate]', err)
    return NextResponse.json({ success: false, error: 'Falha ao recalcular comissões' }, { status: 500 })
  }
}
