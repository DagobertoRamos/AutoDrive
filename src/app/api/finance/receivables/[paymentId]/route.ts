// =============================================================================
// Financeiro › Recebimentos — ações num pagamento de negociação.
//   PATCH { action: 'CONFIRMAR' | 'CANCELAR' | 'REABRIR', paidAt?, authorizationCode? }
//         Confirmar exige: cartão com comprovante → código de autorização.
//   POST  multipart file → anexa o comprovante ao pagamento.
// Só quem tem finance.manage (ADM, gerência geral/administrativa, financeiro).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { legacyFinanceGuard } from '@/app/api/finance/center/entries/_lib/shared'
import { handlePrismaError } from '@/lib/prisma-errors'
import { saveDealAttachment, validateDealUpload } from '@/lib/negotiation/storage'
import { syncDealFinanceSafe } from '@/lib/finance/deal-finance-sync'
import { debtRowLabel, logDealChild, payLabel, statusPt } from '@/lib/negotiation/children-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { paymentId: string } | Promise<{ paymentId: string }> }

async function load(req: Request, paymentId: string) {
  const g = await legacyFinanceGuard('finance.manage', req)
  if (g.error) return { error: g.error }
  const { user, tenantId } = g
  const p = await prisma.dealPayment.findFirst({
    where: { id: paymentId, ...(tenantId ? { deal: { tenantId } } : {}) },
    select: { id: true, dealId: true, type: true, method: true, status: true, authorizationCode: true, value: true, bank: true, deal: { select: { tenantId: true } } },
  })
  if (!p) return { error: NextResponse.json({ error: 'Pagamento não encontrado.' }, { status: 404 }) }
  return { user, p }
}

const isCard = (p: { type: string; method: string | null }) => [p.type, p.method].some((t) => t === 'CARTAO_CREDITO' || t === 'CARTAO_DEBITO')

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { paymentId } = await Promise.resolve(ctx.params)
  const l = await load(req, paymentId)
  if ('error' in l) return l.error
  const { user, p } = l
  const b = (await req.json().catch(() => ({}))) as { action?: string; paidAt?: string; authorizationCode?: string }
  const action = String(b.action ?? '').toUpperCase()
  const auth = b.authorizationCode !== undefined ? String(b.authorizationCode).replace(/[^\w-]/g, '').slice(0, 40) || null : p.authorizationCode
  const data: Record<string, unknown> = { ...(b.authorizationCode !== undefined ? { authorizationCode: auth } : {}) }
  if (action === 'CONFIRMAR') {
    const hasReceipt = (await prisma.dealAttachment.count({ where: { paymentId } })) > 0
    if (isCard(p) && hasReceipt && !auth) return NextResponse.json({ error: 'Cartão com comprovante: informe o código de autorização antes de confirmar.' }, { status: 400 })
    data.status = 'CONFIRMADO'
    data.paidAt = b.paidAt ? new Date(`${b.paidAt}T12:00:00`) : new Date()
  } else if (action === 'CANCELAR') {
    data.status = 'CANCELADO'
  } else if (action === 'REABRIR') {
    data.status = 'PENDENTE'; data.paidAt = null
  } else if (b.authorizationCode === undefined) {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  }
  try {
    const updated = await prisma.dealPayment.update({ where: { id: paymentId }, data })
    await createSafeAuditLog({ userId: user.id, tenantId: user.tenantId ?? null, action: action ? `PAYMENT_${action}` : 'PAYMENT_AUTH_CODE', entity: 'DealPayment', entityId: paymentId, userName: user.name ?? null, userRole: user.role })
    if (updated.status !== p.status) await logDealChild(p.dealId, { id: user.id, name: user.name ?? null, role: user.role }, 'pagamento', `${payLabel(p)} (${statusPt(p.status)})`, `${payLabel(updated)} (${statusPt(updated.status)})`)
    await syncDealFinanceSafe(p.dealId)
    return NextResponse.json({ success: true, data: updated })
  } catch (err) { return handlePrismaError(err) }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { paymentId } = await Promise.resolve(ctx.params)
  const l = await load(req, paymentId)
  if ('error' in l) return l.error
  const { user, p } = l
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Envie o arquivo do comprovante.' }, { status: 400 })
  const v = validateDealUpload(file.type, file.size)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  try {
    const saved = await saveDealAttachment(p.dealId, file.name, file.type, Buffer.from(await file.arrayBuffer()))
    const att = await prisma.dealAttachment.create({
      data: { dealId: p.dealId, tenantId: p.deal.tenantId, category: 'COMPROVANTE_PAGAMENTO', fileName: saved.fileName, fileType: saved.fileType, mimeType: saved.mimeType, fileSize: saved.fileSize, storageKey: saved.storageKey, publicUrl: saved.publicUrl, paymentId, uploadedById: user.id, uploadedByName: user.name ?? null },
      select: { id: true, fileName: true, publicUrl: true, fileType: true },
    })
    return NextResponse.json({ success: true, data: att, needsAuthorization: isCard(p) && !p.authorizationCode })
  } catch (e) {
    console.error('[receivables/receipt]', e)
    return NextResponse.json({ error: `Não foi possível guardar o comprovante: ${(e as Error).message}`.slice(0, 240) }, { status: 500 })
  }
}
