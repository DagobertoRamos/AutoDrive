// =============================================================================
// /api/financing/proposals — fichas de financiamento (F&I Core). Multi-loja.
//   GET  : lista paginada com filtros no servidor
//          ?status=&etapa=&bankId=&proponentId=&dealId=&q=&page=&pageSize=
//   POST : cria ficha (nasce como Rascunho, com código FI-AAAA-NNNNNN)
// Vendedor vê só as próprias fichas. Retorno nunca sai nesta lista.
// =============================================================================

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { createProposalSchema } from '@/lib/validators/financing'
import { num } from '@/lib/finance/finance-service'
import { tenantRefError } from '@/lib/finance/tenant-refs'
import { nextFiCode } from '@/lib/finance/fi/orchestrator'
import { addTimeline, reflectOnCrm } from '@/lib/finance/fi/events'
import { PROPOSAL_STATUS, PROPOSAL_STATUS_META, FUNDING_META, FORMALIZATION_META, type ProposalStatus } from '@/lib/finance/fi/status-core'
import { maskDoc } from '@/lib/finance/fi/read-model'
import { fiAuth, fiErrorResponse, proposalScope } from '@/lib/finance/fi/route'

const STAGES: Record<string, Prisma.FinanceProposalWhereInput> = {
  // Atalhos de etapa usados pelas telas (sem lógica no cliente).
  analise: { status: { in: ['ENVIADA', 'EM_ANALISE', 'PRE_APROVADA'] } },
  aprovadas: { status: 'APROVADA' },
  formalizacao: { selectedSubmissionId: { not: null }, status: 'APROVADA', fundingStatus: { notIn: ['PAGO'] } },
  pagamento: { fundingStatus: { in: ['AGUARDANDO', 'ENVIADO_PAGAMENTO', 'COM_PENDENCIA', 'BLOQUEADO', 'PAGO_PARCIAL'] }, formalizationStatus: { in: ['ASSINADA', 'CONCLUIDA'] } },
  pendencias: { status: { not: 'CANCELADA' }, OR: [{ submissions: { some: { active: true, status: { in: ['PENDENTE', 'VERIFICANDO'] } } } }, { documents: { some: { status: 'ENVIADO' } } }, { formalizationStatus: 'COM_PENDENCIA' }, { lienStatus: 'COM_PENDENCIA' }, { fundingStatus: { in: ['COM_PENDENCIA', 'BLOQUEADO'] } }] },
  concluidas: { fundingStatus: 'PAGO' },
}

export async function GET(req: Request) {
  const auth = await fiAuth(req)
  if (!auth.ok) return auth.res
  try {
    const sp = new URL(req.url).searchParams
    const page = Math.max(1, Number(sp.get('page')) || 1)
    const pageSize = Math.min(100, Math.max(10, Number(sp.get('pageSize')) || 25))
    const and: Prisma.FinanceProposalWhereInput[] = [{ tenantId: auth.tenantId }, (await proposalScope(auth.user)) as Prisma.FinanceProposalWhereInput]
    const status = sp.get('status')
    if (status && (PROPOSAL_STATUS as readonly string[]).includes(status)) and.push({ status: status as ProposalStatus })
    const stage = sp.get('etapa')
    if (stage && STAGES[stage]) and.push(STAGES[stage])
    for (const k of ['bankId', 'proponentId', 'dealId', 'leadId'] as const) { const v = sp.get(k); if (v) and.push({ [k]: v }) }
    const q = sp.get('q')?.trim()
    if (q) {
      const digits = q.replace(/\D/g, '')
      and.push({ OR: [
        { code: { contains: q, mode: 'insensitive' } },
        { vehicle: { contains: q, mode: 'insensitive' } },
        { proponent: { is: { nomeCompleto: { contains: q, mode: 'insensitive' } } } },
        { proponent: { is: { razaoSocial: { contains: q, mode: 'insensitive' } } } },
        ...(digits.length >= 3 ? [{ proponent: { is: { cpf: { contains: digits } } } }, { proponent: { is: { cnpj: { contains: digits } } } }] : []),
      ] })
    }
    const where: Prisma.FinanceProposalWhereInput = { AND: and }
    const [total, rows] = await Promise.all([
      prisma.financeProposal.count({ where }),
      prisma.financeProposal.findMany({
        where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize,
        include: {
          proponent: { select: { nomeCompleto: true, razaoSocial: true, personType: true, cpf: true, cnpj: true } },
          bank: { select: { name: true } },
          submissions: { where: { active: true }, select: { status: true, bankId: true } },
        },
      }),
    ])
    const data = rows.map((p) => ({
      id: p.id, code: p.code, status: p.status, statusLabel: PROPOSAL_STATUS_META[p.status as ProposalStatus]?.label ?? p.status,
      statusTone: PROPOSAL_STATUS_META[p.status as ProposalStatus]?.tone ?? 'neutral',
      vehicle: p.vehicle, installments: p.installments, amountRequested: num(p.amountRequested), downPayment: num(p.downPayment),
      approvedValue: num(p.approvedValue), monthlyPayment: num(p.monthlyPayment), createdAt: p.createdAt, updatedAt: p.updatedAt,
      proponentId: p.proponentId, bankId: p.bankId, dealId: p.dealId,
      proponentNome: p.proponent.personType === 'PJ' ? (p.proponent.razaoSocial ?? p.proponent.nomeCompleto) : p.proponent.nomeCompleto,
      proponentDoc: maskDoc(p.proponent.personType === 'PJ' ? p.proponent.cnpj : p.proponent.cpf),
      // compatibilidade com telas antigas
      proponentCpf: maskDoc(p.proponent.cpf),
      bankNome: p.bank?.name ?? null, banksCount: new Set(p.submissions.map((s) => s.bankId)).size,
      pending: p.submissions.some((s) => s.status === 'PENDENTE'),
      formalization: FORMALIZATION_META[p.formalizationStatus as keyof typeof FORMALIZATION_META]?.label ?? null,
      funding: FUNDING_META[p.fundingStatus as keyof typeof FUNDING_META]?.label ?? null,
      fundingStatus: p.fundingStatus,
    }))
    return NextResponse.json({ success: true, data, total, page, pageSize })
  } catch (err) { return fiErrorResponse(err) }
}

export async function POST(req: Request) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'criarFicha' })
  if (!auth.ok) return auth.res
  try {
    const d = createProposalSchema.parse(await req.json())
    const refErr = await tenantRefError(auth.tenantId, d)
    if (refErr) return NextResponse.json({ success: false, error: refErr }, { status: 400 })
    if (d.coProponentId && d.coProponentId === d.proponentId) return NextResponse.json({ success: false, error: 'O co-comprador precisa ser outra pessoa.' }, { status: 400 })
    // Uma ficha aberta por cliente + negociação (evita ficha duplicada).
    if (d.dealId) {
      const open = await prisma.financeProposal.findFirst({ where: { tenantId: auth.tenantId, dealId: d.dealId, proponentId: d.proponentId, status: { notIn: ['CANCELADA', 'EXPIRADA', 'RECUSADA'] } }, select: { id: true, code: true } })
      if (open) return NextResponse.json({ success: false, error: `Já existe a ficha ${open.code ?? ''} aberta para este cliente nesta negociação.`, code: 'FICHA_EXISTENTE', id: open.id }, { status: 409 })
    }
    const amount = d.amountRequested ?? (d.vehicleValue != null ? Math.max(0, d.vehicleValue - (d.downPayment ?? 0)) : null)
    const proposal = await prisma.$transaction(async (tx) => {
      const code = await nextFiCode(tx, auth.tenantId)
      const created = await tx.financeProposal.create({
        data: {
          tenantId: auth.tenantId, code, proponentId: d.proponentId, coProponentId: d.coProponentId ?? null, bankId: d.bankId ?? null, sellerId: d.sellerId ?? null,
          dealId: d.dealId ?? null, vehicleId: d.vehicleId ?? null, leadId: d.leadId ?? null, customerId: d.customerId ?? null,
          vehicle: d.vehicle ?? null, vehicleValue: d.vehicleValue ?? null, amountRequested: amount, downPayment: d.downPayment ?? null,
          installments: d.installments ?? null, status: 'SIMULACAO', origin: d.dealId ? 'NEGOCIACAO' : d.leadId ? 'CRM' : 'INTERNO',
          notes: d.notes ?? null, createdById: auth.user.id,
        },
      })
      await addTimeline(tx, { tenantId: auth.tenantId, proposalId: created.id, type: 'SYSTEM', source: 'MANUAL', actorId: auth.user.id, message: 'Ficha criada.' })
      return created
    })
    await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'CREATE', entity: 'FinanceProposal', entityId: proposal.id, userName: auth.user.name, userRole: auth.user.role })
    if (proposal.leadId) await reflectOnCrm(proposal.id, 'FICHA_PREENCHIDA')
    return NextResponse.json({ success: true, data: { id: proposal.id, code: proposal.code } }, { status: 201 })
  } catch (err) { return fiErrorResponse(err) }
}
