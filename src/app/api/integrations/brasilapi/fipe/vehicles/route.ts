// =============================================================================
// GET /api/integrations/brasilapi/fipe/vehicles
//   ?tipoVeiculo=carros&codigoMarca=21&tabelaReferencia=...
// Lista modelos/veículos FIPE de uma marca.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { getFipeVehicles, type TipoVeiculoFipe } from '@/lib/brasilapi/service'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const tipoVeiculo      = (req.nextUrl.searchParams.get('tipoVeiculo') ?? 'carros') as TipoVeiculoFipe
  const codigoMarca      = req.nextUrl.searchParams.get('codigoMarca') ?? ''
  const tabelaReferencia = req.nextUrl.searchParams.get('tabelaReferencia') ?? undefined

  if (!codigoMarca) {
    return NextResponse.json({ ok: false, error: 'codigoMarca é obrigatório.' }, { status: 400 })
  }

  const result = await getFipeVehicles(tipoVeiculo, codigoMarca, tabelaReferencia ?? undefined)
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'Modelo não encontrado.' },
      { status: result.error?.includes('inválido') ? 400 : 502 },
    )
  }
  return NextResponse.json({ ok: true, source: result.source, data: result.data })
}
