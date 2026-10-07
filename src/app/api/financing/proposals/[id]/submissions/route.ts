// =============================================================================
// /api/financing/proposals/[id]/submissions — propostas por banco (compatibilidade).
//   GET  : lista as tentativas por banco + linha do tempo.
//   POST : envio aos bancos — delega ao orquestrador do F&I Core (mesmas
//          travas de idempotência, permissões e campos exigidos de /send).
// Gate de documentos obrigatórios da loja mantido (override supervisionado).
// =============================================================================

import { NextResponse, after } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { submitProposalSchema } from '@/lib/validators/financing'
import { requiredDocsForProfile, pendingRequiredDocs, type RequiredDocsConfig } from '@/lib/finance/proposal-service'
import { dispatchAttempt, sendToBanks, validIdempotencyKey } from '@/lib/finance/fi/orchestrator'
import { ATTEMPT_STATUS_META } from '@/lib/finance/fi/status-core'
import { clientIp, fiAuth, fiErrorResponse, findScopedProposal, notFoundFicha } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req)
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    if (!(await findScopedProposal(auth, id))) return notFoundFicha()
    const submissions = await prisma.financeProposalSubmission.findMany({
      where: { proposalId: id }, orderBy: { submittedAt: 'desc' },
      include: { events: { orderBy: { createdAt: 'desc' } } },
    })
    const bankIds = [...new Set(submissions.map((s) => s.bankId).filter(Boolean))] as string[]
    const banks = bankIds.length ? await prisma.financeBank.findMany({ where: { id: { in: bankIds } }, select: { id: true, name: true } }) : []
    const bankMap = Object.fromEntries(banks.map((b) => [b.id, b.name]))
    return NextResponse.json({
      success: true,
      data: submissions.map((s) => ({
        id: s.id, bankId: s.bankId, bankName: s.bankId ? (bankMap[s.bankId] ?? '—') : '—', status: s.status,
        statusLabel: ATTEMPT_STATUS_META[s.status as keyof typeof ATTEMPT_STATUS_META]?.label ?? s.status,
        mode: s.mode, version: s.attemptVersion, active: s.active, submittedAt: s.submittedAt,
        events: s.events.map((e) => ({ id: e.id, type: e.type, status: e.status, message: e.message, source: e.source, createdAt: e.createdAt })),
      })),
    })
  } catch (err) { return fiErrorResponse(err) }
}

export async function POST(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'enviarFicha' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    const proposal = await findScopedProposal(auth, id)
    if (!proposal) return notFoundFicha()
    const raw = (await req.json()) as Record<string, unknown>
    const d = submitProposalSchema.parse(raw)

    // Gate de documentos obrigatórios (override supervisionado com force=true).
    const occ = await prisma.financeProponent.findUnique({ where: { id: proposal.proponentId }, select: { occupation: true } })
    const cfgRow = await prisma.financeTenantSetting.findUnique({ where: { tenantId_key: { tenantId: auth.tenantId, key: 'required_documents' } } })
    const required = requiredDocsForProfile((cfgRow?.value as RequiredDocsConfig) ?? {}, occ?.occupation ?? null)
    if (required.length && !d.force) {
      const docs = await prisma.financeProposalDocument.findMany({ where: { proposalId: id }, select: { type: true, status: true } })
      const pending = pendingRequiredDocs(required, docs)
      if (pending.length) return NextResponse.json({ success: false, error: 'Documentos obrigatórios pendentes.', pendingDocuments: pending }, { status: 422 })
    }
    const key = validIdempotencyKey(raw.idempotencyKey) ? raw.idempotencyKey : randomUUID()
    const res = await sendToBanks({
      proposalId: id, bankIds: d.bankIds, idempotencyKey: key, actor: auth.actor,
      consent: { confirmed: raw.consent === true, ip: clientIp(req), userAgent: req.headers.get('user-agent'), origin: 'INTERNO' },
    })
    if (d.force) await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'SUBMIT_FORCED', entity: 'FinanceProposal', entityId: id, userName: auth.user.name, userRole: auth.user.role })
    if (res.dispatch.length) after(async () => { await Promise.allSettled(res.dispatch.map((sid) => dispatchAttempt(sid))) })
    return NextResponse.json({ success: true, created: res.attempts.filter((a) => !a.duplicate).length, data: res.attempts }, { status: 201 })
  } catch (err) { return fiErrorResponse(err) }
}
