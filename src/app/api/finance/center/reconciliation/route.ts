// =============================================================================
// /api/finance/center/reconciliation — conciliação bancária (lib/finance/bank-reconciliation).
//   GET  : finance        ?accountId&status=PENDENTE|CONCILIADO|IGNORADO|TODOS&from&to
//          → { lines, summary }
//   POST : finance.manage
//          multipart { accountId, file }                     → importa OFX/CSV
//          JSON { action: 'MATCH', lineId, entryIds[] }      → concilia (baixa títulos em aberto)
//          JSON { action: 'CREATE', lineId, categoryId?, description? }
//          JSON { action: 'IGNORAR' | 'DESFAZER', lineId, reason? }
// Até a migration 20261008100000 ser aplicada, responde com aviso (tabela ausente).
// =============================================================================

import { NextResponse } from 'next/server'
import { financeGuard } from '@/lib/finance/access'
import { createFromLine, importStatement, listLines, matchLine, reconciliationSummary, setLineStatus } from '@/lib/finance/bank-reconciliation'

export const dynamic = 'force-dynamic'
const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status })
const missingTable = (e: unknown) => /bank_statement_lines|does not exist|P2021/i.test(String((e as { code?: string })?.code ?? '') + String((e as Error)?.message ?? ''))
const PENDING_MIGRATION = 'Conciliação ainda não ativada: aplique a migration do banco (prisma migrate deploy).'

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const sp = new URL(req.url).searchParams
  const accountId = sp.get('accountId')
  if (!accountId) return bad('Escolha a conta.')
  try {
    const [lines, summary] = await Promise.all([
      listLines(g.tenantId, accountId, sp.get('status') ?? 'PENDENTE', sp.get('from'), sp.get('to')),
      reconciliationSummary(g.tenantId, accountId),
    ])
    return NextResponse.json({ success: true, data: { lines, summary } })
  } catch (e) {
    if (missingTable(e)) return bad(PENDING_MIGRATION, 503)
    console.error('[reconciliation]', e)
    return bad('Erro ao carregar a conciliação.', 500)
  }
}

export async function POST(req: Request) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const actor = { id: g.user.id, name: g.user.name, role: g.user.role }
  try {
    if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const form = await req.formData()
      const file = form.get('file')
      const accountId = String(form.get('accountId') ?? '')
      if (!(file instanceof File)) return bad('Envie o arquivo OFX ou CSV.')
      if (file.size > 5 * 1024 * 1024) return bad('Arquivo muito grande (máx. 5 MB).')
      const buf = Buffer.from(await file.arrayBuffer())
      let text = buf.toString('utf-8')
      if (text.includes('\uFFFD')) text = buf.toString('latin1')
      const r = await importStatement(g.tenantId, accountId, file.name, text, actor)
      if ('error' in r) return bad(r.error!)
      return NextResponse.json({ success: true, data: r })
    }
    const b = await req.json().catch(() => ({})) as { action?: string; lineId?: string; entryIds?: string[]; categoryId?: string | null; description?: string | null; reason?: string | null }
    const lineId = String(b.lineId ?? '')
    let err: string | null
    if (b.action === 'MATCH') err = await matchLine(g.tenantId, lineId, Array.isArray(b.entryIds) ? b.entryIds.map(String) : [], actor)
    else if (b.action === 'CREATE') err = await createFromLine(g.tenantId, lineId, { categoryId: b.categoryId || null, description: b.description ?? null }, actor)
    else if (b.action === 'IGNORAR' || b.action === 'DESFAZER') err = await setLineStatus(g.tenantId, lineId, b.action, b.reason?.trim() || null, actor)
    else return bad('Ação inválida.')
    if (err) return bad(err)
    return NextResponse.json({ success: true })
  } catch (e) {
    if (missingTable(e)) return bad(PENDING_MIGRATION, 503)
    console.error('[reconciliation]', e)
    return bad('Erro na conciliação.', 500)
  }
}
