// =============================================================================
// GET /api/vehicles/versions?brandCode=...&modelCode=...&type=CAR
// Lista versões/anos de um modelo na Tabela FIPE
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { getFipeVersions } from '@/lib/vehicle-lookup/providers/fipe.provider'
import type { VehicleCategory } from '@/lib/vehicle-lookup/types'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  try {
    const { searchParams } = new URL(req.url)
    const brandCode = searchParams.get('brandCode') ?? ''
    const modelCode = searchParams.get('modelCode') ?? ''
    const type      = (searchParams.get('type') ?? 'CAR').toUpperCase() as VehicleCategory

    if (!brandCode || !modelCode) {
      return NextResponse.json(
        { success: false, error: 'brandCode e modelCode são obrigatórios.' },
        { status: 400 },
      )
    }

    const versions = await getFipeVersions(type, brandCode, modelCode)
    return NextResponse.json({ success: true, data: versions })
  } catch (err) {
    console.error('[versions] Erro ao buscar versões FIPE:', err)
    return NextResponse.json(
      { success: false, error: 'Não foi possível carregar as versões. Tente novamente.' },
      { status: 502 },
    )
  }
}
