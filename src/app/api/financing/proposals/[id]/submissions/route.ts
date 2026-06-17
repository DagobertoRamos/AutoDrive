// =============================================================================
// /api/financing/proposals/[id]/submissions — envio multi-banco da ficha.
//   GET  : financing (read) — submissões por banco + linha do tempo (eventos)
//   POST : financing.manage — envia a ficha a N bancos via adapter.
// Hoje todo envio usa o ManualAdapter (registro supervisionado, sem chamada
// externa). Gate: documentos obrigatórios devem estar APROVADOS (override com
// force=true, supervisionado e auditado). Sem RPA oculto.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { submitProposalSchema } from '@/lib/validators/financing'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { requiredDocsForProfile, pendingRequiredDocs, type RequiredDocsConfig } from '@/lib/finance/proposal-service'
import { getAdapter } from '@/lib/finance/adapters'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Ficha não encontrada.' }, { status: 404 })

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing')) return forbiddenResponse('Sem acesso ao financiamento.')
  const { id } = await params
  try {
    const proposal = await prisma.financeProposal.findUnique({ where: { id }, select: { id: true, tenantId: true } })
    if (!proposal) return notFound()
    if (!ownsTenant(user.role, user.tenantId, proposal.tenantId)) return forbiddenResponse('Ficha de outro tenant.')

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
        externalId: s.externalId, environment: s.environment, submittedAt: s.submittedAt,
        events: s.events.map((e) => ({ id: e.id, type: e.type, status: e.status, message: e.message, source: e.source, createdAt: e.createdAt })),
      })),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão para enviar fichas.')
  const { id } = await params
  try {
    const proposal = await prisma.financeProposal.findUnique({ where: { id }, include: { proponent: { select: { occupation: true } } } })
    if (!proposal) return notFound()
    if (!ownsTenant(user.role, user.tenantId, proposal.tenantId)) return forbiddenResponse('Ficha de outro tenant.')
    const tenantId = proposal.tenantId ?? user.tenantId
    if (!tenantId) return forbiddenResponse('Ficha sem loja vinculada.')

    const d = submitProposalSchema.parse(await req.json())

    // Só bancos da loja.
    const banks = await prisma.financeBank.findMany({ where: { tenantId, id: { in: d.bankIds } }, select: { id: true } })
    const ownedIds = banks.map((b) => b.id)
    if (ownedIds.length === 0) return forbiddenResponse('Nenhum banco válido para esta loja.')

    // Gate de documentos obrigatórios (override supervisionado com force=true).
    const cfgRow = await prisma.financeTenantSetting.findUnique({ where: { tenantId_key: { tenantId, key: 'required_documents' } } })
    const required = requiredDocsForProfile((cfgRow?.value as RequiredDocsConfig) ?? {}, proposal.proponent?.occupation ?? null)
    if (required.length && !d.force) {
      const docs = await prisma.financeProposalDocument.findMany({ where: { proposalId: id }, select: { type: true, status: true } })
      const pending = pendingRequiredDocs(required, docs)
      if (pending.length) {
        return NextResponse.json({ success: false, error: 'Documentos obrigatórios pendentes.', pendingDocuments: pending }, { status: 422 })
      }
    }

    const adapter = getAdapter('MANUAL')
    const ctx = { tenantId, environment: 'HOMOLOGACAO' as const }
    const created: string[] = []
    for (const bankId of ownedIds) {
      const result = await adapter.submit({ proposalId: id, bankId, proponent: {} }, ctx)
      const submission = await prisma.financeProposalSubmission.create({
        data: {
          tenantId, proposalId: id, bankId, providerId: null, environment: 'HOMOLOGACAO',
          externalId: result.externalId, status: result.status, requestPayload: (result.requestPayload ?? null) as never,
          submittedById: user.id,
          events: { create: { tenantId, proposalId: id, type: 'STATUS_CHANGE', status: result.status, message: result.message ?? null, source: result.source, createdById: user.id } },
        },
      })
      created.push(submission.id)
    }

    // Primeira saída de SIMULAÇÃO → ENVIADA.
    if (proposal.status === 'SIMULACAO') {
      await prisma.financeProposal.update({ where: { id }, data: { status: 'ENVIADA' } })
    }
    await createSafeAuditLog({ userId: user.id, tenantId, action: d.force ? 'SUBMIT_FORCED' : 'SUBMIT', entity: 'FinanceProposal', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, created: created.length }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
