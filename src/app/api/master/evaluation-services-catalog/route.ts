// =============================================================================
// GET/PUT /api/master/evaluation-services-catalog
//
// GET  → catálogo completo (inclusive inativos) do tenant logado. Se o
//        usuário é MASTER e passar ?scope=global, retorna o catálogo global.
// PUT  → substitui o catálogo. Aceita { items: ServiceCatalogItem[], scope? }.
//        scope='global' só é aceito de usuários MASTER.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { loadServiceCatalog, saveServiceCatalog, type ServiceCatalogItem } from '@/lib/evaluation/services-catalog'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const role = session.user.role
  if (role !== 'MASTER' && role !== 'ADM' && role !== 'GERENTE') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const scope = req.nextUrl.searchParams.get('scope')
  const tenantId = scope === 'global' && role === 'MASTER' ? null : session.user.tenantId ?? null

  const items = await loadServiceCatalog(tenantId)
  return NextResponse.json({ data: items, scope: tenantId ? 'tenant' : 'global' })
}

export async function PUT(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const role = session.user.role
  if (role !== 'MASTER' && role !== 'ADM' && role !== 'GERENTE') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { items?: ServiceCatalogItem[]; scope?: string } | null
  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ error: 'Corpo inválido — esperado { items: [...] }' }, { status: 400 })
  }

  // Sanitiza input
  const clean: ServiceCatalogItem[] = body.items.map((x, i) => ({
    key:           typeof x.key === 'string' && x.key ? x.key : `svc.custom.${Date.now()}_${i}`,
    label:         String(x.label ?? '').trim() || `Serviço ${i + 1}`,
    hint:          x.hint ? String(x.hint).trim() : undefined,
    serviceType:   String(x.serviceType ?? 'OUTRO'),
    suggestedCost: typeof x.suggestedCost === 'number' && x.suggestedCost > 0 ? x.suggestedCost : undefined,
    askCost:       x.askCost !== false,
    active:        x.active !== false,
    isBuiltIn:     Boolean(x.isBuiltIn),
    order:         typeof x.order === 'number' ? x.order : (i + 1) * 10,
  }))

  const tenantId = body.scope === 'global' && role === 'MASTER' ? null : session.user.tenantId ?? null
  await saveServiceCatalog(tenantId, clean, session.user.id)
  return NextResponse.json({ ok: true, data: clean })
}
