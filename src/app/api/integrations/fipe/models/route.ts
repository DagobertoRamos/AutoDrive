// =============================================================================
// GET /api/integrations/fipe/models?tipoVeiculo=carros&brandId=59[&refresh=1]
// Modelos FIPE por marca — provider Parallelum.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { getModels } from '@/lib/fipe/parallelum'
import { resolveRefresh } from '@/lib/fipe/refresh-guard'
import { logIntegrationCall } from '@/lib/brasilapi/audit'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const tipoVeiculo = req.nextUrl.searchParams.get('tipoVeiculo') ?? 'carros'
  const brandId     = req.nextUrl.searchParams.get('brandId')     ?? ''
  if (!brandId) return NextResponse.json({ ok: false, error: 'brandId é obrigatório.' }, { status: 400 })

  const rf = resolveRefresh(req, session.user.role)
  if (rf.forbidden403) {
    return NextResponse.json({ ok: false, error: 'Sem permissão para forçar atualização da FIPE.' }, { status: 403 })
  }

  const r = await getModels(tipoVeiculo, brandId, rf.refresh)

  logIntegrationCall({
    tenantId: session.user.tenantId,
    userId:   session.user.id,
    userName: session.user.name,
    userRole: session.user.role,
    endpoint: 'fipe.getModels',
    argument: `${tipoVeiculo}:${brandId}${rf.refresh ? ' refresh' : ''}`,
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
