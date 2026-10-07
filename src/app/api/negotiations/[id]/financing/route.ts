// =============================================================================
// /api/negotiations/[id]/financing — F&I dentro da Negociação.
//   GET  : fichas ligadas à negociação (situação, próxima etapa, pagamento do banco)
//   POST : • criar ficha ligada (proponentId [, coProponentId, installments]) —
//            veículo, valor e entrada vêm da própria negociação;
//          • aplicar ({ applyProposalId }): escolhe a proposta aprovada e lança o
//            pagamento FINANCIAMENTO na negociação (previsão no financeiro).
// O F&I não tem venda paralela: tudo acontece sobre a MESMA negociação.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { linkedProposalSchema, applyProposalSchema } from '@/lib/validators/financing'
import { num } from '@/lib/finance/finance-service'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { FiError, linkFinancingToDeal, nextFiCode, selectOffer } from '@/lib/finance/fi/orchestrator'
import { addTimeline } from '@/lib/finance/fi/events'
import { FUNDING_META, PROPOSAL_STATUS_META, type ProposalStatus } from '@/lib/finance/fi/status-core'
import { fiAuth, fiErrorResponse } from '@/lib/finance/fi/route'
import { isFiAllowed } from '@/lib/finance/fi-permissions'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Negociação não encontrada.' }, { status: 404 })
const LOCKED: string[] = ['FINALIZADA', 'CANCELADA']

async function loadDeal(user: Parameters<typeof buildNegotiationAccessWhere>[0], id: string, tenantId: string) {
  return prisma.deal.findFirst({
    where: { AND: [await buildNegotiationAccessWhere(user, { id }), { tenantId }] },
    select: { id: true, tenantId: true, status: true, financedAmount: true, signalAmount: true, saleAmount: true, paymentBank: true, sellerId: true, customerId: true },
  })
}

export async function GET(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req)
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    const deal = await loadDeal(auth.user, id, auth.tenantId)
    if (!deal) return notFound()
    const proposals = await prisma.financeProposal.findMany({
      where: { dealId: id, tenantId: auth.tenantId }, orderBy: { createdAt: 'desc' },
      include: { proponent: { select: { nomeCompleto: true, razaoSocial: true, personType: true } }, bank: { select: { name: true } } },
    })
    return NextResponse.json({
      success: true,
      data: {
        prefill: { financedAmount: num(deal.financedAmount), signalAmount: num(deal.signalAmount), paymentBank: deal.paymentBank ?? null },
        locked: LOCKED.includes(deal.status),
        proposals: proposals.map((p) => ({
          id: p.id, code: p.code, status: p.status, statusLabel: PROPOSAL_STATUS_META[p.status as ProposalStatus]?.label ?? p.status,
          statusTone: PROPOSAL_STATUS_META[p.status as ProposalStatus]?.tone ?? 'neutral',
          proponentNome: p.proponent.personType === 'PJ' ? (p.proponent.razaoSocial ?? p.proponent.nomeCompleto) : p.proponent.nomeCompleto,
          bankNome: p.bank?.name ?? null, amountRequested: num(p.amountRequested), approvedValue: num(p.approvedValue), monthlyPayment: num(p.monthlyPayment),
          installments: p.installments, createdAt: p.createdAt, selected: !!p.selectedSubmissionId, appliedToDeal: !!p.dealPaymentId,
          funding: FUNDING_META[p.fundingStatus as keyof typeof FUNDING_META]?.label ?? null, fundingStatus: p.fundingStatus,
        })),
      },
    })
  } catch (err) { return fiErrorResponse(err) }
}

export async function POST(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    const deal = await loadDeal(auth.user, id, auth.tenantId)
    if (!deal) return notFound()
    const body = await req.json().catch(() => ({}))

    // ── Aplicar a proposta aprovada à negociação ──
    if (body?.applyProposalId) {
      if (LOCKED.includes(deal.status)) throw new FiError('Negociação finalizada ou cancelada: não é possível aplicar.', 409)
      if (!(await isFiAllowed(auth.tenantId, 'enviarFicha', auth.user.role))) throw new FiError('Seu perfil não pode escolher a proposta do banco.', 403)
      const { applyProposalId } = applyProposalSchema.parse(body)
      const p = await prisma.financeProposal.findFirst({ where: { id: applyProposalId, dealId: id, tenantId: auth.tenantId } })
      if (!p) return NextResponse.json({ success: false, error: 'Ficha não vinculada a esta negociação.' }, { status: 404 })
      if (!p.selectedSubmissionId) {
        const approved = await prisma.financeProposalSubmission.findMany({ where: { proposalId: p.id, active: true, status: 'APROVADA' }, select: { id: true } })
        if (approved.length !== 1) throw new FiError(approved.length ? 'Há mais de uma proposta aprovada: escolha qual usar na ficha.' : 'Esta ficha não tem proposta aprovada pelo banco.', 409)
        await selectOffer(p.id, approved[0].id, auth.actor)
      } else {
        await linkFinancingToDeal(p.id, auth.actor)
      }
      await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'FI_APPLY', entity: 'Deal', entityId: id, userName: auth.user.name, userRole: auth.user.role })
      return NextResponse.json({ success: true })
    }

    // ── Criar ficha ligada à negociação ──
    if (!(await isFiAllowed(auth.tenantId, 'criarFicha', auth.user.role))) throw new FiError('Seu perfil não pode criar fichas.', 403)
    const d = linkedProposalSchema.parse(body)
    const proponent = await prisma.financeProponent.findFirst({ where: { id: d.proponentId, tenantId: auth.tenantId }, select: { id: true } })
    if (!proponent) throw new FiError('Cliente da ficha inválido para esta loja.', 400)
    if (d.bankId && !(await prisma.financeBank.findFirst({ where: { id: d.bankId, tenantId: auth.tenantId }, select: { id: true } }))) throw new FiError('Banco inválido para esta loja.', 400)
    const coProponentId = typeof body?.coProponentId === 'string' ? body.coProponentId : null
    if (coProponentId && (coProponentId === d.proponentId || !(await prisma.financeProponent.findFirst({ where: { id: coProponentId, tenantId: auth.tenantId }, select: { id: true } })))) throw new FiError('Co-comprador inválido.', 400)
    const open = await prisma.financeProposal.findFirst({ where: { tenantId: auth.tenantId, dealId: id, proponentId: d.proponentId, status: { notIn: ['CANCELADA', 'EXPIRADA', 'RECUSADA'] } }, select: { id: true, code: true } })
    if (open) return NextResponse.json({ success: false, error: `Já existe a ficha ${open.code ?? ''} aberta para este cliente nesta negociação.`, code: 'FICHA_EXISTENTE', id: open.id }, { status: 409 })

    const sold = await prisma.dealVehicle.findFirst({ where: { dealId: id, role: 'VENDIDO' }, orderBy: { createdAt: 'asc' }, select: { vehicleId: true, brand: true, model: true, year: true, plate: true, agreedValue: true } })
    const vehicleValue = num(sold?.agreedValue) || num(deal.saleAmount) || null
    const downPayment = num(deal.signalAmount) || null
    const amount = num(deal.financedAmount) || (vehicleValue != null ? Math.max(0, vehicleValue - (downPayment ?? 0)) : null)
    const vehicle = sold ? [sold.brand, sold.model, sold.year, sold.plate].filter(Boolean).join(' ') : null
    const proposal = await prisma.$transaction(async (tx) => {
      const code = await nextFiCode(tx, auth.tenantId)
      const created = await tx.financeProposal.create({
        data: {
          tenantId: auth.tenantId, code, dealId: id, proponentId: d.proponentId, coProponentId, bankId: d.bankId ?? null, sellerId: deal.sellerId ?? null,
          customerId: deal.customerId ?? null, vehicleId: sold?.vehicleId ?? null, vehicle, vehicleValue, amountRequested: amount, downPayment,
          installments: d.installments ?? null, status: 'SIMULACAO', origin: 'NEGOCIACAO', createdById: auth.user.id,
        },
      })
      await addTimeline(tx, { tenantId: auth.tenantId, proposalId: created.id, type: 'SYSTEM', source: 'MANUAL', actorId: auth.user.id, message: 'Ficha criada a partir da negociação.' })
      return created
    })
    await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'FI_LINK_CREATE', entity: 'FinanceProposal', entityId: proposal.id, userName: auth.user.name, userRole: auth.user.role })
    return NextResponse.json({ success: true, data: { id: proposal.id, code: proposal.code } }, { status: 201 })
  } catch (err) { return fiErrorResponse(err) }
}
