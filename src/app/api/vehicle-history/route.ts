// =============================================================================
// GET /api/vehicle-history?vehicleId= | evaluationId= | plate=&chassi=&renavam=
// Avaliações e passagens pelo estoque do mesmo carro (placa/chassi/renavam)
// dentro da loja. Usado na ficha do veículo (Fotos da avaliação / Histórico) e
// na inspeção da avaliação ("este carro já passou pela loja").
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { loadVehicleHistory, type HistoryIdentity } from '@/lib/stock/vehicle-history'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock') && !canAccessModule(user.role, 'stock.evaluate')) return forbiddenResponse()
  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const sp = req.nextUrl.searchParams
    const vehicleId = sp.get('vehicleId')
    const evaluationId = sp.get('evaluationId')
    let identity: HistoryIdentity = { plate: sp.get('plate'), chassi: sp.get('chassi'), renavam: sp.get('renavam') }
    let scopeTenant: string | null = tenantId

    if (vehicleId) {
      const v = await prisma.vehicle.findFirst({ where: { id: vehicleId, ...tenantWhere(user.role, tenantId) }, select: { tenantId: true, plate: true, chassi: true, renavam: true } })
      if (!v) return NextResponse.json({ success: false, error: 'Veículo não encontrado.' }, { status: 404 })
      identity = v; scopeTenant = v.tenantId
    } else if (evaluationId) {
      const e = await prisma.vehicleEvaluation.findFirst({ where: { id: evaluationId, ...tenantWhere(user.role, tenantId) }, select: { tenantId: true, plate: true, chassi: true, renavam: true } })
      if (!e) return NextResponse.json({ success: false, error: 'Avaliação não encontrada.' }, { status: 404 })
      identity = e; scopeTenant = e.tenantId
    }

    const data = await loadVehicleHistory(scopeTenant, identity)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
