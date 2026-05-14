// =============================================================================
// GET /api/vehicles/brands?type=CAR|MOTORCYCLE|TRUCK
// Lista marcas da Tabela FIPE por tipo de veículo
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { getAllFipeBrands, getFipeBrands } from '@/lib/vehicle-lookup/providers/fipe.provider'
import type { VehicleCategory } from '@/lib/vehicle-lookup/types'

const VALID_TYPES = new Set(['CAR', 'MOTORCYCLE', 'TRUCK'])

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  try {
    const { searchParams } = new URL(req.url)
    const type = (searchParams.get('type') ?? '').toUpperCase()

    const brands = VALID_TYPES.has(type)
      ? await getFipeBrands(type as VehicleCategory)
      : await getAllFipeBrands()

    return NextResponse.json({ success: true, data: brands })
  } catch (err) {
    console.error('[brands] Erro ao buscar marcas FIPE:', err)
    return NextResponse.json(
      { success: false, error: 'Não foi possível carregar as marcas. Tente novamente.' },
      { status: 502 },
    )
  }
}
