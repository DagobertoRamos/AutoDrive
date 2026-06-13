// =============================================================================
// GET /api/integrations/brasilapi/cep/[cep]
// Proxy seguro à BrasilAPI para consulta de CEP.
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { getCep }   from '@/lib/brasilapi/service'
import { logIntegrationCall } from '@/lib/brasilapi/audit'

export async function GET(
  _req: Request,
  ctxArg: { params: { cep: string } | Promise<{ cep: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const cepArg = String(params.cep ?? '').replace(/\D/g, '')
  const result = await getCep(cepArg)

  logIntegrationCall({
    tenantId: session.user.tenantId,
    userId:   session.user.id,
    userName: session.user.name,
    userRole: session.user.role,
    endpoint: 'brasilapi.getCep',
    argument: cepArg,
    ok:       result.ok,
    message:  result.error,
  })

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, found: false, error: result.error ?? 'Falha na consulta.' },
      { status: result.error?.includes('inválido') ? 400 : 502 },
    )
  }

  const d = result.data!
  return NextResponse.json({
    ok:    true,
    found: true,
    source: result.source,
    data: {
      cep:         String(d.cep ?? '').replace(/\D/g, ''),
      logradouro:  d.street       ?? '',
      complemento: d.complement   ?? '',
      bairro:      d.neighborhood ?? '',
      cidade:      d.city         ?? '',
      estado:      d.state        ?? '',
      coordinates: d.coordinates  ?? undefined,
    },
  })
}
