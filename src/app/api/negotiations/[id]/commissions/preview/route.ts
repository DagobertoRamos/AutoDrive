// =============================================================================
// POST /api/negotiations/[id]/commissions/preview
// Pré-visualiza o cálculo de comissões para a negociação (dryRun).
// Não persiste nada. Disponível para quem pode ler a negociação.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import {
  getSessionUser,
  forbiddenResponse,
  unauthorizedResponse,
} from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { generateCommissionsForDeal } from '@/lib/commission-generator'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  const deal = await prisma.deal.findFirst({
    where:  await buildNegotiationAccessWhere(user, { id: params.id }),
    select: { id: true, tenantId: true },
  })
  if (!deal) return NextResponse.json({ success: false, error: 'Negociação não encontrada' }, { status: 404 })

  try {
    const result = await generateCommissionsForDeal({
      dealId:      params.id,
      tenantId:    deal.tenantId ?? null,
      triggeredBy: user.id,
      dryRun:      true,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[commissions/preview]', err)
    return NextResponse.json({ success: false, error: 'Falha ao pré-visualizar comissões' }, { status: 500 })
  }
}
