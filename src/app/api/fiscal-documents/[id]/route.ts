// =============================================================================
// /api/fiscal-documents/[id]
//   GET  ?download=xml → XML autorizado (ops.fiscal.view)
//   POST { action: 'cancel', reason, eventXml?, protocol? } (ops.fiscal.cancel)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cancelFiscalDocument } from '@/lib/automotive/fiscal'
import { opsError, opsSession, requireOps } from '@/lib/automotive/route-helpers'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ id: string }> }

async function scoped(id: string, s: Exclude<Awaited<ReturnType<typeof opsSession>>, NextResponse>) {
  const doc = await prisma.fiscalDocument.findFirst({ where: { id, ...(s.tenantId ? { tenantId: s.tenantId } : {}) } })
  if (!doc) return null
  if (doc.dealId && !(await prisma.deal.findFirst({ where: await buildNegotiationAccessWhere(s.user as never, { id: doc.dealId }), select: { id: true } }))) return null
  return doc
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const s = await opsSession()
    if (s instanceof NextResponse) return s
    const d = await requireOps(s, 'ops.fiscal.view'); if (d) return d
    const { id } = await ctx.params
    const doc = await scoped(id, s)
    if (!doc) return NextResponse.json({ success: false, error: 'Nota não encontrada.' }, { status: 404 })
    if (req.nextUrl.searchParams.get('download') === 'xml') {
      if (!doc.xml) return NextResponse.json({ success: false, error: 'XML indisponível.' }, { status: 404 })
      return new NextResponse(doc.xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="NFe-${doc.accessKey ?? doc.id}.xml"` } })
    }
    const { xml: _x, ...rest } = doc
    return NextResponse.json({ success: true, data: { ...rest, amount: rest.amount != null ? Number(rest.amount) : null } })
  } catch (err) {
    return opsError(err)
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const s = await opsSession()
    if (s instanceof NextResponse) return s
    const d = await requireOps(s, 'ops.fiscal.cancel'); if (d) return d
    const { id } = await ctx.params
    const doc = await scoped(id, s)
    if (!doc) return NextResponse.json({ success: false, error: 'Nota não encontrada.' }, { status: 404 })
    const b = await req.json().catch(() => ({})) as Record<string, any>
    if (b.action !== 'cancel') return NextResponse.json({ success: false, error: 'Ação inválida.' }, { status: 400 })
    const r = await cancelFiscalDocument(doc.id, s.tenantId, { reason: String(b.reason ?? ''), eventXml: b.eventXml ?? null, protocol: b.protocol ?? null }, s.actor)
    return NextResponse.json({ success: true, data: { id: r.id, status: r.status } })
  } catch (err) {
    return opsError(err)
  }
}
