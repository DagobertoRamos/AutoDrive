// =============================================================================
// /api/vehicles/[id]/services — serviços de preparação do veículo.
//   GET  → serviços (com fornecedor e acompanhamento) + resumo + fornecedores ativos
//          (na 1ª vez traz os serviços apontados na avaliação)
//   POST { description, serviceType?, estimatedCost?, supplierId?, dueAt?, notes? }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { vehicleGuard } from '@/lib/stock/vehicle-guard'
import { importEvaluationServices } from '@/lib/stock/vehicle-services'
import { servicesSummary } from '@/lib/stock/prep-core'
import { syncIntake } from '@/lib/stock/intake'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const g = await vehicleGuard(id, 'read')
    if ('error' in g) return g.error
    if (!(await prisma.vehicleService.count({ where: { vehicleId: id } }))) {
      await importEvaluationServices(id, { id: g.user.id, name: g.user.name, role: g.user.role })
      await syncIntake(id, { id: g.user.id, name: g.user.name, role: g.user.role })
    }
    const [services, suppliers] = await Promise.all([
      prisma.vehicleService.findMany({
        where:   { vehicleId: id },
        orderBy: [{ createdAt: 'asc' }],
        include: { supplier: { select: { id: true, name: true, kind: true, whatsapp: true, phone: true } }, events: { orderBy: { createdAt: 'desc' }, take: 30 } },
      }),
      prisma.supplier.findMany({ where: { tenantId: g.vehicle.tenantId ?? '', active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, kind: true } }),
    ])
    const data = services.map((s) => ({ ...s, estimatedCost: s.estimatedCost == null ? null : Number(s.estimatedCost), actualCost: s.actualCost == null ? null : Number(s.actualCost) }))
    return NextResponse.json({ success: true, data: { services: data, summary: servicesSummary(data), suppliers } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const g = await vehicleGuard(id, 'write')
    if ('error' in g) return g.error
    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const description = String(b.description ?? '').trim().slice(0, 200)
    if (!description) return NextResponse.json({ success: false, error: 'Descreva o serviço.' }, { status: 400 })
    const est = b.estimatedCost == null || b.estimatedCost === '' ? null : Number(b.estimatedCost)
    if (est != null && (!Number.isFinite(est) || est < 0)) return NextResponse.json({ success: false, error: 'Valor inválido.' }, { status: 400 })
    const supplierId = typeof b.supplierId === 'string' && b.supplierId ? b.supplierId : null
    if (supplierId && !(await prisma.supplier.findFirst({ where: { id: supplierId, tenantId: g.vehicle.tenantId ?? '' }, select: { id: true } }))) {
      return NextResponse.json({ success: false, error: 'Fornecedor não encontrado.' }, { status: 400 })
    }
    const dueAt = typeof b.dueAt === 'string' && !isNaN(Date.parse(b.dueAt)) ? new Date(b.dueAt) : null
    const s = await prisma.vehicleService.create({
      data: {
        tenantId: g.vehicle.tenantId, vehicleId: id, description, serviceType: String(b.serviceType ?? 'OUTRO').slice(0, 40),
        estimatedCost: est, supplierId, dueAt, notes: String(b.notes ?? '').trim().slice(0, 2000) || null, createdById: g.user.id,
      },
    })
    await prisma.vehicleServiceEvent.create({ data: { serviceId: s.id, type: 'CRIADO', toValue: 'Aguardando serviço', userId: g.user.id, userName: g.user.name ?? null } })
    // Carro que já tinha concluído a preparação volta para serviços.
    await syncIntake(id, { id: g.user.id, name: g.user.name, role: g.user.role })
    return NextResponse.json({ success: true, data: s }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
