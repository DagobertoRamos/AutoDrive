// =============================================================================
// GET /api/integrations/fipe/price
//   ?tipoVeiculo=carros&brandId=59&modelId=5940&yearId=2014-3[&refresh=1]
// Preço FIPE de uma variante específica — provider Parallelum.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { getPrice } from '@/lib/fipe/parallelum'
import { resolveRefresh } from '@/lib/fipe/refresh-guard'
import { logIntegrationCall } from '@/lib/brasilapi/audit'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const tipoVeiculo = req.nextUrl.searchParams.get('tipoVeiculo') ?? 'carros'
  const brandId     = req.nextUrl.searchParams.get('brandId')     ?? ''
  const modelId     = req.nextUrl.searchParams.get('modelId')     ?? ''
  const yearId      = req.nextUrl.searchParams.get('yearId')      ?? ''
  if (!brandId || !modelId || !yearId)
    return NextResponse.json({ ok: false, error: 'brandId, modelId e yearId são obrigatórios.' }, { status: 400 })

  const rf = resolveRefresh(req, session.user.role)
  if (rf.forbidden403) {
    return NextResponse.json({ ok: false, error: 'Sem permissão para forçar atualização da FIPE.' }, { status: 403 })
  }

  const r = await getPrice(tipoVeiculo, brandId, modelId, yearId, rf.refresh)

  logIntegrationCall({
    tenantId: session.user.tenantId,
    userId:   session.user.id,
    userName: session.user.name,
    userRole: session.user.role,
    endpoint: 'fipe.getPrice',
    argument: `${tipoVeiculo}:${brandId}:${modelId}:${yearId}${rf.refresh ? ' refresh' : ''}`,
    ok:       r.ok,
    message:  r.error,
  })

  if (!r.ok) {
    return NextResponse.json(
      { ok: false, source: r.source, error: r.error, details: r.details },
      { status: r.error?.includes('inválido') || r.error?.includes('obrigatórios') ? 400 : 502 },
    )
  }
  return NextResponse.json({ ok: true, source: r.source, data: r.data })
}
