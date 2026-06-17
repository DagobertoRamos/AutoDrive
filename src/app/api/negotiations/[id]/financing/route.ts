// =============================================================================
// /api/negotiations/[id]/financing — F&I dentro da Negociação (Fase 8).
//   GET  : financing (read) — fichas ligadas ao Deal + prefill da negociação
//   POST : financing.manage —
//          • criar ficha ligada (proponentId [, bankId, installments]); ou
//          • aplicar à negociação ({ applyProposalId }): copia banco + valor
//            aprovado da ficha para deal.paymentBank/financedAmount (supervisão).
// Tenant-scoped. Só toca os campos financeiros da negociação no "aplicar".
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { linkedProposalSchema, applyProposalSchema } from '@/lib/validators/financing'
import { zodErrorResponse, ownsTenant, num } from '@/lib/finance/finance-service'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Negociação não encontrada.' }, { status: 404 })
const LOCKED: string[] = ['FINALIZADA', 'CANCELADA']

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing')) return forbiddenResponse('Sem acesso ao financiamento.')
  const { id } = await params
  try {
    const deal = await prisma.deal.findUnique({ where: { id }, select: { id: true, tenantId: true, status: true, financedAmount: true, signalAmount: true, paymentBank: true } })
    if (!deal) return notFound()
    if (!ownsTenant(user.role, user.tenantId, deal.tenantId)) return forbiddenResponse('Negociação de outro tenant.')

    const proposals = await prisma.financeProposal.findMany({
      where: { dealId: id }, orderBy: { createdAt: 'desc' },
      include: { proponent: { select: { nomeCompleto: true } }, bank: { select: { name: true } } },
    })
    return NextResponse.json({
      success: true,
      data: {
        prefill: { financedAmount: num(deal.financedAmount), signalAmount: num(deal.signalAmount), paymentBank: deal.paymentBank ?? null },
        locked: LOCKED.includes(deal.status),
        proposals: proposals.map((p) => ({
          id: p.id, status: p.status, proponentNome: p.proponent?.nomeCompleto ?? '—', bankNome: p.bank?.name ?? null,
          amountRequested: num(p.amountRequested), approvedValue: num(p.approvedValue), monthlyPayment: num(p.monthlyPayment),
          installments: p.installments, createdAt: p.createdAt,
        })),
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão.')
  const { id } = await params
  try {
    const deal = await prisma.deal.findUnique({ where: { id }, select: { id: true, tenantId: true, status: true, financedAmount: true, signalAmount: true } })
    if (!deal) return notFound()
    if (!ownsTenant(user.role, user.tenantId, deal.tenantId)) return forbiddenResponse('Negociação de outro tenant.')
    const tenantId = deal.tenantId ?? user.tenantId
    if (!tenantId) return forbiddenResponse('Negociação sem loja vinculada.')

    const body = await req.json().catch(() => ({}))

    // ── Aplicar uma ficha aprovada à negociação ──
    if (body?.applyProposalId) {
      if (LOCKED.includes(deal.status)) return forbiddenResponse('Negociação finalizada/cancelada: não é possível aplicar.')
      const { applyProposalId } = applyProposalSchema.parse(body)
      const p = await prisma.financeProposal.findUnique({ where: { id: applyProposalId }, include: { bank: { select: { name: true } } } })
      if (!p || p.dealId !== id) return NextResponse.json({ success: false, error: 'Ficha não vinculada a esta negociação.' }, { status: 404 })
      if (p.status !== 'APROVADA') return forbiddenResponse('Só é possível aplicar uma ficha aprovada.')
      const financed = num(p.approvedValue) || num(p.amountRequested)
      await prisma.deal.update({ where: { id }, data: { financedAmount: financed || null, paymentBank: p.bank?.name ?? null } })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'FI_APPLY', entity: 'Deal', entityId: id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true })
    }

    // ── Criar ficha ligada à negociação ──
    const d = linkedProposalSchema.parse(body)
    const proponent = await prisma.financeProponent.findFirst({ where: { id: d.proponentId, tenantId }, select: { id: true } })
    if (!proponent) return forbiddenResponse('Proponente inválido para esta loja.')
    if (d.bankId) {
      const bank = await prisma.financeBank.findFirst({ where: { id: d.bankId, tenantId }, select: { id: true } })
      if (!bank) return forbiddenResponse('Banco inválido para esta loja.')
    }
    const proposal = await prisma.financeProposal.create({
      data: {
        tenantId, dealId: id, proponentId: d.proponentId, bankId: d.bankId ?? null, sellerId: user.id,
        amountRequested: num(deal.financedAmount) || null, downPayment: num(deal.signalAmount) || null,
        installments: d.installments ?? null, status: 'SIMULACAO', createdById: user.id,
      },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'FI_LINK_CREATE', entity: 'FinanceProposal', entityId: proposal.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: proposal.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
