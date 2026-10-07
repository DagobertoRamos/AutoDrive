// =============================================================================
// F&I — visão da ficha para as telas (somente leitura).
// Tudo que é interno (retorno, comissão, ids externos, payloads) só sai para
// quem tem a capacidade correspondente. Payload/IDs externos ficam nos Logs.
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { FiCapability } from '@/lib/finance/fi-permissions'
import { CHARGEBACK_SOURCE_PREFIX } from '@/lib/finance/fi-chargeback'
import { FI_RETURN_SOURCE_PREFIX, FI_PLUS_SOURCE_PREFIX, PAYMENT_SOURCE_PREFIX } from '@/lib/finance/deal-finance-sync'
import {
  ATTEMPT_STATUS_META, FORMALIZATION_META, FUNDING_META, LIEN_META, PROPOSAL_STATUS_META,
  OFFER_RANKING_LABEL, metaOf, nextAction, rankOffers, type Offer, type StatusMeta,
} from './status-core'
import { COMMON_REQUIRED, missingForBanks, missingMessage } from './fields-core'
import { bankRequirements, ensureFiCode, personTypeOf } from './orchestrator'
import { resolveBank } from './gateway/resolve'
import { CONNECTION_META } from './gateway/registry'

const num = (v: unknown): number | null => (v == null ? null : Number(v))
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export function maskDoc(doc: string | null | undefined): string | null {
  const d = (doc ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.length === 11) return `***.***.${d.slice(6, 9)}-${d.slice(9)}`
  if (d.length === 14) return `**.***.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  return `***${d.slice(-3)}`
}

export function maskPhone(p: string | null | undefined): string | null {
  const d = (p ?? '').replace(/\D/g, '')
  return d.length >= 8 ? `(${d.slice(0, 2)}) *****-${d.slice(-4)}` : null
}

type Perms = Partial<Record<FiCapability, boolean>>

export interface MoneyEntry { status: 'PREVISTO' | 'RECEBIDO' | 'CONCILIADO' | 'ESTORNADO'; amount: number; dueDate: string | null; paidDate: string | null }
export interface FiMoney { funding: MoneyEntry | null; return?: MoneyEntry | null; plus?: MoneyEntry | null; chargeback?: MoneyEntry | null; netReturn?: number }

export async function buildProposalView(proposalId: string, perms: Perms) {
  await ensureFiCode(proposalId)
  const p = await prisma.financeProposal.findUniqueOrThrow({
    where: { id: proposalId },
    include: { proponent: true, coProponent: { select: { id: true, nomeCompleto: true, razaoSocial: true, personType: true, cpf: true, cnpj: true } }, deal: { select: { id: true, dealNumber: true, status: true } } },
  })
  const tenantId = p.tenantId!
  const [subs, docs, events, tenantBanks] = await Promise.all([
    prisma.financeProposalSubmission.findMany({ where: { proposalId }, orderBy: [{ bankId: 'asc' }, { attemptVersion: 'desc' }] }),
    prisma.financeProposalDocument.findMany({ where: { proposalId }, orderBy: { createdAt: 'asc' } }),
    prisma.financeProposalEvent.findMany({ where: { proposalId }, orderBy: { createdAt: 'desc' }, take: 150 }),
    prisma.financeBank.findMany({ where: { tenantId, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, adapterKey: true } }),
  ])
  const bankName = new Map(tenantBanks.map((b) => [b.id, b.name]))
  const missingBank = subs.map((s) => s.bankId).filter((id): id is string => !!id && !bankName.has(id))
  if (missingBank.length) {
    const extra = await prisma.financeBank.findMany({ where: { id: { in: [...new Set(missingBank)] } }, select: { id: true, name: true } })
    extra.forEach((b) => bankName.set(b.id, b.name))
  }

  // Tentativas: versão atual por banco + histórico (nada é apagado).
  const byBank = new Map<string, typeof subs>()
  for (const s of subs) { const k = s.bankId ?? '—'; byBank.set(k, [...(byBank.get(k) ?? []), s]) }
  const seeResult = perms.verResultado !== false
  const seeReturn = !!perms.verRetorno
  const amount = num(p.amountRequested)
  const attemptView = (s: (typeof subs)[number]) => ({
    id: s.id, version: s.attemptVersion, active: s.active, status: s.status, meta: ATTEMPT_STATUS_META[s.status as keyof typeof ATTEMPT_STATUS_META] ?? metaOf('attempt', s.status),
    mode: s.mode, submittedAt: iso(s.submittedAt), respondedAt: iso(s.respondedAt), lastCheckedAt: iso(s.lastCheckedAt),
    reason: s.statusReason, error: s.errorMessage,
    responseMinutes: s.respondedAt ? Math.max(0, Math.round((s.respondedAt.getTime() - s.submittedAt.getTime()) / 60000)) : null,
    offer: seeResult ? {
      approvedAmount: num(s.approvedAmount), downPayment: num(s.offerDownPayment), installments: s.offerInstallments,
      installmentValue: num(s.installmentValue), rateMonthly: num(s.rateMonthly), cetMonthly: num(s.cetMonthly), cetYearly: num(s.cetYearly),
      totalAmount: num(s.totalAmount), tacValue: num(s.tacValue), expiresAt: iso(s.expiresAt),
    } : null,
    returnPercent: seeReturn ? num(s.returnPercent) : undefined,
    returnValue: seeReturn && s.returnPercent != null ? Math.round((num(s.approvedAmount) ?? amount ?? 0) * Number(s.returnPercent)) / 100 : undefined,
    pendingItems: Array.isArray(s.pendingItems) ? s.pendingItems : [],
    terms: s.terms ?? null,
  })
  const banks = [...byBank.entries()].map(([bankId, list]) => {
    const current = list.find((x) => x.active) ?? list[0]
    return { bankId, bankName: bankName.get(bankId) ?? 'Banco', current: attemptView(current), history: list.filter((x) => x.id !== current.id).map(attemptView) }
  })
  const offers: Offer[] = banks.map((b) => ({
    submissionId: b.current.id, bankName: b.bankName, status: b.current.status,
    downPayment: b.current.offer?.downPayment ?? null, installments: b.current.offer?.installments ?? null,
    installmentValue: b.current.offer?.installmentValue ?? null, amount: b.current.offer?.approvedAmount ?? null,
    cetMonthly: b.current.offer?.cetMonthly ?? null, returnPercent: seeReturn ? (b.current.returnPercent ?? null) : null,
  }))
  const ranking = seeResult ? rankOffers(offers, seeReturn) : {}

  // O que falta (comum + por banco escolhido ou disponível).
  const type = personTypeOf(p.proponent)
  const reqBanks = tenantBanks
  const reqs = await bankRequirements(tenantId, reqBanks)
  const miss = missingForBanks(p.proponent as unknown as Record<string, unknown>, type, reqs)
  const activeBankIds = new Set(banks.filter((b) => b.current.active).map((b) => b.bankId))

  // Conexão de cada banco da loja (para o botão "Enviar").
  const connections = await Promise.all(tenantBanks.map(async (b) => {
    const r = await resolveBank(tenantId, b)
    return { bankId: b.id, bankName: b.name, state: r.state, label: CONNECTION_META[r.state].label, tone: CONNECTION_META[r.state].tone }
  }))

  const na = nextAction({
    status: p.status, missingFields: miss.common.length,
    attempts: banks.map((b) => ({ status: b.current.status, active: b.current.active, mode: b.current.mode, pendingCount: b.current.pendingItems.length })),
    hasSelectedOffer: !!p.selectedSubmissionId, formalizationStatus: p.formalizationStatus, lienStatus: p.lienStatus, fundingStatus: p.fundingStatus,
  })

  // Financeiro (recebimento do banco, retorno, PLUS, chargeback) — pela negociação.
  let money: FiMoney | null = null
  if (p.dealId && p.dealPaymentId) {
    const entries = await prisma.financialEntry.findMany({
      where: { dealId: p.dealId, source: { in: [`${PAYMENT_SOURCE_PREFIX}${p.dealPaymentId}`, `${FI_RETURN_SOURCE_PREFIX}${p.dealPaymentId}`, `${FI_PLUS_SOURCE_PREFIX}${p.dealPaymentId}`, `${CHARGEBACK_SOURCE_PREFIX}${p.dealPaymentId}`] } },
      select: { id: true, source: true, status: true, amount: true, dueDate: true, paidDate: true },
    })
    const matched = entries.length
      ? await prisma.bankStatementLine.findMany({ where: { tenantId, matchedEntryIds: { hasSome: entries.map((e) => e.id) } }, select: { matchedEntryIds: true } })
      : []
    const reconciled = new Set(matched.flatMap((m) => m.matchedEntryIds))
    const view = (prefix: string): MoneyEntry | null => {
      const e = entries.find((x) => x.source === `${prefix}${p.dealPaymentId}`)
      if (!e) return null
      const st: MoneyEntry['status'] = e.status === 'CANCELADO' ? 'ESTORNADO' : reconciled.has(e.id) ? 'CONCILIADO' : (e.status === 'RECEBIDO' || e.status === 'PAGO') ? 'RECEBIDO' : 'PREVISTO'
      return { status: st, amount: Number(e.amount), dueDate: iso(e.dueDate), paidDate: iso(e.paidDate) }
    }
    const funding = view(PAYMENT_SOURCE_PREFIX)
    money = { funding }
    if (seeReturn) {
      const ret = view(FI_RETURN_SOURCE_PREFIX); const plus = view(FI_PLUS_SOURCE_PREFIX); const cb = view(CHARGEBACK_SOURCE_PREFIX)
      const received = (ret && ['RECEBIDO', 'CONCILIADO'].includes(ret.status) ? ret.amount : 0) + (plus && ['RECEBIDO', 'CONCILIADO'].includes(plus.status) ? plus.amount : 0)
      const chargeback = cb && cb.status !== 'ESTORNADO' ? cb.amount : 0
      money = { ...money, return: ret, plus, chargeback: cb, netReturn: Math.round((received - chargeback) * 100) / 100 }
    }
  }

  const waitingDays = p.fundingStatus === 'AGUARDANDO' || p.fundingStatus === 'ENVIADO_PAGAMENTO'
    ? Math.floor((Date.now() - (p.contractSignedAt ?? p.updatedAt).getTime()) / 86_400_000) : null

  const person = p.proponent
  return {
    id: p.id, code: p.code, revision: p.revision, origin: p.origin, createdAt: iso(p.createdAt),
    status: p.status, statusMeta: PROPOSAL_STATUS_META[p.status as keyof typeof PROPOSAL_STATUS_META] ?? metaOf('proposal', p.status),
    nextAction: na,
    customer: {
      proponentId: person.id, personType: type, name: person.personType === 'PJ' ? (person.razaoSocial ?? person.nomeCompleto) : person.nomeCompleto,
      document: perms.acessarDocumentos ? (type === 'PJ' ? person.cnpj : person.cpf) : maskDoc(type === 'PJ' ? person.cnpj : person.cpf),
      phone: perms.acessarDocumentos ? person.celular : maskPhone(person.celular),
    },
    coBuyer: p.coProponent ? { id: p.coProponent.id, name: p.coProponent.personType === 'PJ' ? (p.coProponent.razaoSocial ?? p.coProponent.nomeCompleto) : p.coProponent.nomeCompleto } : null,
    vehicle: { description: p.vehicle, vehicleId: p.vehicleId },
    terms: { vehicleValue: num(p.vehicleValue), downPayment: num(p.downPayment), amount, installments: p.installments },
    deal: p.deal ? { id: p.deal.id, number: p.deal.dealNumber, status: p.deal.status } : null,
    leadId: p.leadId,
    banks, ranking, rankingLabels: OFFER_RANKING_LABEL,
    selectedSubmissionId: p.selectedSubmissionId,
    missing: {
      common: miss.common.map((f) => ({ key: f.key, label: f.label, group: f.group })),
      byBank: miss.byBank.map((b) => ({ bankId: b.bankId, bankName: b.bankName, chosen: activeBankIds.has(b.bankId), fields: b.missing.map((f) => ({ key: f.key, label: f.label, group: f.group })), message: missingMessage(b.bankName, miss.common.length + b.missing.length) })),
      requiredCommon: COMMON_REQUIRED[type],
    },
    connections,
    documents: perms.acessarDocumentos !== false ? docs.map((d) => ({
      id: d.id, type: d.type, status: d.status, required: d.required, hasFile: !!(d.storageKey || d.fileUrl), fileName: d.fileName,
      source: d.source, bankName: d.submissionId ? bankName.get(subs.find((s) => s.id === d.submissionId)?.bankId ?? '') ?? null : null,
      uploadedAt: iso(d.uploadedAt ?? (d.fileUrl ? d.updatedAt : null)), extracted: d.extracted ?? null,
    })) : [],
    timeline: events.map((e) => ({ id: e.id, at: iso(e.createdAt), type: e.type, status: e.status, message: e.message, source: e.source })),
    postApproval: {
      formalization: { status: p.formalizationStatus, meta: FORMALIZATION_META[p.formalizationStatus as keyof typeof FORMALIZATION_META] ?? metaOf('formalization', p.formalizationStatus) },
      lien: { status: p.lienStatus, meta: LIEN_META[p.lienStatus as keyof typeof LIEN_META] ?? metaOf('lien', p.lienStatus), registeredAt: iso(p.lienRegisteredAt) },
      funding: { status: p.fundingStatus, meta: FUNDING_META[p.fundingStatus as keyof typeof FUNDING_META] ?? metaOf('funding', p.fundingStatus), expectedAt: iso(p.fundingExpectedAt), paidAt: iso(p.fundedAt), amount: num(p.fundedAmount), waitingDays },
      contractNumber: p.contractNumber, contractSignedAt: iso(p.contractSignedAt), approvedValue: num(p.approvedValue), monthlyPayment: num(p.monthlyPayment),
    },
    money,
    portal: { active: !!(p.portalTokenHash && p.portalTokenExpiresAt && p.portalTokenExpiresAt > new Date()), expiresAt: iso(p.portalTokenExpiresAt) },
  }
}

export type ProposalView = Awaited<ReturnType<typeof buildProposalView>>
export type { StatusMeta }
