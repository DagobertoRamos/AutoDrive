// =============================================================================
// /api/negotiations/[id]/warranty-sales/[saleId] — Cancelar venda de garantia
// Marca a venda como CANCELADA e recalcula as comissões PREVISTAS.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createDealAudit } from '@/lib/negotiation-service'
import { recalculateNegotiationCommissions } from '@/lib/commission-generator'
import { syncTenantFinance } from '@/lib/finance/finance-sync'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string; saleId: string }> }

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    requireModule(session.user.role, 'negotiations')
    { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  const { id, saleId } = await params

  try {
    const sale = await prisma.warrantySale.findUnique({
      where: { id: saleId },
      include: { deal: { select: { id: true, tenantId: true, unitId: true } } },
    })
    if (!sale || sale.dealId !== id) {
      return NextResponse.json({ error: 'Venda de garantia não encontrada' }, { status: 404 })
    }
    if (session.user.tenantId && sale.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.warrantySale.update({ where: { id: saleId }, data: { status: 'CANCELADA' } })
      await createDealAudit(tx as never, {
        dealId:   id,
        tenantId: sale.tenantId,
        unitId:   sale.deal.unitId,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'CANCELAR_GARANTIA',
        field:    'warrantySale',
        oldValue: { id: saleId, status: 'ATIVA' },
        newValue: { id: saleId, status: 'CANCELADA' },
        reason:   'Venda de garantia cancelada',
      })
    })

    await recalculateNegotiationCommissions({
      dealId:      id,
      tenantId:    sale.tenantId,
      triggeredBy: session.user.id,
    }).catch(() => {})
    await syncTenantFinance(sale.tenantId ?? null).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
