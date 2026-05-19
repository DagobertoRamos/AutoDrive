// =============================================================================
// POST /api/negotiations/[id]/services — Adicionar serviço à negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createDealAudit } from '@/lib/negotiation-service'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: { name?: string; value?: number; cost?: number; supplier?: string; commission?: number; notes?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Nome do serviço é obrigatório' }, { status: 400 })
  }
  if (!body.value || Number(body.value) <= 0) {
    return NextResponse.json({ error: 'Valor do serviço deve ser maior que zero' }, { status: 400 })
  }

  const deal = await prisma.deal.findUnique({ where: { id: params.id } })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const service = await (tx.dealService as any).create({
        data: {
          dealId:     params.id,
          name:       body.name,
          value:      Number(body.value),
          cost:       body.cost       != null ? Number(body.cost)       : null,
          supplier:   body.supplier   ?? null,
          commission: body.commission != null ? Number(body.commission) : null,
          notes:      body.notes      ?? null,
        },
      })

      // Recalcular servicesAmount
      const allServices: any[] = await (tx.dealService as any).findMany({
        where: { dealId: params.id },
        select: { value: true },
      })
      const servicesAmount = allServices.reduce((sum: number, s: any) => sum + Number(s.value), 0)

      const updatedDeal = await tx.deal.update({
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
        action:   'ADICIONAR_SERVICO',
        field:    'servicesAmount',
        oldValue: deal.servicesAmount,
        newValue: servicesAmount,
        reason:   `Serviço adicionado: ${body.name}`,
      })

      return { service, deal: updatedDeal }
    })

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
