// =============================================================================
// GET /api/vehicles/fipe?brandCode=...&modelCode=...&yearCode=...&type=CAR
// Busca preço FIPE de uma versão específica
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { getFipePrice } from '@/lib/vehicle-lookup/providers/fipe.provider'
import type { VehicleCategory } from '@/lib/vehicle-lookup/types'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()

  try {
    const { searchParams } = new URL(req.url)
    const brandCode = searchParams.get('brandCode') ?? ''
    const modelCode = searchParams.get('modelCode') ?? ''
    const yearCode  = searchParams.get('yearCode')  ?? ''
    const type      = (searchParams.get('type') ?? 'CAR').toUpperCase() as VehicleCategory

    if (!brandCode || !modelCode || !yearCode) {
      return NextResponse.json(
        { success: false, error: 'brandCode, modelCode e yearCode são obrigatórios.' },
        { status: 400 },
      )
    }

    const price = await getFipePrice(type, brandCode, modelCode, yearCode)
    return NextResponse.json({ success: true, data: price })
  } catch (err) {
    console.error('[fipe] Erro ao buscar preço FIPE:', err)
    return NextResponse.json(
      { success: false, error: 'Não foi possível consultar a tabela FIPE. Tente novamente.' },
      { status: 502 },
    )
  }
}
