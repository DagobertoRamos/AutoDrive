// =============================================================================
// F&I — visão do CLIENTE (link seguro). Linguagem simples; nada interno:
// sem retorno, comissão, ranking comercial, ids externos ou nome de vendedor.
// =============================================================================

import { prisma } from '@/lib/prisma'

export interface PortalView {
  store: string
  code: string | null
  customerFirstName: string
  vehicle: string | null
  headline: string
  detail: string | null
  step: 'PREPARANDO' | 'ANALISE' | 'DOCUMENTOS' | 'APROVADO' | 'ASSINATURA' | 'CONTRATO_ASSINADO' | 'CONCLUIDO' | 'ENCERRADO'
  documents: { id: string; type: string; status: string; label: string; canUpload: boolean }[]
  offer: null | { bank: string; amount: number | null; downPayment: number | null; installments: number | null; installmentValue: number | null; rateMonthly: number | null; cetMonthly: number | null; cetYearly: number | null; total: number | null }
  expiresAt: string | null
}

const num = (v: unknown) => (v == null ? null : Number(v))
// Rótulos para o CLIENTE (sem jargão interno de conferência).
const CUSTOMER_DOC_LABEL: Record<string, string> = { PENDENTE: 'Pendente', ENVIADO: 'Recebido', APROVADO: 'Aprovado', REPROVADO: 'Precisa enviar de novo' }

export async function buildPortalView(proposalId: string): Promise<PortalView> {
  const p = await prisma.financeProposal.findUniqueOrThrow({
    where: { id: proposalId },
    include: { proponent: { select: { nomeCompleto: true, razaoSocial: true, personType: true } } },
  })
  const [tenant, docs, selected, active] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: p.tenantId! }, select: { name: true } }),
    prisma.financeProposalDocument.findMany({ where: { proposalId }, orderBy: { createdAt: 'asc' }, select: { id: true, type: true, status: true } }),
    p.selectedSubmissionId ? prisma.financeProposalSubmission.findUnique({ where: { id: p.selectedSubmissionId } }) : null,
    prisma.financeProposalSubmission.findMany({ where: { proposalId, active: true }, select: { status: true } }),
  ])
  const pendingDocs = docs.filter((d) => d.status === 'PENDENTE' || d.status === 'REPROVADO')
  const name = (p.proponent.personType === 'PJ' ? p.proponent.razaoSocial : p.proponent.nomeCompleto) ?? ''
  let step: PortalView['step'] = 'PREPARANDO'
  let headline = 'Estamos preparando a sua ficha de financiamento.'
  let detail: string | null = null
  if (p.status === 'CANCELADA' || p.status === 'EXPIRADA') { step = 'ENCERRADO'; headline = 'Esta ficha foi encerrada.'; detail = 'Fale com a loja para continuar.' }
  else if (p.fundingStatus === 'PAGO') { step = 'CONCLUIDO'; headline = 'Financiamento concluído.'; detail = 'O banco já realizou o pagamento.' }
  else if (p.formalizationStatus === 'ASSINADA' || p.formalizationStatus === 'CONCLUIDA') { step = 'CONTRATO_ASSINADO'; headline = 'Contrato assinado.'; detail = 'Agora é com o banco: avisamos quando o pagamento for concluído.' }
  else if (p.formalizationStatus === 'AGUARDANDO_ASSINATURA') { step = 'ASSINATURA'; headline = 'Falta a sua assinatura no contrato.'; detail = 'A loja vai orientar como assinar.' }
  else if (pendingDocs.length) { step = 'DOCUMENTOS'; headline = pendingDocs.length === 1 ? 'Precisamos de 1 documento.' : `Precisamos de ${pendingDocs.length} documentos.`; detail = 'Envie por aqui mesmo, com foto ou PDF.' }
  else if (p.status === 'APROVADA') { step = 'APROVADO'; headline = 'Crédito aprovado!'; detail = 'A loja vai seguir com o contrato.' }
  else if (p.status === 'PRE_APROVADA') { step = 'ANALISE'; headline = 'Crédito pré-aprovado.'; detail = 'O banco ainda está concluindo a análise.' }
  else if (p.status === 'RECUSADA') { step = 'ENCERRADO'; headline = 'Não foi possível aprovar agora.'; detail = 'A loja vai entrar em contato com outras opções.' }
  else if (active.length) { step = 'ANALISE'; headline = 'Sua ficha está em análise.'; detail = 'Avisamos assim que houver resposta.' }

  const bank = selected?.bankId ? await prisma.financeBank.findUnique({ where: { id: selected.bankId }, select: { name: true } }) : null
  return {
    store: tenant?.name ?? 'Loja', code: p.code, customerFirstName: name.split(' ')[0] ?? '', vehicle: p.vehicle,
    headline, detail, step,
    documents: docs.map((d) => ({ id: d.id, type: d.type, status: d.status, label: CUSTOMER_DOC_LABEL[d.status] ?? d.status, canUpload: step !== 'ENCERRADO' && step !== 'CONCLUIDO' && (d.status === 'PENDENTE' || d.status === 'REPROVADO') })),
    offer: selected ? {
      bank: bank?.name ?? 'Banco', amount: num(selected.approvedAmount ?? p.approvedValue), downPayment: num(selected.offerDownPayment ?? p.downPayment),
      installments: selected.offerInstallments ?? p.installments, installmentValue: num(selected.installmentValue ?? p.monthlyPayment),
      rateMonthly: num(selected.rateMonthly), cetMonthly: num(selected.cetMonthly), cetYearly: num(selected.cetYearly), total: num(selected.totalAmount),
    } : null,
    expiresAt: p.portalTokenExpiresAt?.toISOString() ?? null,
  }
}
