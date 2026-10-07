// =============================================================================
// F&I — linha do tempo da ficha + reflexo no CRM + avisos (canal central).
//
// • Timeline: FinanceProposalEvent (mensagem em português, sem dado pessoal).
// • CRM: o vendedor não precisa abrir o F&I — o lead recebe uma interação
//   FINANCING e o resumo `metadata.fi` ("Crédito pré-aprovado", etc.).
// • Avisos: notification.service (mesmo canal do SaaS; nada de 2ª caixa de WhatsApp).
// Efeitos colaterais (CRM/aviso) rodam DEPOIS do commit e falhas são registradas
// em log — nunca mascaram o resultado da operação principal.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { notify } from '@/services/notification.service'

type Tx = Prisma.TransactionClient | typeof prisma

export interface TimelineInput {
  tenantId: string | null
  proposalId: string
  submissionId?: string | null
  type: 'STATUS_CHANGE' | 'WEBHOOK' | 'NOTE' | 'DOCUMENT' | 'FORMALIZATION' | 'LIEN' | 'FUNDING' | 'SYSTEM' | 'PORTAL' | 'CRM'
  status?: string | null
  message: string
  source: 'MANUAL' | 'API' | 'WEBHOOK' | 'PORTAL' | 'SITE' | 'SISTEMA'
  actorId?: string | null
  data?: Record<string, unknown> | null
}

export async function addTimeline(tx: Tx, e: TimelineInput) {
  await tx.financeProposalEvent.create({
    data: {
      tenantId: e.tenantId, proposalId: e.proposalId, submissionId: e.submissionId ?? null, type: e.type,
      status: e.status ?? null, message: e.message.slice(0, 500), source: e.source, createdById: e.actorId ?? null,
      data: (e.data ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  })
}

/** Marcos que aparecem no CRM (texto curto, para o vendedor). */
export type CrmMilestone =
  | 'SIMULACAO_INICIADA' | 'SIMULACAO_CONCLUIDA' | 'PRE_ANALISE_INICIADA' | 'FICHA_PREENCHIDA' | 'PROPOSTA_ENVIADA'
  | 'PRE_APROVADA' | 'APROVADA' | 'RECUSADA' | 'DOCUMENTACAO_PENDENTE' | 'DOCUMENTO_RECEBIDO' | 'CONTRATO_ASSINADO' | 'BANCO_PAGOU' | 'CANCELADA'

export const CRM_MILESTONE_LABEL: Record<CrmMilestone, string> = {
  SIMULACAO_INICIADA: 'Simulação de financiamento iniciada',
  SIMULACAO_CONCLUIDA: 'Simulação de financiamento concluída',
  PRE_ANALISE_INICIADA: 'Pré-análise de crédito iniciada',
  FICHA_PREENCHIDA: 'Ficha de financiamento preenchida',
  PROPOSTA_ENVIADA: 'Proposta enviada aos bancos',
  PRE_APROVADA: 'Crédito pré-aprovado',
  APROVADA: 'Crédito aprovado',
  RECUSADA: 'Crédito recusado',
  DOCUMENTACAO_PENDENTE: 'Cliente precisa enviar documento',
  DOCUMENTO_RECEBIDO: 'Cliente enviou documento',
  CONTRATO_ASSINADO: 'Contrato de financiamento assinado',
  BANCO_PAGOU: 'Banco pagou o financiamento',
  CANCELADA: 'Ficha de financiamento cancelada',
}

const SYSTEM_AUTHOR = 'sistema'

/** Registra o marco no lead do CRM (se a ficha veio de/está ligada a um lead). */
export async function reflectOnCrm(proposalId: string, milestone: CrmMilestone, detail?: string | null) {
  try {
    const p = await prisma.financeProposal.findUnique({ where: { id: proposalId }, select: { id: true, code: true, tenantId: true, leadId: true } })
    if (!p?.leadId || !p.tenantId) return
    const lead = await prisma.marketingLead.findFirst({ where: { id: p.leadId, tenantId: p.tenantId }, select: { id: true, metadata: true } })
    if (!lead) return
    const label = CRM_MILESTONE_LABEL[milestone]
    const now = new Date()
    await prisma.crmLeadInteraction.create({
      data: {
        tenantId: p.tenantId, leadId: lead.id, type: 'FINANCING', channel: 'F&I', result: milestone,
        summary: [label, detail, p.code ? `Ficha ${p.code}` : null].filter(Boolean).join(' — ').slice(0, 1000),
        authorId: SYSTEM_AUTHOR, authorName: 'F&I', occurredAt: now,
      },
    })
    const meta = (lead.metadata && typeof lead.metadata === 'object' && !Array.isArray(lead.metadata)) ? lead.metadata as Record<string, unknown> : {}
    await prisma.marketingLead.update({
      where: { id: lead.id },
      data: { metadata: { ...meta, fi: { proposalId: p.id, code: p.code, milestone, label, at: now.toISOString() } } as Prisma.InputJsonValue },
    })
  } catch (err) {
    console.error('[fi/crm] falha ao refletir no CRM', { proposalId, milestone, err: err instanceof Error ? err.message : err })
  }
}

/** Quem acompanha a ficha: quem criou + usuário do vendedor + responsável do lead. */
async function watchers(proposalId: string): Promise<{ tenantId: string | null; code: string | null; userIds: string[] }> {
  const p = await prisma.financeProposal.findUnique({ where: { id: proposalId }, select: { tenantId: true, code: true, createdById: true, sellerId: true, leadId: true } })
  if (!p) return { tenantId: null, code: null, userIds: [] }
  const ids = new Set<string>()
  if (p.createdById) ids.add(p.createdById)
  if (p.sellerId) {
    const s = await prisma.seller.findUnique({ where: { id: p.sellerId }, select: { userId: true } })
    if (s?.userId) ids.add(s.userId)
  }
  if (p.leadId && p.tenantId) {
    const l = await prisma.marketingLead.findFirst({ where: { id: p.leadId, tenantId: p.tenantId }, select: { assignedToUserId: true } })
    if (l?.assignedToUserId) ids.add(l.assignedToUserId)
  }
  return { tenantId: p.tenantId, code: p.code, userIds: [...ids] }
}

export async function notifyWatchers(proposalId: string, title: string, message: string) {
  try {
    const w = await watchers(proposalId)
    if (!w.userIds.length) return
    await Promise.all(w.userIds.map((userId) => notify({
      userId, tenantId: w.tenantId, type: 'INFO', title, message,
      actionUrl: `/financiamento/fichas/${proposalId}`, metadata: { entityType: 'FinanceProposal', entityId: proposalId, module: 'fi' },
    })))
  } catch (err) {
    console.error('[fi/notify] falha ao avisar', { proposalId, err: err instanceof Error ? err.message : err })
  }
}

/** Avisa usuários de papéis da loja (ex.: FINANCEIRO quando o banco pagar). */
export async function notifyRoles(tenantId: string, roles: string[], proposalId: string, title: string, message: string) {
  try {
    const users = await prisma.user.findMany({ where: { tenantId, role: { in: roles as never[] }, status: 'ATIVO' }, select: { id: true }, take: 50 })
    await Promise.all(users.map((u) => notify({
      userId: u.id, tenantId, type: 'INFO', title, message,
      actionUrl: `/financiamento/fichas/${proposalId}`, metadata: { entityType: 'FinanceProposal', entityId: proposalId, module: 'fi' },
    })))
  } catch (err) {
    console.error('[fi/notify] falha ao avisar papéis', { proposalId, err: err instanceof Error ? err.message : err })
  }
}
