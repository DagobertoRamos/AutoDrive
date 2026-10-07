// =============================================================================
// F&I — números da Visão geral, "Precisa da sua atenção", "Aguardando bancos"
// e desempenho por banco. Consultas agregadas no servidor (nada de carregar
// milhares de fichas no navegador).
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const SIGNED = ['ASSINADA', 'CONCLUIDA']
const OPEN_STATUS = ['SIMULACAO', 'PREENCHENDO', 'ENVIADA', 'EM_ANALISE', 'PRE_APROVADA', 'APROVADA'] as const

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1) }
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

export interface AttentionItem { key: string; count: number; label: string; href: string; tone: 'warning' | 'danger' | 'info' }

export async function buildDashboard(tenantId: string, scope: Prisma.FinanceProposalWhereInput) {
  const base: Prisma.FinanceProposalWhereInput = { AND: [{ tenantId }, scope] }
  const w = (extra: Prisma.FinanceProposalWhereInput): Prisma.FinanceProposalWhereInput => ({ AND: [base, extra] })
  const today = startOfDay()
  const month = startOfMonth()

  const [sentToday, approved, inAnalysis, pendingAttempts, approvedSum, waiting, docsPending, awaitingSignature, slowPayment, verifying, manualToRegister, expiringSoon, stale, docsToReview, bankAsked] = await Promise.all([
    prisma.financeProposal.count({ where: w({ submissions: { some: { submittedAt: { gte: today } } } }) }),
    prisma.financeProposal.count({ where: w({ status: 'APROVADA', fundingStatus: { not: 'PAGO' } }) }),
    prisma.financeProposal.count({ where: w({ status: { in: ['ENVIADA', 'EM_ANALISE', 'PRE_APROVADA'] } }) }),
    prisma.financeProposal.count({ where: w({ OR: [{ submissions: { some: { active: true, status: { in: ['PENDENTE', 'VERIFICANDO'] } } } }, { formalizationStatus: 'COM_PENDENCIA' }, { lienStatus: 'COM_PENDENCIA' }, { fundingStatus: { in: ['COM_PENDENCIA', 'BLOQUEADO'] } }] }) }),
    prisma.financeProposal.aggregate({ where: w({ status: 'APROVADA', selectedSubmissionId: { not: null }, updatedAt: { gte: month } }), _sum: { approvedValue: true } }),
    prisma.financeProposal.aggregate({ where: w({ fundingStatus: { in: ['AGUARDANDO', 'ENVIADO_PAGAMENTO', 'PAGO_PARCIAL'] }, formalizationStatus: { in: SIGNED } }), _sum: { approvedValue: true }, _count: true }),
    prisma.financeProposal.count({ where: w({ status: { in: [...OPEN_STATUS] }, documents: { some: { status: 'PENDENTE', required: true } } }) }),
    prisma.financeProposal.count({ where: w({ formalizationStatus: 'AGUARDANDO_ASSINATURA', status: 'APROVADA' }) }),
    prisma.financeProposal.count({ where: w({ fundingStatus: { in: ['AGUARDANDO', 'ENVIADO_PAGAMENTO'] }, formalizationStatus: { in: SIGNED }, contractSignedAt: { lt: daysAgo(3) } }) }),
    prisma.financeProposal.count({ where: w({ submissions: { some: { active: true, status: 'VERIFICANDO' } } }) }),
    prisma.financeProposal.count({ where: w({ status: { not: 'CANCELADA' }, submissions: { some: { active: true, mode: 'MANUAL', status: 'ENVIADA', submittedAt: { lt: new Date(Date.now() - 2 * 3_600_000) } } } }) }),
    prisma.financeProposal.count({ where: w({ selectedSubmissionId: null, submissions: { some: { active: true, status: { in: ['APROVADA', 'PRE_APROVADA'] }, expiresAt: { gte: new Date(), lte: new Date(Date.now() + 3 * 86_400_000) } } } }) }),
    prisma.financeProposal.count({ where: w({ status: { in: ['ENVIADA', 'EM_ANALISE', 'PRE_APROVADA', 'APROVADA'] }, fundingStatus: { not: 'PAGO' }, updatedAt: { lt: daysAgo(5) } }) }),
    prisma.financeProposal.count({ where: w({ status: { not: 'CANCELADA' }, documents: { some: { status: 'ENVIADO' } } }) }),
    prisma.financeProposal.count({ where: w({ selectedSubmissionId: null, status: { not: 'CANCELADA' }, submissions: { some: { active: true, status: 'PENDENTE' } } }) }),
  ])

  const attention: AttentionItem[] = []
  const add = (key: string, count: number, one: string, many: string, href: string, tone: AttentionItem['tone']) => {
    if (count > 0) attention.push({ key, count, label: count === 1 ? one : many.replace('{n}', String(count)), href, tone })
  }
  add('docs', docsPending, '1 cliente precisa enviar documentos', '{n} clientes precisam enviar documentos', '/financiamento/fichas?etapa=pendencias', 'warning')
  add('conferir', docsToReview, '1 ficha com documento recebido para conferir', '{n} fichas com documentos recebidos para conferir', '/financiamento/fichas?etapa=pendencias', 'info')
  add('banco-pediu', bankAsked, '1 banco pediu mais informações', '{n} bancos pediram mais informações', '/financiamento/fichas?etapa=pendencias', 'warning')
  add('assinatura', awaitingSignature, '1 contrato aguarda assinatura', '{n} contratos aguardam assinatura', '/financiamento/formalizacao', 'warning')
  add('pagamento', slowPayment, '1 banco está demorando para pagar', '{n} bancos estão demorando para pagar', '/financiamento/aguardando-pagamento', 'danger')
  add('verificando', verifying, '1 proposta sem resposta do banco', '{n} propostas sem resposta do banco', '/financiamento/fichas?etapa=pendencias', 'danger')
  add('registrar', manualToRegister, '1 resposta de banco para registrar', '{n} respostas de banco para registrar', '/financiamento/fichas?etapa=analise', 'info')
  add('expira', expiringSoon, '1 aprovação vence nos próximos dias', '{n} aprovações vencem nos próximos dias', '/financiamento/fichas?etapa=aprovadas', 'warning')
  add('parada', stale, '1 ficha parada há mais de 5 dias', '{n} fichas paradas há mais de 5 dias', '/financiamento/fichas?etapa=analise', 'info')

  return {
    cards: {
      sentToday, approved, inAnalysis, pending: pendingAttempts,
      approvedCredit: Number(approvedSum._sum.approvedValue ?? 0),
      awaitingPayment: { count: waiting._count, amount: Number(waiting._sum.approvedValue ?? 0) },
    },
    attention,
  }
}

export async function listAwaitingPayment(tenantId: string, scope: Prisma.FinanceProposalWhereInput) {
  const rows = await prisma.financeProposal.findMany({
    where: { AND: [{ tenantId }, scope, { fundingStatus: { in: ['AGUARDANDO', 'ENVIADO_PAGAMENTO', 'COM_PENDENCIA', 'BLOQUEADO', 'PAGO_PARCIAL'] }, status: 'APROVADA', selectedSubmissionId: { not: null } }] },
    orderBy: [{ contractSignedAt: 'asc' }, { updatedAt: 'asc' }], take: 200,
    select: {
      id: true, code: true, approvedValue: true, fundedAmount: true, fundingStatus: true, formalizationStatus: true, contractSignedAt: true, fundingExpectedAt: true, updatedAt: true, dealId: true,
      bank: { select: { name: true } }, proponent: { select: { nomeCompleto: true, razaoSocial: true, personType: true } },
    },
  })
  return rows.map((r) => {
    const since = r.contractSignedAt ?? r.updatedAt
    return {
      id: r.id, code: r.code, bankName: r.bank?.name ?? 'Banco', customer: r.proponent.personType === 'PJ' ? (r.proponent.razaoSocial ?? r.proponent.nomeCompleto) : r.proponent.nomeCompleto,
      amount: Number(r.approvedValue ?? 0), paid: r.fundedAmount ? Number(r.fundedAmount) : null, fundingStatus: r.fundingStatus,
      signed: SIGNED.includes(r.formalizationStatus), waitingDays: Math.max(0, Math.floor((Date.now() - since.getTime()) / 86_400_000)),
      expectedAt: r.fundingExpectedAt?.toISOString() ?? null, dealId: r.dealId,
    }
  })
}

/** Desempenho por banco (histórico próprio da loja). É recomendação, nunca aprovação. */
export async function bankPerformance(tenantId: string, from: Date, to: Date) {
  const subs = await prisma.financeProposalSubmission.findMany({
    where: { tenantId, submittedAt: { gte: from, lte: to }, status: { notIn: ['SUBSTITUIDA', 'FALHA_ENVIO', 'CANCELADA'] } },
    select: { bankId: true, status: true, submittedAt: true, respondedAt: true, returnPercent: true, approvedAmount: true, proposalId: true },
  })
  const bankIds = [...new Set(subs.map((s) => s.bankId).filter(Boolean))] as string[]
  const [banks, paid] = await Promise.all([
    prisma.financeBank.findMany({ where: { id: { in: bankIds } }, select: { id: true, name: true } }),
    prisma.financeProposal.findMany({ where: { tenantId, fundedAt: { gte: from, lte: to }, contractSignedAt: { not: null }, bankId: { in: bankIds } }, select: { bankId: true, fundedAt: true, contractSignedAt: true } }),
  ])
  const name = new Map(banks.map((b) => [b.id, b.name]))
  return bankIds.map((id) => {
    const list = subs.filter((s) => s.bankId === id)
    const decided = list.filter((s) => ['APROVADA', 'PRE_APROVADA', 'RECUSADA'].includes(s.status))
    const ok = decided.filter((s) => s.status !== 'RECUSADA')
    const resp = list.filter((s) => s.respondedAt).map((s) => (s.respondedAt!.getTime() - s.submittedAt.getTime()) / 60000)
    const pays = paid.filter((p) => p.bankId === id).map((p) => (p.fundedAt!.getTime() - p.contractSignedAt!.getTime()) / 86_400_000)
    const rets = list.filter((s) => s.returnPercent != null).map((s) => Number(s.returnPercent))
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
    return {
      bankId: id, bankName: name.get(id) ?? 'Banco', sent: list.length, decided: decided.length,
      approvalRate: decided.length ? Math.round((ok.length / decided.length) * 1000) / 10 : null,
      avgResponseMinutes: avg(resp) != null ? Math.round(avg(resp)!) : null,
      avgPaymentDays: avg(pays) != null ? Math.round(avg(pays)! * 10) / 10 : null,
      avgReturnPercent: avg(rets) != null ? Math.round(avg(rets)! * 100) / 100 : null,
    }
  }).sort((a, b) => b.sent - a.sent)
}

/**
 * Sugestão por histórico (mín. 5 decisões no banco). Texto sempre como
 * recomendação: a decisão continua sendo da instituição financeira.
 */
export function historySuggestion(perf: Awaited<ReturnType<typeof bankPerformance>>): string | null {
  const eligible = perf.filter((p) => p.decided >= 5 && p.approvalRate != null)
  if (eligible.length < 2) return null
  const best = [...eligible].sort((a, b) => (b.approvalRate ?? 0) - (a.approvalRate ?? 0))[0]
  return `Com base no histórico desta loja, o ${best.bankName} tem apresentado maior aprovação (${best.approvalRate}%). Isso não é aprovação — a decisão é sempre do banco.`
}
