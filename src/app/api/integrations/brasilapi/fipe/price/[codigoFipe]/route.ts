// =============================================================================
// GET /api/integrations/brasilapi/fipe/price/[codigoFipe]?tabelaReferencia=...
// Retorna o preço FIPE para um código (lista — pode haver várias variações).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { getFipePrice } from '@/lib/brasilapi/service'
import { logIntegrationCall } from '@/lib/brasilapi/audit'

export async function GET(
  req: NextRequest,
  ctxArg: { params: { codigoFipe: string } | Promise<{ codigoFipe: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const codigoFipe       = String(params.codigoFipe ?? '').trim()
  const tabelaReferencia = req.nextUrl.searchParams.get('tabelaReferencia') ?? undefined

  const result = await getFipePrice(codigoFipe, tabelaReferencia ?? undefined)

  logIntegrationCall({
    tenantId: session.user.tenantId,
    userId:   session.user.id,
    userName: session.user.name,
    userRole: session.user.role,
    endpoint: 'brasilapi.getFipePrice',
    argument: codigoFipe,
    ok:       result.ok,
    message:  result.error,
  })

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'Código FIPE inválido.' },
      { status: result.error?.includes('inválido') || result.error?.includes('obrigatório') ? 400 : 502 },
    )
  }
  return NextResponse.json({ ok: true, source: result.source, data: result.data })
}
