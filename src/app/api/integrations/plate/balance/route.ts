// =============================================================================
// GET /api/integrations/plate/balance — saldo da API Placas (MASTER/ADM)
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { isAtLeast } from '@/lib/permissions'
import { getBalance, isPlacasConfigured } from '@/lib/integrations/placas/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })
  if (!isAtLeast(session.user.role, 'ADM')) {
    return NextResponse.json({ ok: false, error: 'Apenas ADM ou MASTER.' }, { status: 403 })
  }

  if (!(await isPlacasConfigured())) {
    return NextResponse.json(
      { ok: false, configured: false, error: 'API Placas não configurada.' },
      { status: 503 },
    )
  }

  const r = await getBalance()
  if (!r.success) {
    return NextResponse.json(
      { ok: false, error: r.errorMessage, httpStatus: r.httpStatus },
      { status: r.httpStatus || 502 },
    )
  }
  return NextResponse.json({ ok: true, balance: r.balance })
}
