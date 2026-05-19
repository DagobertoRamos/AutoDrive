// =============================================================================
// GET /api/integrations/fipe/brands?tipoVeiculo=carros[&refresh=1]
// Marcas FIPE por tipo de veículo — provider Parallelum.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { getBrands } from '@/lib/fipe/parallelum'
import { resolveRefresh } from '@/lib/fipe/refresh-guard'
import { logIntegrationCall } from '@/lib/brasilapi/audit'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const tipoVeiculo = req.nextUrl.searchParams.get('tipoVeiculo') ?? 'carros'
  const rf = resolveRefresh(req, session.user.role)
  if (rf.forbidden403) {
    return NextResponse.json({ ok: false, error: 'Sem permissão para forçar atualização da FIPE.' }, { status: 403 })
  }

  const r = await getBrands(tipoVeiculo, rf.refresh)

  logIntegrationCall({
    tenantId: session.user.tenantId,
    userId:   session.user.id,
    userName: session.user.name,
    userRole: session.user.role,
    endpoint: 'fipe.getBrands',
    argument: `${tipoVeiculo}${rf.refresh ? ' refresh' : ''}`,
    ok:       r.ok,
    message:  r.error,
  })

  if (!r.ok) {
    return NextResponse.json(
      { ok: false, source: r.source, error: r.error, details: r.details },
      { status: r.error?.includes('inválido') ? 400 : 502 },
    )
  }
  return NextResponse.json({ ok: true, source: r.source, data: r.data })
}
