// =============================================================================
// GET /api/integrations/brasilapi/fipe/brands?tipoVeiculo=carros&tabelaReferencia=...
// Lista marcas FIPE de um tipo de veículo.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { getFipeBrands, type TipoVeiculoFipe } from '@/lib/brasilapi/service'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const tipoVeiculo      = (req.nextUrl.searchParams.get('tipoVeiculo') ?? 'carros') as TipoVeiculoFipe
  const tabelaReferencia = req.nextUrl.searchParams.get('tabelaReferencia') ?? undefined

  const result = await getFipeBrands(tipoVeiculo, tabelaReferencia ?? undefined)
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'Marca não encontrada.' },
      { status: result.error?.includes('inválido') ? 400 : 502 },
    )
  }
  return NextResponse.json({ ok: true, source: result.source, data: result.data })
}
