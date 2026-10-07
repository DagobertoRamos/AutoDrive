// =============================================================================
// F&I — ORQUESTRADOR DE CRÉDITO (único lugar que chama o gateway de bancos).
//
//   Ficha (FinanceProposal) ──► tentativas por banco (FinanceProposalSubmission)
//        └► escolha da proposta ► formalização ► contrato ► gravame ► pagamento
//           do banco ► negociação (DealPayment FINANCIAMENTO) ► financeiro
//
// Garantias:
//   • Idempotência: cada clique tem uma chave; repetir a chave devolve a mesma
//     tentativa. Banco com tentativa aberta não recebe outra (duplo clique, duas
//     abas, dois usuários) — serializado por trava da ficha (advisory lock).
//   • Chamadas a bancos FORA de transação SQL; transações curtas só para gravar.
//   • Sem resposta do banco ≠ falha: vira "Verificando resposta do banco" e só
//     libera novo envio depois que a consulta confirmar que não chegou.
//   • Transições validadas pela máquina de estados (status-core).
//   • Nunca apaga tentativa anterior: "Ajustar proposta" cria nova versão.
// =============================================================================

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { syncDealFinanceSafe } from '@/lib/finance/deal-finance-sync'
import { markTrackPaid, saveTrack } from '@/lib/finance/fi-contract-track'
import { logDealChild } from '@/lib/negotiation/children-sync'
import {
  ATTEMPT_OPEN, ATTEMPT_STATUS_META, FORMALIZATION_META, FUNDING_META, LIEN_META,
  checkAttemptTransition, checkFormalizationTransition, checkFundingTransition, checkLienTransition,
  deriveProposalStatus, formatFiCode, isAttemptStatus, type AttemptStatus,
} from './status-core'
import { COMMON_REQUIRED, missingForBanks, sanitizeFieldList, type FieldDef, type PersonType } from './fields-core'
import { addTimeline, notifyRoles, notifyWatchers, reflectOnCrm, type CrmMilestone } from './events'
import { resolveBank, type ResolvedBank } from './gateway/resolve'
import { BankGatewayError, type ApplicantPayload, type BankDecision, type ProposalTerms } from './gateway/types'

// ── Tipos públicos ────────────────────────────────────────────────────────────
export interface Actor { id: string; name?: string | null; role: string }
type Tx = Prisma.TransactionClient

export class FiError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'FI', readonly details?: unknown) { super(message); this.name = 'FiError' }
}

export const BANK_TIMEOUT_MS = 25_000
const n = (v: Prisma.Decimal | number | null | undefined): number | null => (v == null ? null : Number(v))
const dec = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : new Prisma.Decimal(v))

/** Serializa operações da mesma ficha (duplo clique, duas abas, webhook durante consulta). */
async function lockProposal(tx: Tx, proposalId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fi:proposal:${proposalId}`}))`
}

export function validIdempotencyKey(k: unknown): k is string {
  return typeof k === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(k)
}

// ── Código rastreável FI-AAAA-NNNNNN ─────────────────────────────────────────
export async function nextFiCode(tx: Tx, tenantId: string, now = new Date()): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fi:code:${tenantId}`}))`
  const year = now.getFullYear()
  const last = await tx.financeProposal.findFirst({
    where: { tenantId, code: { startsWith: `FI-${year}-` } }, orderBy: { code: 'desc' }, select: { code: true },
  })
  const seq = last?.code ? Number(last.code.split('-')[2]) + 1 : 1
  return formatFiCode(year, seq)
}

/** Fichas antigas (antes do F&I Core) ganham código na primeira leitura. */
export async function ensureFiCode(proposalId: string): Promise<string | null> {
  const p = await prisma.financeProposal.findUnique({ where: { id: proposalId }, select: { code: true, tenantId: true, createdAt: true } })
  if (!p || p.code || !p.tenantId) return p?.code ?? null
  const tenantId = p.tenantId
  return prisma.$transaction(async (tx) => {
    await lockProposal(tx, proposalId)
    const again = await tx.financeProposal.findUnique({ where: { id: proposalId }, select: { code: true } })
    if (again?.code) return again.code
    const code = await nextFiCode(tx, tenantId, p.createdAt)
    await tx.financeProposal.update({ where: { id: proposalId }, data: { code } })
    return code
  })
}

// ── Requisitos por banco ─────────────────────────────────────────────────────
export async function bankRequirements(tenantId: string, banks: { id: string; name: string; adapterKey: string | null }[], resolved?: Map<string, ResolvedBank>) {
  const cfg = await prisma.financeTenantSetting.findUnique({ where: { tenantId_key: { tenantId, key: 'bank_required_fields' } } })
  const map = (cfg?.value && typeof cfg.value === 'object' ? cfg.value : {}) as Record<string, unknown>
  return banks.map((b) => {
    const official = resolved?.get(b.id)?.provider?.getRequiredFields() ?? null
    return { bankId: b.id, bankName: b.name, extraFields: official ?? sanitizeFieldList(map[b.id]) }
  })
}

export function personTypeOf(p: { personType?: string | null }): PersonType { return p.personType === 'PJ' ? 'PJ' : 'PF' }

function applicantFrom(p: Record<string, unknown>, co: Record<string, unknown> | null): ApplicantPayload {
  const clean = (o: Record<string, unknown>) => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(o)) {
      if (['id', 'tenantId', 'createdAt', 'updatedAt', 'createdById', 'notes', 'personId', 'customerId'].includes(k)) continue
      if (v == null || v === '') continue
      out[k] = v instanceof Prisma.Decimal ? Number(v) : v instanceof Date ? v.toISOString().slice(0, 10) : v
    }
    return out
  }
  return {
    personType: personTypeOf(p as { personType?: string }),
    data: clean(p),
    coBuyer: co ? { personType: personTypeOf(co as { personType?: string }), data: clean(co) } : null,
  }
}

function termsFrom(p: { vehicleValue: Prisma.Decimal | null; downPayment: Prisma.Decimal | null; amountRequested: Prisma.Decimal | null; installments: number | null; vehicle: string | null }): ProposalTerms {
  const vehicleValue = n(p.vehicleValue)
  const downPayment = n(p.downPayment)
  const amount = n(p.amountRequested) ?? (vehicleValue != null ? Math.max(0, vehicleValue - (downPayment ?? 0)) : null)
  return { vehicleValue, downPayment, amount, installments: p.installments, vehicle: p.vehicle ? { description: p.vehicle } : null }
}

async function loadFull(proposalId: string) {
  const p = await prisma.financeProposal.findUnique({ where: { id: proposalId }, include: { proponent: true, coProponent: true } })
  if (!p) throw new FiError('Ficha não encontrada.', 404)
  if (!p.tenantId) throw new FiError('Ficha sem loja vinculada.', 400)
  return p as typeof p & { tenantId: string }
}

// ── Envio aos bancos ──────────────────────────────────────────────────────────
type FullProposal = Awaited<ReturnType<typeof loadFull>>

/** Valida bancos da loja, campos exigidos e autorização — ANTES de gravar qualquer coisa. */
async function prepareSend(p: FullProposal, ids: string[], consentConfirmed: boolean) {
  const banks = await prisma.financeBank.findMany({ where: { tenantId: p.tenantId, id: { in: ids }, active: true }, select: { id: true, name: true, adapterKey: true } })
  if (banks.length !== ids.length) throw new FiError('Algum banco escolhido não está disponível para esta loja.', 400)
  const correlationId = randomUUID()
  const resolved = new Map<string, ResolvedBank>()
  await Promise.all(banks.map(async (b) => { resolved.set(b.id, await resolveBank(p.tenantId, b, correlationId)) }))
  const reqs = await bankRequirements(p.tenantId, banks, resolved)
  const type = personTypeOf(p.proponent)
  const missing = missingForBanks(p.proponent as unknown as Record<string, unknown>, type, reqs)
  if (missing.common.length || missing.byBank.some((b) => b.missing.length)) {
    throw new FiError('Faltam informações na ficha para enviar aos bancos escolhidos.', 422, 'CAMPOS_FALTANDO', missing)
  }
  if (!consentConfirmed) throw new FiError('Confirme que o cliente autorizou o envio dos dados aos bancos escolhidos.', 422, 'CONSENTIMENTO')
  return { banks, resolved, correlationId }
}
export interface SendInput {
  proposalId: string
  bankIds: string[]
  idempotencyKey: string
  actor: Actor
  consent: { confirmed: boolean; ip?: string | null; userAgent?: string | null; origin?: 'INTERNO' | 'PORTAL' | 'SITE' }
  expectedRevision?: number | null
}
export interface AttemptRef { id: string; bankId: string; bankName: string; status: string; mode: string; duplicate: boolean }
export interface SendResult { attempts: AttemptRef[]; dispatch: string[]; missing?: { common: FieldDef[]; byBank: { bankId: string; bankName: string; missing: FieldDef[] }[] } }

const DEFAULT_LEGAL_BASIS = 'PROCEDIMENTOS_PRELIMINARES_CONTRATO'
async function lgpdConfig(tenantId: string) {
  const row = await prisma.financeTenantSetting.findUnique({ where: { tenantId_key: { tenantId, key: 'lgpd' } } })
  const v = (row?.value && typeof row.value === 'object' ? row.value : {}) as Record<string, unknown>
  return {
    legalBasis: typeof v.legalBasis === 'string' && v.legalBasis ? v.legalBasis : DEFAULT_LEGAL_BASIS,
    privacyVersion: typeof v.privacyVersion === 'string' && v.privacyVersion ? v.privacyVersion : '1',
    documentRetentionDays: typeof v.documentRetentionDays === 'number' ? v.documentRetentionDays : 180,
  }
}

export async function sendToBanks(input: SendInput): Promise<SendResult> {
  if (!validIdempotencyKey(input.idempotencyKey)) throw new FiError('Chave de envio inválida. Atualize a página e tente de novo.', 400)
  const ids = [...new Set(input.bankIds.filter((x) => typeof x === 'string' && x))]
  if (!ids.length) throw new FiError('Escolha pelo menos um banco.', 400)
  const p = await loadFull(input.proposalId)
  if (p.status === 'CANCELADA' || p.status === 'EXPIRADA') throw new FiError('Esta ficha está encerrada. Crie uma nova ficha.', 409)
  if (p.selectedSubmissionId) throw new FiError('Já existe uma proposta escolhida para esta ficha.', 409)

  const { banks, resolved, correlationId } = await prepareSend(p, ids, input.consent.confirmed)

  const lgpd = await lgpdConfig(p.tenantId)
  const terms = termsFrom(p)
  const result = await prisma.$transaction(async (tx) => {
    await lockProposal(tx, p.id)
    const cur = await tx.financeProposal.findUniqueOrThrow({ where: { id: p.id }, select: { revision: true, status: true, selectedSubmissionId: true } })
    if (input.expectedRevision != null && cur.revision !== input.expectedRevision) {
      throw new FiError('Esta ficha foi alterada por outra pessoa. Atualize a página para ver a versão atual.', 409, 'REVISAO')
    }
    if (cur.status === 'CANCELADA' || cur.selectedSubmissionId) throw new FiError('Esta ficha não aceita novos envios.', 409)
    const out: AttemptRef[] = []
    const created: string[] = []
    for (const b of banks) {
      const key = `${input.idempotencyKey}:${b.id}`
      const r = resolved.get(b.id)!
      const same = await tx.financeProposalSubmission.findUnique({ where: { idempotencyKey: key }, select: { id: true, status: true, mode: true } })
      if (same) { out.push({ id: same.id, bankId: b.id, bankName: b.name, status: same.status, mode: same.mode, duplicate: true }); continue }
      const open = await tx.financeProposalSubmission.findFirst({
        where: { proposalId: p.id, bankId: b.id, active: true, status: { in: ATTEMPT_OPEN } }, select: { id: true, status: true, mode: true },
      })
      if (open) { out.push({ id: open.id, bankId: b.id, bankName: b.name, status: open.status, mode: open.mode, duplicate: true }); continue }
      const last = await tx.financeProposalSubmission.findFirst({ where: { proposalId: p.id, bankId: b.id }, orderBy: { attemptVersion: 'desc' }, select: { attemptVersion: true } })
      const live = r.live
      const status: AttemptStatus = live ? 'ENVIANDO' : 'ENVIADA'
      const sub = await tx.financeProposalSubmission.create({
        data: {
          tenantId: p.tenantId, proposalId: p.id, bankId: b.id, environment: r.ctx.environment, status,
          mode: live ? 'API' : 'MANUAL', idempotencyKey: key, attemptVersion: (last?.attemptVersion ?? 0) + 1,
          terms: { ...terms, coBuyer: p.coProponentId ? true : false } as Prisma.InputJsonValue,
          requestPayload: { correlationId, adapterKey: b.adapterKey, mode: live ? 'API' : 'MANUAL' } as Prisma.InputJsonValue,
          submittedById: input.actor.id,
        },
      })
      await addTimeline(tx, {
        tenantId: p.tenantId, proposalId: p.id, submissionId: sub.id, type: 'STATUS_CHANGE', status, source: live ? 'API' : 'MANUAL', actorId: input.actor.id,
        message: live ? `Enviada ao ${b.name}.` : `Registrada para envio ao ${b.name} pelo portal do banco (banco ainda não integrado).`,
        data: { version: sub.attemptVersion },
      })
      out.push({ id: sub.id, bankId: b.id, bankName: b.name, status, mode: sub.mode, duplicate: false })
      if (live) created.push(sub.id)
    }
    const fresh = out.filter((a) => !a.duplicate)
    if (fresh.length) {
      await tx.financeConsent.create({
        data: {
          tenantId: p.tenantId, proponentId: p.proponentId, proposalId: p.id, type: 'ENVIO_BANCO', granted: true, grantedAt: new Date(),
          ip: input.consent.ip ?? null, userAgent: input.consent.userAgent?.slice(0, 300) ?? null, origin: input.consent.origin ?? 'INTERNO',
          purpose: 'Análise de crédito para financiamento de veículo pelas instituições escolhidas.',
          legalBasis: lgpd.legalBasis, privacyVersion: lgpd.privacyVersion,
          sharedWith: fresh.map((a) => a.bankName) as Prisma.InputJsonValue,
        },
      })
      const all = await tx.financeProposalSubmission.findMany({ where: { proposalId: p.id }, select: { status: true, active: true } })
      await tx.financeProposal.update({ where: { id: p.id }, data: { status: deriveProposalStatus(cur.status, all), revision: { increment: 1 } } })
    }
    return { attempts: out, dispatch: created }
  }, { timeout: 15_000 })

  if (result.attempts.some((a) => !a.duplicate)) {
    await createSafeAuditLog({ userId: input.actor.id, tenantId: p.tenantId, action: 'FI_ENVIO_BANCOS', entity: 'FinanceProposal', entityId: p.id, userName: input.actor.name ?? null, userRole: input.actor.role, afterData: { bancos: result.attempts.filter((a) => !a.duplicate).map((a) => a.bankName) } })
    await reflectOnCrm(p.id, 'PROPOSTA_ENVIADA', result.attempts.filter((a) => !a.duplicate).map((a) => a.bankName).join(', '))
  }
  return result
}

// ── Execução da chamada ao banco (fora de transação) ─────────────────────────
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new BankGatewayError('O banco não respondeu a tempo.', 'TEMPO_ESGOTADO', 'TALVEZ')), ms) })
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer) })
}

async function logIntegration(d: { tenantId: string; adapterKey: string | null; action: string; status: 'OK' | 'ERRO'; durationMs: number; correlationId: string; proposalId: string; submissionId: string; attempt?: number; errorCode?: string | null; message?: string | null }) {
  await prisma.financeIntegrationLog.create({
    data: {
      tenantId: d.tenantId, adapterKey: d.adapterKey, action: d.action, status: d.status, durationMs: d.durationMs, correlationId: d.correlationId,
      proposalId: d.proposalId, submissionId: d.submissionId, attempt: d.attempt ?? null, errorCode: d.errorCode ?? null, message: d.message?.slice(0, 300) ?? null,
    },
  }).catch((e) => console.error('[fi/log] falha ao registrar log técnico', e instanceof Error ? e.message : e))
}

/** Envia UMA tentativa em estado ENVIANDO. Seguro para chamar mais de uma vez. */
export async function dispatchAttempt(submissionId: string, timeoutMs = BANK_TIMEOUT_MS): Promise<string> {
  const a = await prisma.financeProposalSubmission.findUnique({ where: { id: submissionId } })
  if (!a || a.status !== 'ENVIANDO' || !a.bankId) return a?.status ?? 'NAO_ENCONTRADA'
  const p = await loadFull(a.proposalId)
  const bank = await prisma.financeBank.findUnique({ where: { id: a.bankId }, select: { id: true, name: true, adapterKey: true } })
  if (!bank) return applyDecision(a.id, { status: 'FALHA_ENVIO', reason: 'Banco removido do cadastro da loja.' }, { source: 'SISTEMA' }).then((r) => r.status)
  const meta = (a.requestPayload ?? {}) as { correlationId?: string; previousExternalId?: string }
  const r = await resolveBank(p.tenantId, bank, meta.correlationId ?? randomUUID())
  if (!r.live || !r.provider) {
    await prisma.financeProposalSubmission.update({ where: { id: a.id }, data: { mode: 'MANUAL' } })
    return applyDecision(a.id, { status: 'ENVIADA', reason: 'Banco ainda não integrado. Envie pelo portal do banco e registre a resposta aqui.' }, { source: 'SISTEMA' }).then((x) => x.status)
  }
  const t0 = Date.now()
  const ctx = { ...r.ctx, idempotencyKey: a.idempotencyKey ?? undefined }
  try {
    const applicant = applicantFrom(p.proponent as unknown as Record<string, unknown>, p.coProponent as unknown as Record<string, unknown> | null)
    const terms = termsFrom(p)
    const decision = meta.previousExternalId && r.provider.capabilities.update
      ? await withTimeout(r.provider.updateProposal(meta.previousExternalId, terms, ctx), timeoutMs)
      : await withTimeout(r.provider.submitProposal(applicant, terms, ctx), timeoutMs)
    await logIntegration({ tenantId: p.tenantId, adapterKey: bank.adapterKey, action: 'ENVIAR_PROPOSTA', status: 'OK', durationMs: Date.now() - t0, correlationId: ctx.correlationId, proposalId: p.id, submissionId: a.id, attempt: a.attemptVersion })
    return (await applyDecision(a.id, decision, { source: 'API' })).status
  } catch (e) {
    const ge = e instanceof BankGatewayError ? e : null
    await logIntegration({ tenantId: p.tenantId, adapterKey: bank.adapterKey, action: 'ENVIAR_PROPOSTA', status: 'ERRO', durationMs: Date.now() - t0, correlationId: ctx.correlationId, proposalId: p.id, submissionId: a.id, attempt: a.attemptVersion, errorCode: ge?.code ?? 'DESCONHECIDO', message: ge?.message ?? (e instanceof Error ? e.name : 'erro') })
    // Só é falha confirmada quando o pedido comprovadamente NÃO saiu daqui.
    if (ge && ge.delivered === 'NAO') {
      return (await applyDecision(a.id, { status: 'FALHA_ENVIO', reason: ge.message }, { source: 'SISTEMA', errorMessage: ge.message })).status
    }
    return (await applyDecision(a.id, { status: 'VERIFICANDO', reason: 'Verificando resposta do banco.' }, { source: 'SISTEMA', errorMessage: ge?.message ?? 'Sem resposta do banco.' })).status
  }
}

/** Consulta o banco antes de liberar reenvio de uma tentativa sem resposta. */
export async function verifyAttempt(submissionId: string, actor?: Actor | null): Promise<string> {
  const a = await prisma.financeProposalSubmission.findUnique({ where: { id: submissionId } })
  if (!a || !a.bankId) throw new FiError('Proposta não encontrada.', 404)
  if (!['VERIFICANDO', 'ENVIADA', 'EM_ANALISE', 'PENDENTE', 'PRE_APROVADA'].includes(a.status)) return a.status
  const bank = await prisma.financeBank.findUnique({ where: { id: a.bankId }, select: { id: true, name: true, adapterKey: true } })
  if (!bank) throw new FiError('Banco não encontrado.', 404)
  const r = await resolveBank(a.tenantId, bank)
  if (!r.live || !r.provider || !r.provider.capabilities.status) {
    throw new FiError('Este banco não permite consultar pela integração. Confira no portal do banco e registre a resposta.', 409, 'SEM_CONSULTA')
  }
  const t0 = Date.now()
  try {
    const decision = a.externalId
      ? await withTimeout(r.provider.getStatus(a.externalId, r.ctx), BANK_TIMEOUT_MS)
      : a.idempotencyKey ? await withTimeout(r.provider.findByIdempotencyKey(a.idempotencyKey, r.ctx), BANK_TIMEOUT_MS) : null
    await prisma.financeProposalSubmission.update({ where: { id: a.id }, data: { lastCheckedAt: new Date() } })
    await logIntegration({ tenantId: a.tenantId, adapterKey: bank.adapterKey, action: 'CONSULTAR_SITUACAO', status: 'OK', durationMs: Date.now() - t0, correlationId: r.ctx.correlationId, proposalId: a.proposalId, submissionId: a.id, attempt: a.attemptVersion })
    if (!decision) {
      return (await applyDecision(a.id, { status: 'FALHA_ENVIO', reason: 'O banco confirmou que não recebeu a proposta. Você pode enviar de novo.' }, { source: 'API', actorId: actor?.id })).status
    }
    return (await applyDecision(a.id, decision, { source: 'API', actorId: actor?.id })).status
  } catch (e) {
    if (e instanceof FiError) throw e
    const ge = e instanceof BankGatewayError ? e : null
    await prisma.financeProposalSubmission.update({ where: { id: a.id }, data: { lastCheckedAt: new Date(), errorMessage: ge?.message ?? 'Sem resposta do banco.' } })
    await logIntegration({ tenantId: a.tenantId, adapterKey: bank.adapterKey, action: 'CONSULTAR_SITUACAO', status: 'ERRO', durationMs: Date.now() - t0, correlationId: r.ctx.correlationId, proposalId: a.proposalId, submissionId: a.id, attempt: a.attemptVersion, errorCode: ge?.code ?? 'DESCONHECIDO', message: ge?.message ?? null })
    throw new FiError(ge?.message ?? 'Não conseguimos falar com o banco agora. Tente de novo em alguns minutos.', 502, ge?.code ?? 'BANCO')
  }
}

// ── Aplicar resposta do banco (API, webhook ou registro manual) ──────────────
export interface ApplyOptions { source: 'API' | 'WEBHOOK' | 'MANUAL' | 'SISTEMA'; actorId?: string | null; errorMessage?: string | null; message?: string | null }
export interface ApplyResult { applied: boolean; status: string; reason?: string }

const MILESTONE_BY_STATUS: Partial<Record<AttemptStatus, CrmMilestone>> = {
  PRE_APROVADA: 'PRE_APROVADA', APROVADA: 'APROVADA', RECUSADA: 'RECUSADA', PENDENTE: 'DOCUMENTACAO_PENDENTE',
}

export async function applyDecision(submissionId: string, decision: BankDecision, opts: ApplyOptions): Promise<ApplyResult> {
  const head = await prisma.financeProposalSubmission.findUnique({ where: { id: submissionId }, select: { proposalId: true } })
  if (!head) throw new FiError('Proposta não encontrada.', 404)
  const out = await prisma.$transaction(async (tx) => {
    await lockProposal(tx, head.proposalId)
    const a = await tx.financeProposalSubmission.findUniqueOrThrow({ where: { id: submissionId } })
    const check = checkAttemptTransition(a.status, decision.status)
    if (!check.ok) {
      if (opts.source === 'WEBHOOK' || opts.source === 'API') return { applied: false, status: a.status, reason: check.reason, bank: null as string | null, proposalStatus: null as string | null, prevProposalStatus: null as string | null }
      throw new FiError(check.reason, 409, 'TRANSICAO')
    }
    if (check.noop) return { applied: false, status: a.status, reason: 'Sem mudança.', bank: null, proposalStatus: null, prevProposalStatus: null }
    const o = decision.offer ?? null
    const decided = !['ENVIANDO', 'VERIFICANDO'].includes(decision.status)
    await tx.financeProposalSubmission.update({
      where: { id: a.id },
      data: {
        status: decision.status,
        ...(decision.externalId && !a.externalId ? { externalId: decision.externalId } : {}),
        ...(decision.requestId ? { requestId: decision.requestId } : {}),
        ...(o ? {
          approvedAmount: dec(o.approvedAmount), offerDownPayment: dec(o.downPayment), offerInstallments: o.installments ?? null,
          installmentValue: dec(o.installmentValue), rateMonthly: dec(o.rateMonthly), cetMonthly: dec(o.cetMonthly), cetYearly: dec(o.cetYearly),
          totalAmount: dec(o.totalAmount), tacValue: dec(o.tacValue), expiresAt: o.expiresAt ? new Date(o.expiresAt) : null,
        } : {}),
        ...(decision.pendingItems ? { pendingItems: decision.pendingItems.map((x) => ({ ...x, done: false })) as Prisma.InputJsonValue } : {}),
        statusReason: decision.reason?.slice(0, 500) ?? null,
        ...(decided ? { respondedAt: new Date() } : {}),
        errorMessage: opts.errorMessage?.slice(0, 300) ?? null,
      },
    })
    const bank = a.bankId ? await tx.financeBank.findUnique({ where: { id: a.bankId }, select: { name: true } }) : null
    const bankName = bank?.name ?? 'Banco'
    await addTimeline(tx, {
      tenantId: a.tenantId, proposalId: a.proposalId, submissionId: a.id, type: opts.source === 'WEBHOOK' ? 'WEBHOOK' : 'STATUS_CHANGE',
      status: decision.status, source: opts.source, actorId: opts.actorId ?? null,
      message: [`${bankName}: ${ATTEMPT_STATUS_META[decision.status].label}.`, opts.message ?? decision.reason].filter(Boolean).join(' '),
    })
    // Documentos pedidos pelo banco viram itens da ficha (sem duplicar).
    for (const item of decision.pendingItems ?? []) {
      if (item.kind !== 'DOCUMENTO') continue
      const exists = await tx.financeProposalDocument.findFirst({ where: { proposalId: a.proposalId, type: item.label, status: { not: 'REPROVADO' } }, select: { id: true } })
      if (!exists) {
        await tx.financeProposalDocument.create({ data: { tenantId: a.tenantId, proposalId: a.proposalId, type: item.label, required: true, status: 'PENDENTE', submissionId: a.id, source: 'INTERNO' } })
      }
    }
    const prop = await tx.financeProposal.findUniqueOrThrow({ where: { id: a.proposalId }, select: { status: true } })
    const all = await tx.financeProposalSubmission.findMany({ where: { proposalId: a.proposalId }, select: { status: true, active: true } })
    const next = deriveProposalStatus(prop.status, all)
    await tx.financeProposal.update({ where: { id: a.proposalId }, data: { status: next, revision: { increment: 1 } } })
    return { applied: true, status: decision.status, bank: bankName, proposalStatus: next as string, prevProposalStatus: prop.status as string }
  }, { timeout: 15_000 })

  if (out.applied && isAttemptStatus(out.status)) {
    const m = MILESTONE_BY_STATUS[out.status]
    if (m) await reflectOnCrm(head.proposalId, m, out.bank)
    if (out.status === 'APROVADA') await notifyWatchers(head.proposalId, 'Crédito aprovado', `${out.bank} aprovou o financiamento.`)
    else if (out.status === 'PRE_APROVADA') await notifyWatchers(head.proposalId, 'Crédito pré-aprovado', `${out.bank} pré-aprovou o financiamento.`)
    else if (out.status === 'RECUSADA') await notifyWatchers(head.proposalId, 'Crédito recusado', `${out.bank} recusou a proposta.`)
    else if (out.status === 'PENDENTE') await notifyWatchers(head.proposalId, 'Banco pediu mais informações', `${out.bank} precisa de documentos para continuar.`)
  }
  return { applied: out.applied, status: out.status, reason: out.reason }
}

export interface ManualResponseInput {
  status: AttemptStatus
  reason?: string | null
  externalId?: string | null
  offer?: BankDecision['offer']
  pendingItems?: BankDecision['pendingItems']
}
export async function recordManualResponse(submissionId: string, input: ManualResponseInput, actor: Actor): Promise<ApplyResult> {
  if (['ENVIANDO', 'SUBSTITUIDA'].includes(input.status)) throw new FiError('Situação inválida para registro manual.', 400)
  const r = await applyDecision(submissionId, { status: input.status, reason: input.reason, externalId: input.externalId, offer: input.offer, pendingItems: input.pendingItems }, { source: 'MANUAL', actorId: actor.id })
  const a = await prisma.financeProposalSubmission.findUnique({ where: { id: submissionId }, select: { tenantId: true, proposalId: true } })
  if (r.applied && a) await createSafeAuditLog({ userId: actor.id, tenantId: a.tenantId, action: `FI_RESPOSTA_${input.status}`, entity: 'FinanceProposalSubmission', entityId: submissionId, userName: actor.name ?? null, userRole: actor.role })
  return r
}

// ── Ajustar proposta (nova versão; histórico preservado) ─────────────────────
export interface AdjustInput {
  proposalId: string
  idempotencyKey: string
  actor: Actor
  bankIds?: string[]
  vehicleValue?: number | null
  downPayment?: number | null
  amount?: number | null
  installments?: number | null
  coProponentId?: string | null
  consent: SendInput['consent']
  expectedRevision?: number | null
}

export async function adjustProposal(input: AdjustInput): Promise<SendResult> {
  if (!validIdempotencyKey(input.idempotencyKey)) throw new FiError('Chave de envio inválida. Atualize a página e tente de novo.', 400)
  const p = await loadFull(input.proposalId)
  if (p.status === 'CANCELADA') throw new FiError('Ficha cancelada.', 409)
  if (p.selectedSubmissionId) throw new FiError('A proposta já foi escolhida. Para mudar, cancele a escolha antes.', 409)
  if (input.coProponentId) {
    const co = await prisma.financeProponent.findFirst({ where: { id: input.coProponentId, tenantId: p.tenantId }, select: { id: true } })
    if (!co || co.id === p.proponentId) throw new FiError('Co-comprador inválido.', 400)
  }
  const current = await prisma.financeProposalSubmission.findMany({ where: { proposalId: p.id, active: true }, select: { id: true, bankId: true, status: true, externalId: true, mode: true } })
  const bankIds = input.bankIds?.length ? input.bankIds : [...new Set(current.map((c) => c.bankId).filter(Boolean) as string[])]
  if (!bankIds.length) throw new FiError('Escolha pelo menos um banco.', 400)
  // Valida tudo antes de encerrar as versões atuais (nada fica pela metade).
  await prepareSend(p, bankIds, input.consent.confirmed)

  // 1) Atualiza as condições e encerra as versões atuais (sem apagar nada).
  await prisma.$transaction(async (tx) => {
    await lockProposal(tx, p.id)
    const cur = await tx.financeProposal.findUniqueOrThrow({ where: { id: p.id }, select: { revision: true } })
    if (input.expectedRevision != null && cur.revision !== input.expectedRevision) {
      throw new FiError('Esta ficha foi alterada por outra pessoa. Atualize a página para ver a versão atual.', 409, 'REVISAO')
    }
    // Repetição da mesma chave: o ajuste já foi feito.
    const done = await tx.financeProposalSubmission.findFirst({ where: { idempotencyKey: { startsWith: `${input.idempotencyKey}:` } }, select: { id: true } })
    if (done) return
    const vehicleValue = input.vehicleValue !== undefined ? input.vehicleValue : n(p.vehicleValue)
    const downPayment = input.downPayment !== undefined ? input.downPayment : n(p.downPayment)
    const amount = input.amount !== undefined ? input.amount : (vehicleValue != null ? Math.max(0, vehicleValue - (downPayment ?? 0)) : n(p.amountRequested))
    await tx.financeProposal.update({
      where: { id: p.id },
      data: {
        vehicleValue: dec(vehicleValue), downPayment: dec(downPayment), amountRequested: dec(amount),
        ...(input.installments !== undefined ? { installments: input.installments } : {}),
        ...(input.coProponentId !== undefined ? { coProponentId: input.coProponentId } : {}),
        revision: { increment: 1 },
      },
    })
    for (const c of current.filter((x) => x.bankId && bankIds.includes(x.bankId))) {
      const stillOpen = ATTEMPT_OPEN.includes(c.status as AttemptStatus)
      await tx.financeProposalSubmission.update({ where: { id: c.id }, data: { active: false, ...(stillOpen ? { status: 'SUBSTITUIDA' } : {}) } })
    }
    await addTimeline(tx, {
      tenantId: p.tenantId, proposalId: p.id, type: 'NOTE', source: 'MANUAL', actorId: input.actor.id,
      message: `Proposta ajustada: entrada ${fmtMoney(downPayment)}, ${input.installments ?? p.installments ?? '—'} parcelas.`,
      data: { vehicleValue, downPayment, amount, installments: input.installments ?? p.installments },
    })
  })
  // 2) Novas versões para os bancos (mesma rota de envio, com as mesmas travas).
  const res = await sendToBanks({ proposalId: p.id, bankIds, idempotencyKey: input.idempotencyKey, actor: input.actor, consent: input.consent })
  // Proposta anterior ainda ABERTA num banco com API que aceita atualização:
  // atualiza a mesma proposta lá (recusada/expirada vira proposta nova).
  for (const att of res.attempts.filter((x) => !x.duplicate)) {
    const prev = current.find((c) => c.bankId === att.bankId && c.externalId && c.mode === 'API' && ATTEMPT_OPEN.includes(c.status as AttemptStatus))
    if (prev?.externalId) {
      const s = await prisma.financeProposalSubmission.findUnique({ where: { id: att.id }, select: { requestPayload: true } })
      await prisma.financeProposalSubmission.update({ where: { id: att.id }, data: { requestPayload: { ...((s?.requestPayload ?? {}) as object), previousExternalId: prev.externalId } as Prisma.InputJsonValue } })
    }
  }
  return res
}

function fmtMoney(v: number | null | undefined) {
  return v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── Escolher a proposta aprovada ─────────────────────────────────────────────
export async function selectOffer(proposalId: string, submissionId: string, actor: Actor) {
  const p = await loadFull(proposalId)
  const res = await prisma.$transaction(async (tx) => {
    await lockProposal(tx, proposalId)
    const cur = await tx.financeProposal.findUniqueOrThrow({ where: { id: proposalId } })
    if (cur.selectedSubmissionId === submissionId) return { noop: true, bankName: '' }
    if (cur.selectedSubmissionId && cur.formalizationStatus !== 'NAO_INICIADA') throw new FiError('A formalização já começou com outra proposta.', 409)
    const a = await tx.financeProposalSubmission.findFirst({ where: { id: submissionId, proposalId, active: true } })
    if (!a) throw new FiError('Proposta não encontrada nesta ficha.', 404)
    if (a.status !== 'APROVADA') throw new FiError('Só é possível escolher uma proposta aprovada pelo banco.', 409)
    const bank = a.bankId ? await tx.financeBank.findUnique({ where: { id: a.bankId }, select: { name: true } }) : null
    await tx.financeProposal.update({
      where: { id: proposalId },
      data: {
        selectedSubmissionId: a.id, bankId: a.bankId,
        approvedValue: a.approvedAmount ?? cur.amountRequested, monthlyPayment: a.installmentValue,
        ...(a.offerInstallments ? { installments: a.offerInstallments } : {}),
        ...(a.offerDownPayment ? { downPayment: a.offerDownPayment } : {}),
        status: 'APROVADA', fundingStatus: 'AGUARDANDO', revision: { increment: 1 },
      },
    })
    await addTimeline(tx, { tenantId: p.tenantId, proposalId, submissionId: a.id, type: 'STATUS_CHANGE', status: 'APROVADA', source: 'MANUAL', actorId: actor.id, message: `Proposta do ${bank?.name ?? 'banco'} escolhida para formalizar.` })
    return { noop: false, bankName: bank?.name ?? 'banco' }
  })
  if (!res.noop) {
    await createSafeAuditLog({ userId: actor.id, tenantId: p.tenantId, action: 'FI_ESCOLHA_PROPOSTA', entity: 'FinanceProposal', entityId: proposalId, userName: actor.name ?? null, userRole: actor.role, afterData: { submissionId } })
    if (p.dealId) await linkFinancingToDeal(proposalId, actor)
  }
  return res
}

/** Desfaz a escolha (antes da formalização). */
export async function unselectOffer(proposalId: string, actor: Actor) {
  const p = await loadFull(proposalId)
  await prisma.$transaction(async (tx) => {
    await lockProposal(tx, proposalId)
    const cur = await tx.financeProposal.findUniqueOrThrow({ where: { id: proposalId } })
    if (!cur.selectedSubmissionId) return
    if (cur.formalizationStatus !== 'NAO_INICIADA') throw new FiError('A formalização já começou. Cancele a formalização antes.', 409)
    await tx.financeProposal.update({ where: { id: proposalId }, data: { selectedSubmissionId: null, fundingStatus: 'NAO_ESPERADO', revision: { increment: 1 } } })
    await addTimeline(tx, { tenantId: p.tenantId, proposalId, type: 'NOTE', source: 'MANUAL', actorId: actor.id, message: 'Escolha da proposta desfeita.' })
  })
  if (p.dealPaymentId) await setDealPaymentStatus(p.dealPaymentId, 'CANCELADO', actor, null)
}

// ── Ligação com a negociação (o F&I não tem venda paralela) ──────────────────
/**
 * Gera/atualiza o pagamento FINANCIAMENTO da negociação a partir da proposta
 * escolhida. Reaproveita pagamento de financiamento já lançado à mão (não
 * duplica receita). O financeiro recebe a previsão pelo sync da negociação.
 */
export async function linkFinancingToDeal(proposalId: string, actor: Actor): Promise<{ paymentId: string } | null> {
  const p = await prisma.financeProposal.findUnique({ where: { id: proposalId } })
  if (!p?.dealId || !p.tenantId || !p.selectedSubmissionId) return null
  const deal = await prisma.deal.findFirst({ where: { id: p.dealId, tenantId: p.tenantId }, select: { id: true, status: true } })
  if (!deal) throw new FiError('Negociação não encontrada nesta loja.', 404)
  if (deal.status === 'CANCELADA') throw new FiError('A negociação está cancelada.', 409)
  const a = await prisma.financeProposalSubmission.findUniqueOrThrow({ where: { id: p.selectedSubmissionId } })
  const bank = a.bankId ? await prisma.financeBank.findUnique({ where: { id: a.bankId }, select: { name: true } }) : null
  const value = a.approvedAmount ?? p.approvedValue ?? p.amountRequested
  if (!value || Number(value) <= 0) throw new FiError('A proposta escolhida não tem valor financiado.', 422)

  const result = await prisma.$transaction(async (tx) => {
    await lockProposal(tx, proposalId)
    const fresh = await tx.financeProposal.findUniqueOrThrow({ where: { id: proposalId }, select: { dealPaymentId: true } })
    let payment = fresh.dealPaymentId ? await tx.dealPayment.findFirst({ where: { id: fresh.dealPaymentId, dealId: deal.id } }) : null
    if (!payment) {
      // Financiamento lançado à mão na negociação (texto livre) e ainda não ligado a outra ficha.
      const linked = await tx.financeProposal.findMany({ where: { dealId: deal.id, dealPaymentId: { not: null }, id: { not: proposalId } }, select: { dealPaymentId: true } })
      const taken = new Set(linked.map((l) => l.dealPaymentId))
      const candidates = await tx.dealPayment.findMany({ where: { dealId: deal.id, type: 'FINANCIAMENTO', status: { notIn: ['CANCELADO', 'ESTORNADO'] } }, orderBy: { createdAt: 'asc' } })
      payment = candidates.find((c) => !taken.has(c.id)) ?? null
    }
    const before = payment ? `${payment.bank ?? 'Financiamento'} ${Number(payment.value).toFixed(2)}` : null
    const data = {
      value, bank: bank?.name ?? payment?.bank ?? null, installments: a.offerInstallments ?? p.installments,
      installmentValue: a.installmentValue, returnPct: a.returnPercent ?? payment?.returnPct ?? null,
      contractNumber: p.contractNumber ?? payment?.contractNumber ?? null,
    }
    if (payment) {
      if (payment.status === 'CONFIRMADO') {
        await tx.financeProposal.update({ where: { id: proposalId }, data: { dealPaymentId: payment.id } })
        return { paymentId: payment.id, before, after: before, changed: false }
      }
      payment = await tx.dealPayment.update({ where: { id: payment.id }, data })
    } else {
      payment = await tx.dealPayment.create({
        data: { ...data, dealId: deal.id, tenantId: p.tenantId, type: 'FINANCIAMENTO', status: 'PENDENTE', createdById: actor.id, source: 'FI', externalId: proposalId },
      })
    }
    await tx.financeProposal.update({ where: { id: proposalId }, data: { dealPaymentId: payment.id } })
    await tx.deal.update({ where: { id: deal.id }, data: { financedAmount: value, paymentBank: bank?.name ?? null } })
    await addTimeline(tx, { tenantId: p.tenantId, proposalId, type: 'SYSTEM', source: 'SISTEMA', actorId: actor.id, message: 'Financiamento lançado na negociação; previsão de recebimento criada no financeiro.' })
    return { paymentId: payment.id, before, after: `${data.bank ?? 'Financiamento'} ${Number(value).toFixed(2)}`, changed: true }
  })
  if (result.changed) {
    await logDealChild(deal.id, { id: actor.id, name: actor.name ?? null, role: actor.role }, 'pagamento', result.before, result.after)
    await syncDealFinanceSafe(deal.id)
  }
  await saveTrack(p.tenantId, result.paymentId, { stage: 'APROVADO', proposalNumber: p.code ?? undefined }, actor)
  return { paymentId: result.paymentId }
}

async function setDealPaymentStatus(paymentId: string, status: 'CONFIRMADO' | 'CANCELADO' | 'PENDENTE', actor: Actor, paidAt: Date | null) {
  const pay = await prisma.dealPayment.findUnique({ where: { id: paymentId }, select: { id: true, dealId: true, status: true, bank: true, value: true, tenantId: true } })
  if (!pay || pay.status === status) return
  if (status === 'CANCELADO' && pay.status === 'CONFIRMADO') throw new FiError('O banco já pagou este financiamento. Use o estorno no financeiro.', 409)
  await prisma.dealPayment.update({ where: { id: paymentId }, data: { status, ...(status === 'CONFIRMADO' ? { paidAt: paidAt ?? new Date() } : status === 'PENDENTE' ? { paidAt: null } : {}) } })
  await logDealChild(pay.dealId, { id: actor.id, name: actor.name ?? null, role: actor.role }, 'pagamento', `${pay.bank ?? 'Financiamento'} (${pay.status ?? 'PENDENTE'})`, `${pay.bank ?? 'Financiamento'} (${status})`)
  if (status === 'CONFIRMADO') await markTrackPaid(pay.tenantId, pay.id, paidAt ?? new Date())
  await syncDealFinanceSafe(pay.dealId)
}

// ── Pós-aprovação: formalização, gravame e pagamento do banco ────────────────
export type PostKind = 'formalization' | 'lien' | 'funding'
export interface PostInput { to: string; contractNumber?: string | null; date?: string | null; amount?: number | null; note?: string | null }

const TRACK_STAGE: Record<string, string | undefined> = {
  'formalization:EM_ANDAMENTO': 'FORMALIZACAO', 'formalization:AGUARDANDO_DOCUMENTOS': 'FORMALIZACAO', 'formalization:AGUARDANDO_ASSINATURA': 'FORMALIZACAO',
  'formalization:ASSINADA': 'ASSINADO', 'formalization:CONCLUIDA': 'ASSINADO',
  'funding:ENVIADO_PAGAMENTO': 'ENVIADO_BANCO', 'funding:AGUARDANDO': 'AGUARDANDO_PAGAMENTO',
}

function dayOf(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  return m ? new Date(`${m[1]}T12:00:00.000Z`) : null
}

export async function advancePostApproval(proposalId: string, kind: PostKind, input: PostInput, actor: Actor) {
  const p = await loadFull(proposalId)
  if ((input.to === 'PAGO' || input.to === 'PAGO_PARCIAL') && kind === 'funding' && !p.dealId) {
    throw new FiError('Vincule a ficha a uma negociação antes de registrar o pagamento do banco — o recebimento entra no financeiro pela negociação.', 422, 'SEM_NEGOCIACAO')
  }
  const res = await prisma.$transaction(async (tx) => {
    await lockProposal(tx, proposalId)
    const cur = await tx.financeProposal.findUniqueOrThrow({ where: { id: proposalId } })
    const ctx = { proposalStatus: cur.status, hasSelectedOffer: !!cur.selectedSubmissionId, formalizationStatus: cur.formalizationStatus }
    const from = kind === 'formalization' ? cur.formalizationStatus : kind === 'lien' ? cur.lienStatus : cur.fundingStatus
    const check = kind === 'formalization' ? checkFormalizationTransition(from, input.to, ctx)
      : kind === 'lien' ? checkLienTransition(from, input.to, ctx) : checkFundingTransition(from, input.to, ctx)
    if (!check.ok) throw new FiError(check.reason, 409, 'TRANSICAO')
    const contractNumber = input.contractNumber?.trim().slice(0, 60) || null
    if (check.noop && !contractNumber) return { noop: true as const, cur }
    const when = dayOf(input.date) ?? new Date()
    const data: Prisma.FinanceProposalUpdateInput = { revision: { increment: 1 } }
    let label = ''
    if (kind === 'formalization') {
      data.formalizationStatus = input.to
      if (contractNumber) data.contractNumber = contractNumber
      if (input.to === 'ASSINADA') data.contractSignedAt = when
      label = `Formalização: ${FORMALIZATION_META[input.to as keyof typeof FORMALIZATION_META].label}.`
    } else if (kind === 'lien') {
      data.lienStatus = input.to
      if (input.to === 'REGISTRADO') data.lienRegisteredAt = when
      label = `Gravame: ${LIEN_META[input.to as keyof typeof LIEN_META].label}.`
    } else {
      data.fundingStatus = input.to
      if (input.to === 'AGUARDANDO' && input.date) data.fundingExpectedAt = when
      if (input.to === 'ENVIADO_PAGAMENTO') data.fundingRequestedAt = when
      if (input.to === 'PAGO' || input.to === 'PAGO_PARCIAL') {
        const amount = input.amount ?? n(cur.approvedValue)
        if (input.to === 'PAGO_PARCIAL' && !(amount && amount > 0)) throw new FiError('Informe o valor pago pelo banco.', 422)
        data.fundedAt = when; data.fundedAmount = dec(amount)
      }
      label = `Pagamento do banco: ${FUNDING_META[input.to as keyof typeof FUNDING_META].label}.`
    }
    await tx.financeProposal.update({ where: { id: proposalId }, data })
    await addTimeline(tx, {
      tenantId: p.tenantId, proposalId, type: kind === 'formalization' ? 'FORMALIZATION' : kind === 'lien' ? 'LIEN' : 'FUNDING',
      status: input.to, source: 'MANUAL', actorId: actor.id, message: [label, input.note?.slice(0, 200)].filter(Boolean).join(' '),
    })
    return { noop: false as const, cur }
  })
  if (res.noop) return { changed: false }

  const fresh = await prisma.financeProposal.findUniqueOrThrow({ where: { id: proposalId } })
  await createSafeAuditLog({ userId: actor.id, tenantId: p.tenantId, action: `FI_${kind.toUpperCase()}_${input.to}`, entity: 'FinanceProposal', entityId: proposalId, userName: actor.name ?? null, userRole: actor.role })
  if (fresh.dealPaymentId) {
    if (kind === 'formalization' && fresh.contractNumber) {
      await prisma.dealPayment.updateMany({ where: { id: fresh.dealPaymentId, status: { not: 'CONFIRMADO' } }, data: { contractNumber: fresh.contractNumber } })
    }
    const stage = TRACK_STAGE[`${kind}:${input.to}`]
    if (stage) await saveTrack(p.tenantId, fresh.dealPaymentId, { stage, proposalNumber: fresh.code ?? undefined, ...(stage === 'ASSINADO' ? { signedAt: fresh.contractSignedAt?.toISOString() } : {}), ...(input.to === 'AGUARDANDO' && fresh.fundingExpectedAt ? { expectedCreditAt: fresh.fundingExpectedAt.toISOString() } : {}) }, actor)
    if (kind === 'funding' && input.to === 'PAGO') await setDealPaymentStatus(fresh.dealPaymentId, 'CONFIRMADO', actor, fresh.fundedAt)
  } else if (kind === 'formalization' || kind === 'lien') {
    // Sem negociação: tenta lançar agora (proposta escolhida + negociação vinculada depois).
    if (fresh.dealId) await linkFinancingToDeal(proposalId, actor)
  }
  if (kind === 'formalization' && input.to === 'ASSINADA') await reflectOnCrm(proposalId, 'CONTRATO_ASSINADO')
  if (kind === 'funding' && input.to === 'PAGO') {
    await reflectOnCrm(proposalId, 'BANCO_PAGOU')
    await notifyWatchers(proposalId, 'Banco pagou', 'O banco realizou o pagamento do financiamento.')
    await notifyRoles(p.tenantId, ['FINANCEIRO', 'GERENTE_ADMINISTRATIVO'], proposalId, 'Banco pagou', `Financiamento ${fresh.code ?? ''} pago pelo banco. Confira a conciliação.`)
  }
  if (kind === 'formalization' && input.to === 'AGUARDANDO_ASSINATURA') await notifyWatchers(proposalId, 'Contrato aguardando assinatura', 'O contrato de financiamento aguarda a assinatura do cliente.')
  return { changed: true }
}

/**
 * Reflexo do financeiro → F&I: recebimento do financiamento confirmado ou
 * reaberto em Recebimentos/baixa. A realidade do caixa prevalece.
 */
export async function reflectFinancingPayment(paymentId: string) {
  try {
    const pay = await prisma.dealPayment.findUnique({ where: { id: paymentId }, select: { id: true, type: true, status: true, paidAt: true, value: true, tenantId: true } })
    if (!pay || pay.type !== 'FINANCIAMENTO') return
    const p = await prisma.financeProposal.findFirst({ where: { dealPaymentId: paymentId }, select: { id: true, tenantId: true, fundingStatus: true } })
    if (!p) return
    if (pay.status === 'CONFIRMADO' && p.fundingStatus !== 'PAGO') {
      await prisma.$transaction(async (tx) => {
        await lockProposal(tx, p.id)
        await tx.financeProposal.update({ where: { id: p.id }, data: { fundingStatus: 'PAGO', fundedAt: pay.paidAt ?? new Date(), fundedAmount: pay.value, revision: { increment: 1 } } })
        await addTimeline(tx, { tenantId: p.tenantId, proposalId: p.id, type: 'FUNDING', status: 'PAGO', source: 'SISTEMA', message: 'Recebimento do banco confirmado no financeiro.' })
      })
      await reflectOnCrm(p.id, 'BANCO_PAGOU')
    } else if (pay.status !== 'CONFIRMADO' && p.fundingStatus === 'PAGO') {
      await prisma.$transaction(async (tx) => {
        await lockProposal(tx, p.id)
        await tx.financeProposal.update({ where: { id: p.id }, data: { fundingStatus: 'AGUARDANDO', fundedAt: null, fundedAmount: null, revision: { increment: 1 } } })
        await addTimeline(tx, { tenantId: p.tenantId, proposalId: p.id, type: 'FUNDING', status: 'AGUARDANDO', source: 'SISTEMA', message: 'Recebimento do banco reaberto no financeiro.' })
      })
    }
  } catch (err) {
    console.error('[fi/funding] falha ao refletir recebimento na ficha', { paymentId, err: err instanceof Error ? err.message : err })
  }
}

// ── Cancelamento ──────────────────────────────────────────────────────────────
export async function cancelProposal(proposalId: string, reason: string, actor: Actor) {
  const p = await loadFull(proposalId)
  const text = reason.trim()
  if (text.length < 3) throw new FiError('Informe o motivo do cancelamento.', 422)
  const opened = await prisma.$transaction(async (tx) => {
    await lockProposal(tx, proposalId)
    const cur = await tx.financeProposal.findUniqueOrThrow({ where: { id: proposalId } })
    if (cur.status === 'CANCELADA') return null
    if (cur.fundingStatus === 'PAGO' || cur.fundingStatus === 'PAGO_PARCIAL') throw new FiError('O banco já pagou. Use o estorno no financeiro.', 409)
    const open = await tx.financeProposalSubmission.findMany({ where: { proposalId, active: true, status: { in: ATTEMPT_OPEN } }, select: { id: true, mode: true, externalId: true, bankId: true } })
    for (const a of open) await tx.financeProposalSubmission.update({ where: { id: a.id }, data: { status: 'CANCELADA', statusReason: text.slice(0, 300) } })
    await tx.financeProposal.update({ where: { id: proposalId }, data: { status: 'CANCELADA', fundingStatus: 'NAO_ESPERADO', revision: { increment: 1 } } })
    await addTimeline(tx, { tenantId: p.tenantId, proposalId, type: 'STATUS_CHANGE', status: 'CANCELADA', source: 'MANUAL', actorId: actor.id, message: `Ficha cancelada: ${text.slice(0, 200)}` })
    return { open, dealPaymentId: cur.dealPaymentId }
  })
  if (!opened) return { changed: false }
  await createSafeAuditLog({ userId: actor.id, tenantId: p.tenantId, action: 'FI_CANCELAR', entity: 'FinanceProposal', entityId: proposalId, userName: actor.name ?? null, userRole: actor.role, afterData: { motivo: text.slice(0, 200) } })
  if (opened.dealPaymentId) await setDealPaymentStatus(opened.dealPaymentId, 'CANCELADO', actor, null)
  // Avisa o banco quando a integração permite (falha fica registrada, não desfaz o cancelamento local).
  for (const a of opened.open.filter((x) => x.mode === 'API' && x.externalId && x.bankId)) {
    const bank = await prisma.financeBank.findUnique({ where: { id: a.bankId! }, select: { id: true, name: true, adapterKey: true } })
    if (!bank) continue
    const r = await resolveBank(p.tenantId, bank)
    if (!r.live || !r.provider?.capabilities.cancel) continue
    const t0 = Date.now()
    try {
      await withTimeout(r.provider.cancel(a.externalId!, text, r.ctx), BANK_TIMEOUT_MS)
      await logIntegration({ tenantId: p.tenantId, adapterKey: bank.adapterKey, action: 'CANCELAR', status: 'OK', durationMs: Date.now() - t0, correlationId: r.ctx.correlationId, proposalId, submissionId: a.id })
    } catch (e) {
      await logIntegration({ tenantId: p.tenantId, adapterKey: bank.adapterKey, action: 'CANCELAR', status: 'ERRO', durationMs: Date.now() - t0, correlationId: r.ctx.correlationId, proposalId, submissionId: a.id, errorCode: e instanceof BankGatewayError ? e.code : 'DESCONHECIDO', message: e instanceof Error ? e.message : null })
      await addTimeline(prisma as unknown as Tx, { tenantId: p.tenantId, proposalId, submissionId: a.id, type: 'SYSTEM', source: 'SISTEMA', message: `Não conseguimos avisar o ${bank.name} sobre o cancelamento. Cancele também no portal do banco.` })
    }
  }
  await reflectOnCrm(proposalId, 'CANCELADA', text)
  return { changed: true }
}

// ── Portal do cliente (link seguro) ──────────────────────────────────────────
export const hashPortalToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function issuePortalLink(proposalId: string, actor: Actor, days = 7): Promise<{ token: string; expiresAt: Date }> {
  const p = await loadFull(proposalId)
  if (p.status === 'CANCELADA') throw new FiError('Ficha cancelada.', 409)
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + Math.min(Math.max(days, 1), 30) * 86_400_000)
  await prisma.$transaction(async (tx) => {
    await lockProposal(tx, proposalId)
    await tx.financeProposal.update({ where: { id: proposalId }, data: { portalTokenHash: hashPortalToken(token), portalTokenExpiresAt: expiresAt } })
    await addTimeline(tx, { tenantId: p.tenantId, proposalId, type: 'PORTAL', source: 'MANUAL', actorId: actor.id, message: 'Link seguro gerado para o cliente acompanhar e enviar documentos.' })
  })
  await createSafeAuditLog({ userId: actor.id, tenantId: p.tenantId, action: 'FI_LINK_CLIENTE', entity: 'FinanceProposal', entityId: proposalId, userName: actor.name ?? null, userRole: actor.role })
  return { token, expiresAt }
}

export async function findByPortalToken(token: string) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null
  const hash = hashPortalToken(token)
  // Link anterior da mesma ficha (cliente refez a simulação no site) continua valendo.
  const p = await prisma.financeProposal.findUnique({ where: { portalTokenHash: hash } })
    ?? await prisma.financeProposal.findFirst({ where: { originMeta: { path: ['portalTokenHashes'], array_contains: [hash] } } })
  if (!p || !p.portalTokenExpiresAt || p.portalTokenExpiresAt.getTime() < Date.now() || p.status === 'CANCELADA') return null
  return p
}

export { COMMON_REQUIRED }
