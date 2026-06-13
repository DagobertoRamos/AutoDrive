// =============================================================================
// GET /api/integrations/brasilapi/banks/[code]
// Detalhe de um banco pelo código compe.
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { getBankByCode } from '@/lib/brasilapi/service'

export async function GET(
  _req: Request,
  ctxArg: { params: { code: string } | Promise<{ code: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const result = await getBankByCode(params.code)
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'Banco não encontrado.' },
      { status: result.error?.includes('não encontrado') ? 404 : 502 },
    )
  }
  return NextResponse.json({ ok: true, source: result.source, data: result.data })
}
