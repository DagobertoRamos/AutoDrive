// =============================================================================
// GET /api/vehicles/lookup-by-plate?plate=ABC1D23[&refresh=true]
// Consulta segura de dados veiculares por placa — NUNCA expõe API keys
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { normalizePlate, isValidPlate } from '@/lib/vehicles/plate'
import { lookupVehicleByPlate } from '@/lib/vehicle-lookup'
import { createSafeAuditLog } from '@/lib/auth-guards'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.evaluate')) return forbiddenResponse('Sem permissão para consultar veículos.')

  try {
    const { searchParams } = new URL(req.url)
    const rawPlate    = searchParams.get('plate') ?? ''
    const forceRefresh = searchParams.get('refresh') === 'true'

    if (!rawPlate.trim()) {
      return NextResponse.json(
        { success: false, error: 'Placa é obrigatória.' },
        { status: 400 },
      )
    }

    const plate = normalizePlate(rawPlate)

    if (!isValidPlate(plate)) {
      return NextResponse.json(
        { success: false, error: 'Placa inválida. Formatos aceitos: ABC-1234 (antiga) ou ABC1D23 (Mercosul).' },
        { status: 400 },
      )
    }

    const result = await lookupVehicleByPlate(plate, forceRefresh)

    // Audit log assíncrono — não bloqueia a resposta
    const tenantId = user.tenantId ?? 'MASTER'
    createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'READ',
      entity:   'VehicleLookup',
      entityId: plate,
      userName: user.name,
      userRole: user.role,
    }).catch(() => {})

    // Remove payload raw da resposta (já removido pelo orquestrador, mas garantia dupla)
    if (result.data?.raw) {
      const { raw: _, ...safeData } = result.data
      result.data = safeData
    }

    return NextResponse.json(result)
  } catch (err) {
    return handlePrismaError(err)
  }
}
