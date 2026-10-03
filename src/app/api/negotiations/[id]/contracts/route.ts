// =============================================================================
// /api/negotiations/[id]/contracts — documentos da venda montados com os dados
// do sistema (loja, comprador, proprietário, veículos, débitos e pagamentos).
//   GET  → { suggested, intermediated }  (quais documentos cabem nesta venda)
//   POST { kind: 'VENDA' | 'SINAL' | 'INTERMEDIACAO' } → gera/regera e grava
//        na aba Contratos; devolve o documento.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { requireModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { loadContractData } from '@/lib/negotiation/contracts/contract-data'
import { generateDealDocument, isDocKind } from '@/lib/negotiation/contracts/generate'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } | Promise<{ id: string }> }

async function guard(manage: boolean) {
  const session = await getServerAuthSession()
  if (!session) return { error: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  try { requireModule(session.user.role, manage ? 'negotiations.manage' : 'negotiations') }
  catch { return { error: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) } }
  const gate = await assertModuleEnabled(session.user, 'negotiations')
  if (gate) return { error: gate }
  return { session }
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await Promise.resolve(ctx.params)
  const g = await guard(false)
  if (g.error) return g.error
  const where = await buildNegotiationAccessWhere(g.session.user, { id })
  const loaded = await loadContractData(id, where)
  if (!loaded) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
  return NextResponse.json({ data: { suggested: loaded.suggested, intermediated: loaded.intermediated, hasSold: loaded.hasSold, hasEntry: loaded.hasEntry, outorgados: loaded.data.outorgados?.length ?? 0 } })
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await Promise.resolve(ctx.params)
  const g = await guard(true)
  if (g.error) return g.error
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown }
  if (!isDocKind(body.kind)) return NextResponse.json({ error: 'Documento inválido.' }, { status: 400 })
  const where = await buildNegotiationAccessWhere(g.session.user, { id })
  try {
    const r = await generateDealDocument(id, body.kind, g.session.user.id, where)
    return NextResponse.json({ data: r.doc, regenerated: r.regenerated }, { status: r.regenerated ? 200 : 201 })
  } catch (e) {
    console.error('[contracts]', e)
    return NextResponse.json({ error: (e as Error).message || 'Não foi possível gerar o documento.' }, { status: 400 })
  }
}
