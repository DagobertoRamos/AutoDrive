// =============================================================================
// GET /api/integrations/fipe/code/[codeFipe][?refresh=1]
// Busca direta por código FIPE — provider Parallelum.
// Retorna lista de variantes (ano + combustível) com preço.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { getPriceByCode } from '@/lib/fipe/parallelum'
import { resolveRefresh } from '@/lib/fipe/refresh-guard'
import { logIntegrationCall } from '@/lib/brasilapi/audit'

export async function GET(
  req: NextRequest,
  ctxArg: { params: { codeFipe: string } | Promise<{ codeFipe: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const code = String(params.codeFipe ?? '').trim()
  if (!code) return NextResponse.json({ ok: false, error: 'codeFipe é obrigatório.' }, { status: 400 })

  const rf = resolveRefresh(req, session.user.role)
  if (rf.forbidden403) {
    return NextResponse.json({ ok: false, error: 'Sem permissão para forçar atualização da FIPE.' }, { status: 403 })
  }

  const r = await getPriceByCode(code, rf.refresh)

  logIntegrationCall({
    tenantId: session.user.tenantId,
    userId:   session.user.id,
    userName: session.user.name,
    userRole: session.user.role,
    endpoint: 'fipe.getPriceByCode',
    argument: code + (rf.refresh ? ' refresh' : ''),
    ok:       r.ok,
    message:  r.error,
  })

  if (!r.ok) {
    return NextResponse.json(
      { ok: false, source: r.source, error: r.error, details: r.details },
      { status: r.error?.includes('obrigatório') ? 400 : 502 },
    )
  }
  return NextResponse.json({ ok: true, source: r.source, data: r.data })
}
