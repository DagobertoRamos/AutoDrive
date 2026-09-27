// PATCH /api/vehicles/[id]/services/[serviceId] — situação, fornecedor, valores, datas, notas, acompanhamento.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { vehicleGuard } from '@/lib/stock/vehicle-guard'
import { updateVehicleService, type ServicePatch } from '@/lib/stock/vehicle-services'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; serviceId: string }> }) {
  try {
    const { id, serviceId } = await ctx.params
    const g = await vehicleGuard(id, 'write')
    if ('error' in g) return g.error
    const s = await prisma.vehicleService.findFirst({ where: { id: serviceId, vehicleId: id }, select: { id: true } })
    if (!s) return NextResponse.json({ success: false, error: 'Serviço não encontrado.' }, { status: 404 })
    const body = await req.json().catch(() => ({})) as ServicePatch
    const r = await updateVehicleService(serviceId, body, { id: g.user.id, name: g.user.name, role: g.user.role })
    if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
