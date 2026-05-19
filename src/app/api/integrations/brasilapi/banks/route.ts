// =============================================================================
// GET /api/integrations/brasilapi/banks
// Lista todos os bancos via BrasilAPI (cache 24h).
//
// Query opcional:
//   ?refresh=1  → limpa o cache (apenas MASTER/ADM)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { getBanks, clearBrasilApiCache } from '@/lib/brasilapi/service'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const refresh = req.nextUrl.searchParams.get('refresh') === '1'
  if (refresh && ['MASTER', 'ADM'].includes(session.user.role)) {
    clearBrasilApiCache()
  }

  const result = await getBanks()
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'Não foi possível carregar bancos.' },
      { status: 502 },
    )
  }
  return NextResponse.json({ ok: true, source: result.source, data: result.data })
}
