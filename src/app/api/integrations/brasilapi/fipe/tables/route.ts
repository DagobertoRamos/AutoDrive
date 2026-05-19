// =============================================================================
// GET /api/integrations/brasilapi/fipe/tables
// Lista tabelas de referência FIPE (cache 24h).
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { getFipeTables } from '@/lib/brasilapi/service'

export async function GET() {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const result = await getFipeTables()
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? 'Tabela FIPE indisponível.' },
      { status: 502 },
    )
  }
  return NextResponse.json({ ok: true, source: result.source, data: result.data })
}
