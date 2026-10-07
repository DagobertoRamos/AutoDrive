// =============================================================================
// /api/operations/[id] — uma operação veicular (TXN).
//   GET  → status geral, dimensões, etapas da transferência, notas; chamadas
//          externas (técnico) só para ops.logs.view.
//   POST { action, ... }:
//     renave.entry | renave.exit | renave.cancel   { manual: { protocol, date, notes }, reason? }
//     fiscal.attach                                { xml }
//     transfer.advance                             { stage, manual? }
//     transfer.instructions                        → { text, phone }
//     financing.lien                               { protocol? }  (gravame incluído)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { opsPermissions } from '@/lib/automotive/access'
import { attachFiscalXml } from '@/lib/automotive/fiscal'
import { applyToOperation, OpsError } from '@/lib/automotive/operations'
import { serializeOperation } from '@/lib/automotive/overview'
import { renaveAction } from '@/lib/automotive/renave'
import { advanceTransfer, transferInstructions, transferView } from '@/lib/automotive/transfer'
import { opsError, opsSession, requireOps } from '@/lib/automotive/route-helpers'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

async function loadScoped(id: string, s: Exclude<Awaited<ReturnType<typeof opsSession>>, NextResponse>) {
  const op = await prisma.vehicleOperation.findFirst({ where: { id, ...(s.tenantId ? { tenantId: s.tenantId } : {}) } })
  if (!op) throw new OpsError('Operação não encontrada.', 404)
  // Operação de negociação: mesmo escopo de acesso da negociação (vendedor só as suas).
  if (op.dealId) {
    const ok = await prisma.deal.findFirst({ where: await buildNegotiationAccessWhere(s.user as never, { id: op.dealId }), select: { id: true } })
    if (!ok) throw new OpsError('Operação não encontrada.', 404)
  }
  return op
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const s = await opsSession()
    if (s instanceof NextResponse) return s
    const { id } = await ctx.params
    const op = await loadScoped(id, s)
    const perms = await opsPermissions(s.user)
    const [docs, external] = await Promise.all([
      perms['ops.fiscal.view'] ? prisma.fiscalDocument.findMany({ where: { operationId: op.id }, orderBy: { createdAt: 'desc' }, select: { id: true, number: true, series: true, direction: true, status: true, accessKey: true, amount: true, authorizedAt: true, rejectionMessage: true } }) : [],
      perms['ops.logs.view'] ? prisma.externalOperation.findMany({ where: { operationId: op.id }, orderBy: { createdAt: 'desc' }, take: 30 }) : [],
    ])
    return NextResponse.json({
      success: true,
      data: { ...serializeOperation(op), transfer: await transferView(op), fiscalDocs: docs.map((d) => ({ ...d, amount: d.amount != null ? Number(d.amount) : null })), external, permissions: perms },
    })
  } catch (err) {
    return opsError(err)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const s = await opsSession()
    if (s instanceof NextResponse) return s
    const { id } = await ctx.params
    const op = await loadScoped(id, s)
    const b = await req.json().catch(() => ({})) as Record<string, any>
    const action = String(b.action ?? '')

    if (action.startsWith('renave.')) {
      const d = await requireOps(s, 'ops.renave.operate'); if (d) return d
      const kind = action === 'renave.entry' ? 'ENTRY' : action === 'renave.exit' ? 'EXIT' : action === 'renave.cancel' ? 'CANCEL' : null
      if (!kind) return NextResponse.json({ success: false, error: 'Ação inválida.' }, { status: 400 })
      const updated = await renaveAction(op.id, s.tenantId, kind, b.manual, s.actor, b.reason)
      return NextResponse.json({ success: true, data: serializeOperation(updated) })
    }
    if (action === 'fiscal.attach') {
      const d = await requireOps(s, 'ops.fiscal.issue'); if (d) return d
      const r = await attachFiscalXml(op.id, s.tenantId, String(b.xml ?? ''), s.actor)
      return NextResponse.json({ success: true, data: r })
    }
    if (action === 'transfer.advance') {
      const d = await requireOps(s, 'ops.transfer.start'); if (d) return d
      const updated = await advanceTransfer(op.id, s.tenantId, String(b.stage ?? ''), b.manual, s.actor)
      return NextResponse.json({ success: true, data: serializeOperation(updated) })
    }
    if (action === 'transfer.instructions') {
      const d = await requireOps(s, 'ops.transfer.view'); if (d) return d
      return NextResponse.json({ success: true, data: await transferInstructions(op.id, s.tenantId) })
    }
    if (action === 'financing.lien') {
      const d = await requireOps(s, 'ops.compliance.manage'); if (d) return d
      if (op.kind !== 'SALE' || op.financingStatus === 'NOT_APPLICABLE') return NextResponse.json({ success: false, error: 'Venda sem financiamento.' }, { status: 409 })
      if (op.financingStatus === 'LIEN_REGISTERED' || op.financingStatus === 'BANK_PAID') return NextResponse.json({ success: true, data: serializeOperation(op) })
      const protocol = typeof b.protocol === 'string' ? b.protocol.trim().slice(0, 80) : ''
      const updated = await applyToOperation(op.id, { financingStatus: 'LIEN_REGISTERED' }, { actor: s.actor, type: 'FINANCING_LIEN', title: `Gravame incluído${protocol ? ` (${protocol})` : ''}.` })
      return NextResponse.json({ success: true, data: serializeOperation(updated) })
    }
    return NextResponse.json({ success: false, error: 'Ação inválida.' }, { status: 400 })
  } catch (err) {
    return opsError(err)
  }
}
