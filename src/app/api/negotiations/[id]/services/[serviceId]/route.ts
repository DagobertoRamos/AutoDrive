// =============================================================================
// DELETE /api/negotiations/[id]/services/[serviceId] — Remover serviço
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createDealAudit } from '@/lib/negotiation-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function DELETE(
  _req: NextRequest,
  ctxArg: { params: { id: string; serviceId: string } | Promise<{ id: string; serviceId: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations.manage')
    { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }
  } catch {
    return NextResponse.json({ error: 'Sem permissão para remover serviços' }, { status: 403 })
  }

  const deal = await prisma.deal.findUnique({ where: { id: params.id } })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const service = await (prisma.dealService as any).findUnique({ where: { id: params.serviceId } })
  if (!service || service.dealId !== params.id) {
    return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 })
  }

  try {
    await prisma.$transaction(async (tx) => {
      await (tx.dealService as any).delete({ where: { id: params.serviceId } })

      const allServices: any[] = await (tx.dealService as any).findMany({
        where: { dealId: params.id },
        select: { value: true },
      })
      const servicesAmount = allServices.reduce((sum: number, s: any) => sum + Number(s.value), 0)

      await tx.deal.update({
        where: { id: params.id },
        data:  { servicesAmount },
      })

      await createDealAudit(tx as unknown as any, {
        dealId:   params.id,
        tenantId: deal.tenantId,
        unitId:   deal.unitId,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'REMOVER_SERVICO',
        field:    'servicesAmount',
        oldValue: deal.servicesAmount,
        newValue: servicesAmount,
        reason:   `Serviço removido: ${service.name}`,
      })
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
