// =============================================================================
// PATCH  /api/negotiations/[id]/services/[serviceId] — Editar serviço
// DELETE /api/negotiations/[id]/services/[serviceId] — Remover serviço
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createDealAudit } from '@/lib/negotiation-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { syncDealFinanceSafe } from '@/lib/finance/deal-finance-sync'
import { resolveServiceKind, resolveServiceSupplier } from '../_shared'

type Params = { id: string; serviceId: string }

export async function PATCH(
  req: NextRequest,
  ctxArg: { params: Params | Promise<Params> }) {
  const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations.manage')
    { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }
  } catch {
    return NextResponse.json({ error: 'Sem permissão para editar serviços' }, { status: 403 })
  }

  let body: { name?: string; value?: number; cost?: number | null; supplier?: string | null; supplierId?: string | null; kind?: string | null; commission?: number | null; notes?: string | null } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const deal = await prisma.deal.findFirst({
    where: await buildNegotiationAccessWhere(session.user, { id: params.id }),
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  const service = await prisma.dealService.findUnique({ where: { id: params.serviceId } })
  if (!service || service.dealId !== params.id) {
    return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 })
  }

  const name = body.name !== undefined ? String(body.name ?? '').trim() : service.name
  if (!name) return NextResponse.json({ error: 'Nome do serviço é obrigatório' }, { status: 400 })
  const value = body.value !== undefined ? Number(body.value) : Number(service.value)
  if (!(value > 0)) return NextResponse.json({ error: 'Valor do serviço deve ser maior que zero' }, { status: 400 })

  let supplierId = service.supplierId
  let supplierName = service.supplier
  if (body.supplierId !== undefined) {
    const sup = await resolveServiceSupplier(body.supplierId, deal.tenantId)
    if (!sup.ok) return NextResponse.json({ error: sup.error }, { status: 400 })
    supplierId = sup.supplierId
    supplierName = sup.name ?? (body.supplier !== undefined ? (body.supplier?.trim() || null) : null)
  } else if (body.supplier !== undefined) {
    supplierName = body.supplier?.trim() || null
  }
  const kind = body.kind !== undefined ? resolveServiceKind(body.kind, name, supplierName) : service.kind ?? resolveServiceKind(null, name, supplierName)
  const optNum = (v: number | null | undefined) => (v === undefined ? undefined : v == null ? null : Number(v))

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.dealService.update({
        where: { id: params.serviceId },
        data: {
          name, value, kind, supplierId, supplier: supplierName,
          cost:       optNum(body.cost),
          commission: optNum(body.commission),
          notes:      body.notes !== undefined ? (body.notes?.trim() || null) : service.notes,
        },
      })
      const allServices = await tx.dealService.findMany({ where: { dealId: params.id }, select: { value: true } })
      const servicesAmount = allServices.reduce((sum, s) => sum + Number(s.value), 0)
      const updatedDeal = await tx.deal.update({ where: { id: params.id }, data: { servicesAmount } })
      await createDealAudit(tx as unknown as any, {
        dealId:   params.id,
        tenantId: deal.tenantId,
        unitId:   deal.unitId,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'EDITAR_SERVICO',
        field:    'services',
        oldValue: { name: service.name, value: service.value, cost: service.cost, kind: service.kind, supplier: service.supplier },
        newValue: { name, value, cost: updated.cost, kind, supplier: supplierName },
        reason:   `Serviço editado: ${name}`,
      })
      return { service: updated, deal: updatedDeal }
    })

    await syncDealFinanceSafe(params.id)
    return NextResponse.json({ data: result })
  } catch (err) {
    return handlePrismaError(err)
  }
}

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

  const deal = await prisma.deal.findFirst({
    where: await buildNegotiationAccessWhere(session.user, { id: params.id }),
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

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

    await syncDealFinanceSafe(params.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
