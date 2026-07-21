// =============================================================================
// GET /api/evaluations/service-catalog
// Retorna o catálogo de serviços ATIVOS disponíveis para o tenant logado.
// Usado na aba SERVIÇOS da avaliação.
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { loadServiceCatalog } from '@/lib/evaluation/services-catalog'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const items = await loadServiceCatalog(session.user.tenantId ?? null)
  return NextResponse.json({ data: items.filter((i) => i.active) })
}
