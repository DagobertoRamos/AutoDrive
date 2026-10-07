// =============================================================================
// Financeiro › Recebimentos — ações num pagamento de negociação.
//   PATCH { action: 'CONFIRMAR' | 'CANCELAR' | 'REABRIR', paidAt?, authorizationCode? }
//         Confirmar exige: cartão com comprovante → código de autorização.
//   PATCH { action: 'FI', returnGrossValue, ilaValue, iofValue, irrfValue,
//           returnNetValue?, plusValue, contractNumber, returnPct?, addOns[] }
//         F&I do contrato (só FINANCIAMENTO). Líquido automático = bruto − ILA − IOF − IRRF.
//   PATCH { action: 'FI_CALC', returnPct? } → NÃO grava: devolve bruto/ILA/IOF
//         pelo padrão da loja (config de retorno/ILA/IOF por competência).
//   PATCH { action: 'CHARGEBACK', amount, date, accountId, reason } | { action: 'CHARGEBACK_UNDO', reason }
//         Banco cobrou de volta o F&I do contrato (lib/finance/fi-chargeback).
//   POST  multipart file → anexa o comprovante ao pagamento.
// Só quem tem finance.manage (ADM, gerência geral/administrativa, financeiro).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { legacyFinanceGuard } from '@/app/api/finance/center/entries/_lib/shared'
import { handlePrismaError } from '@/lib/prisma-errors'
import { saveDealAttachment, validateDealUpload } from '@/lib/negotiation/storage'
import { syncDealFinanceSafe } from '@/lib/finance/deal-finance-sync'
import { logDealChild, payLabel, statusPt } from '@/lib/negotiation/children-sync'
import { buildFiUpdate, fiPatchSchema, round2 } from '@/lib/finance/fi-receipt-core'
import { calculateReturn, validateReturnPercent } from '@/lib/finance/return-calc'
import { resolveReturnSettingsForDate } from '@/lib/finance/return-settings'
import { registerChargeback, undoChargeback } from '@/lib/finance/fi-chargeback'
import { parseDateOnly } from '@/lib/negotiation/date-only'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: { paymentId: string } | Promise<{ paymentId: string }> }

async function load(req: Request, paymentId: string) {
  const g = await legacyFinanceGuard('finance.manage', req)
  if (g.error) return { error: g.error }
  const { user, tenantId } = g
  const p = await prisma.dealPayment.findFirst({
    where: { id: paymentId, ...(tenantId ? { deal: { tenantId } } : {}) },
    select: { id: true, dealId: true, type: true, method: true, status: true, authorizationCode: true, value: true, bank: true, returnPct: true, deal: { select: { tenantId: true } } },
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
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const rawAction = String(raw.action ?? '').toUpperCase()
  if (rawAction === 'FI' || rawAction === 'FI_CALC') {
    if (p.type !== 'FINANCIAMENTO') return NextResponse.json({ error: 'F&I só se aplica a pagamentos de financiamento.' }, { status: 400 })
    return rawAction === 'FI' ? saveFi(raw, user, p) : calcFi(raw, p)
  }
  if (rawAction === 'CHARGEBACK' || rawAction === 'CHARGEBACK_UNDO') {
    const tenantId = p.deal.tenantId
    if (!tenantId) return NextResponse.json({ error: 'Negociação sem loja.' }, { status: 400 })
    const actor = { id: user.id, name: user.name, role: user.role }
    const reason = String(raw.reason ?? '').trim().slice(0, 300)
    const err = rawAction === 'CHARGEBACK'
      ? await registerChargeback(tenantId, p.id, { amount: Number(raw.amount ?? 0), date: parseDateOnly(raw.date) ?? new Date(), accountId: typeof raw.accountId === 'string' && raw.accountId ? raw.accountId : null, reason }, actor)
      : await undoChargeback(tenantId, p.id, reason, actor)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    return NextResponse.json({ success: true })
  }
  const b = raw as { action?: string; paidAt?: string; authorizationCode?: string }
  const action = rawAction
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

type Loaded = Extract<Awaited<ReturnType<typeof load>>, { p: unknown }>

async function saveFi(raw: Record<string, unknown>, user: Loaded['user'], p: Loaded['p']) {
  const parsed = fiPatchSchema.safeParse({ ...raw, action: 'FI' })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Dados inválidos.' }, { status: 400 })
  const data = buildFiUpdate(parsed.data)
  try {
    const before = await prisma.dealPayment.findUnique({
      where: { id: p.id },
      select: { returnPct: true, returnGrossValue: true, ilaValue: true, iofValue: true, irrfValue: true, returnNetValue: true, plusValue: true, contractNumber: true, addOns: true },
    })
    const updated = await prisma.dealPayment.update({
      where: { id: p.id },
      data: { ...data, addOns: data.addOns ? (data.addOns as unknown as Prisma.InputJsonValue) : Prisma.DbNull },
    })
    await createSafeAuditLog({ userId: user.id, tenantId: p.deal.tenantId ?? user.tenantId ?? null, action: 'PAYMENT_FI', entity: 'DealPayment', entityId: p.id, beforeData: before, afterData: data, userName: user.name ?? null, userRole: user.role })
    await syncDealFinanceSafe(p.dealId)
    return NextResponse.json({ success: true, data: { id: updated.id, ...data } })
  } catch (err) { return handlePrismaError(err) }
}

/** "Calcular pelo padrão da loja": bruto/ILA/IOF a partir da config de retorno do tenant. */
async function calcFi(raw: Record<string, unknown>, p: Loaded['p']) {
  const tenantId = p.deal.tenantId
  if (!tenantId) return NextResponse.json({ error: 'Pagamento sem loja.' }, { status: 400 })
  const deal = await prisma.deal.findUnique({
    where: { id: p.dealId },
    select: {
      returnRatePercent: true, approvedAt: true, saleDate: true, finalizedAt: true, createdAt: true,
      financeProposals: { orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true, createdAt: true } },
    },
  })
  const bodyPct = raw.returnPct == null || raw.returnPct === '' ? null : Number(raw.returnPct)
  const rate = bodyPct != null && Number.isFinite(bodyPct) && bodyPct > 0 ? bodyPct : Number(p.returnPct ?? deal?.returnRatePercent ?? 0)
  if (!(rate > 0)) return NextResponse.json({ error: 'Informe o retorno %.' }, { status: 400 })
  const base = Number(p.value)
  const fp = deal?.financeProposals?.[0]
  const date = deal?.approvedAt ?? fp?.updatedAt ?? fp?.createdAt ?? deal?.saleDate ?? deal?.finalizedAt ?? deal?.createdAt ?? new Date()
  try {
    const resolved = await resolveReturnSettingsForDate(tenantId, date)
    if (!resolved.range.active) return NextResponse.json({ error: 'Configuração de retorno/F&I inativa na loja.' }, { status: 400 })
    const range = validateReturnPercent(rate, resolved.range.minReturnPercent, resolved.range.maxReturnPercent)
    if (!range.ok) return NextResponse.json({ error: range.message }, { status: 400 })
    if (!resolved.ila && !resolved.range.allowMissingIlaAsZero) return NextResponse.json({ error: `ILA não cadastrado para a competência ${resolved.competence.label}.` }, { status: 400 })
    if (!resolved.iof && !resolved.range.allowMissingIofAsZero) return NextResponse.json({ error: 'IOF não cadastrado para a data da operação.' }, { status: 400 })
    const calc = calculateReturn({
      financedAmount: base, returnRatePercent: rate, ilaPercent: 0, iofPercent: 0,
      ilaType: resolved.ila?.valueType ?? 'PERCENTUAL', ilaValue: resolved.ila?.value ?? 0,
      iofType: resolved.iof?.valueType ?? 'PERCENTUAL', iofValue: resolved.iof?.value ?? 0,
      deductionBase: resolved.range.deductionBase,
      minReturnPercent: resolved.range.minReturnPercent, maxReturnPercent: resolved.range.maxReturnPercent,
    })
    return NextResponse.json({ success: true, data: { returnPct: round2(rate), returnGrossValue: calc.returnGrossValue, ilaValue: calc.ilaValue, iofValue: calc.iofValue, returnNetValue: calc.returnNetValue, competence: resolved.competence.label } })
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
