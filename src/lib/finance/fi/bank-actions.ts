// =============================================================================
// F&I — ações pontuais no banco, fora do envio da proposta:
//   • pré-análise (consulta de elegibilidade por CPF, antes de enviar a ficha);
//   • link de formalização digital (documentos + assinatura do cliente).
// Só bancos com integração OFICIAL conectada e com a capacidade declarada.
// Toda chamada passa pelo gateway (credencial DA LOJA), fica no log técnico,
// na linha do tempo e na auditoria. Nada é inventado: sem capacidade → 409.
// =============================================================================

import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { addTimeline } from './events'
import { resolveBank, viaOf } from './gateway/resolve'
import { BankGatewayError, type BankDecision } from './gateway/types'
import { ATTEMPT_STATUS_META } from './status-core'
import {
  advancePostApproval, applicantFrom, BANK_TIMEOUT_MS, FiError, lgpdConfig, loadFull, logIntegration, termsWithVehicle, withTimeout, type Actor,
} from './orchestrator'

const bankError = (e: unknown) => (e instanceof BankGatewayError
  ? new FiError(e.message, e.code === 'CREDENCIAL' ? 409 : 502, e.code)
  : e)

export interface PreAnalysisResult {
  bankName: string
  status: BankDecision['status']
  label: string
  reason: string | null
  offer: BankDecision['offer'] | null
}

/** Pré-análise num banco conectado. Exige a autorização do cliente (vai CPF ao banco). */
export async function preAnalyzeAtBank(
  proposalId: string, bankId: string,
  consent: { confirmed: boolean; ip?: string | null; userAgent?: string | null },
  actor: Actor,
): Promise<PreAnalysisResult> {
  if (!consent.confirmed) throw new FiError('Confirme que o cliente autorizou a consulta de crédito neste banco.', 422, 'CONSENTIMENTO')
  const p = await loadFull(proposalId)
  if (p.status === 'CANCELADA') throw new FiError('Ficha cancelada.', 409)
  const bank = await prisma.financeBank.findFirst({ where: { id: bankId, tenantId: p.tenantId, active: true }, select: { id: true, name: true, adapterKey: true } })
  if (!bank) throw new FiError('Banco não encontrado nesta loja.', 404)
  const correlationId = randomUUID()
  const r = await resolveBank(p.tenantId, bank, correlationId)
  if (!r.live || !r.provider?.capabilities.preAnalyze) throw new FiError('Este banco não oferece pré-análise pela integração.', 409, 'SEM_PREANALISE')

  const lgpd = await lgpdConfig(p.tenantId)
  await prisma.financeConsent.create({
    data: {
      tenantId: p.tenantId, proponentId: p.proponentId, proposalId: p.id, type: 'ENVIO_BANCO', granted: true, grantedAt: new Date(),
      ip: consent.ip ?? null, userAgent: consent.userAgent?.slice(0, 300) ?? null, origin: 'INTERNO',
      purpose: 'Pré-análise de crédito para financiamento de veículo.', legalBasis: lgpd.legalBasis, privacyVersion: lgpd.privacyVersion,
      sharedWith: [bank.name] as Prisma.InputJsonValue,
    },
  })

  const applicant = applicantFrom(p.proponent as unknown as Record<string, unknown>, p.coProponent as unknown as Record<string, unknown> | null)
  const terms = await termsWithVehicle(p)
  const t0 = Date.now()
  let d: BankDecision
  try {
    d = await withTimeout(r.provider.preAnalyze(applicant, terms, r.ctx), BANK_TIMEOUT_MS)
  } catch (e) {
    const ge = e instanceof BankGatewayError ? e : null
    await logIntegration({ tenantId: p.tenantId, adapterKey: bank.adapterKey, action: 'PRE_ANALISE', status: 'ERRO', durationMs: Date.now() - t0, correlationId, proposalId: p.id, submissionId: null, errorCode: ge?.code ?? 'DESCONHECIDO', message: ge?.message ?? null })
    throw bankError(e)
  }
  await logIntegration({ tenantId: p.tenantId, adapterKey: bank.adapterKey, action: 'PRE_ANALISE', status: 'OK', durationMs: Date.now() - t0, correlationId, proposalId: p.id, submissionId: null })
  const label = ATTEMPT_STATUS_META[d.status]?.label ?? d.status
  await addTimeline(prisma, {
    tenantId: p.tenantId, proposalId: p.id, type: 'PRE_ANALISE', status: d.status, source: 'API', actorId: actor.id,
    message: [`Pré-análise ${bank.name}: ${label}.`, d.reason].filter(Boolean).join(' '),
    data: d.offer ? { offer: d.offer } : undefined,
  })
  await createSafeAuditLog({ userId: actor.id, tenantId: p.tenantId, action: 'FI_PRE_ANALISE', entity: 'FinanceProposal', entityId: p.id, userName: actor.name ?? null, userRole: actor.role })
  return { bankName: bank.name, status: d.status, label, reason: d.reason ?? null, offer: d.offer ?? null }
}

export interface FormalizationLink { url: string; bankName: string; at: string }

/** Lê o link de formalização guardado na ficha (originMeta.formalizacao). */
export function formalizationLinkOf(originMeta: unknown): FormalizationLink | null {
  const f = originMeta && typeof originMeta === 'object' ? (originMeta as Record<string, unknown>).formalizacao : null
  if (!f || typeof f !== 'object') return null
  const o = f as Record<string, unknown>
  return typeof o.url === 'string' && /^https:\/\//.test(o.url) ? { url: o.url, bankName: String(o.bankName ?? ''), at: String(o.at ?? '') } : null
}

/** Pede ao banco da proposta escolhida o link de formalização digital (assinatura do cliente). */
export async function requestFormalizationLink(proposalId: string, actor: Actor): Promise<FormalizationLink> {
  const p = await loadFull(proposalId)
  if (!p.selectedSubmissionId) throw new FiError('Escolha a proposta aprovada antes de formalizar.', 409)
  const sub = await prisma.financeProposalSubmission.findUnique({ where: { id: p.selectedSubmissionId }, select: { id: true, bankId: true, externalId: true, mode: true, providerId: true } })
  if (!sub?.bankId || !sub.externalId || sub.mode !== 'API') throw new FiError('A proposta escolhida não foi enviada pela integração: formalize pelo portal do banco.', 409, 'SEM_FORMALIZACAO')
  const bank = await prisma.financeBank.findFirst({ where: { id: sub.bankId, tenantId: p.tenantId }, select: { id: true, name: true, adapterKey: true } })
  if (!bank) throw new FiError('Banco não encontrado nesta loja.', 404)
  const correlationId = randomUUID()
  const r = await resolveBank(p.tenantId, bank, correlationId, viaOf(sub))
    if (!r.live || !r.provider?.capabilities.formalize) throw new FiError('Este banco não oferece formalização digital pela integração.', 409, 'SEM_FORMALIZACAO')

  const t0 = Date.now()
  let url: string | null
  try {
    url = (await withTimeout(r.provider.formalize(sub.externalId, r.ctx), BANK_TIMEOUT_MS)).documentUrl ?? null
  } catch (e) {
    const ge = e instanceof BankGatewayError ? e : null
    await logIntegration({ tenantId: p.tenantId, adapterKey: bank.adapterKey, action: 'FORMALIZACAO', status: 'ERRO', durationMs: Date.now() - t0, correlationId, proposalId: p.id, submissionId: sub.id, errorCode: ge?.code ?? 'DESCONHECIDO', message: ge?.message ?? null })
    throw bankError(e)
  }
  await logIntegration({ tenantId: p.tenantId, adapterKey: bank.adapterKey, action: 'FORMALIZACAO', status: 'OK', durationMs: Date.now() - t0, correlationId, proposalId: p.id, submissionId: sub.id })
  if (!url || !/^https:\/\//.test(url)) throw new FiError('O banco não devolveu um link de formalização válido.', 502)

  const link: FormalizationLink = { url, bankName: bank.name, at: new Date().toISOString() }
  const meta = (p.originMeta && typeof p.originMeta === 'object' ? p.originMeta : {}) as Record<string, unknown>
  await prisma.financeProposal.update({ where: { id: p.id }, data: { originMeta: { ...meta, formalizacao: { ...link } } as Prisma.InputJsonValue } })
  await addTimeline(prisma, { tenantId: p.tenantId, proposalId: p.id, submissionId: sub.id, type: 'FORMALIZATION', source: 'API', actorId: actor.id, message: `${bank.name}: link de formalização digital gerado. O cliente assina pelo link da ficha.` })
  await createSafeAuditLog({ userId: actor.id, tenantId: p.tenantId, action: 'FI_LINK_FORMALIZACAO', entity: 'FinanceProposal', entityId: p.id, userName: actor.name ?? null, userRole: actor.role })
  // A etapa passa a "aguardando assinatura" quando ainda não avançou (avisa os responsáveis).
  if (['NAO_INICIADA', 'EM_ANDAMENTO', 'AGUARDANDO_DOCUMENTOS'].includes(p.formalizationStatus)) {
    await advancePostApproval(p.id, 'formalization', { to: 'AGUARDANDO_ASSINATURA', note: 'Link de formalização digital do banco.' }, actor).catch(() => undefined)
  }
  return link
}
