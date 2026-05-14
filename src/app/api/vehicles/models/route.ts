// =============================================================================
// GET /api/vehicles/models?brandCode=...&type=CAR|MOTORCYCLE|TRUCK
// Lista modelos de uma marca na Tabela FIPE
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { getFipeModels } from '@/lib/vehicle-lookup/providers/fipe.provider'
import type { VehicleCategory } from '@/lib/vehicle-lookup/types'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  try {
    const { searchParams } = new URL(req.url)
    const brandCode = searchParams.get('brandCode') ?? ''
    const type      = (searchParams.get('type') ?? 'CAR').toUpperCase() as VehicleCategory

    if (!brandCode) {
      return NextResponse.json({ success: false, error: 'brandCode é obrigatório.' }, { status: 400 })
    }

    const models = await getFipeModels(type, brandCode)
    return NextResponse.json({ success: true, data: models })
  } catch (err) {
    console.error('[models] Erro ao buscar modelos FIPE:', err)
    return NextResponse.json(
      { success: false, error: 'Não foi possível carregar os modelos. Tente novamente.' },
      { status: 502 },
    )
  }
}
