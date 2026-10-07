// =============================================================================
// F&I Core — testes de INTEGRAÇÃO com Postgres real (travas, idempotência,
// máquina de estados, financeiro). Rodam quando FI_TEST_DATABASE_URL aponta para
// um banco de TESTE já migrado (nunca o de produção):
//   FI_TEST_DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_fi_test npx vitest run src/lib/finance/fi
// Sem a variável, a suíte é pulada.
// =============================================================================

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const DB = vi.hoisted(() => {
  const url = process.env.FI_TEST_DATABASE_URL
  if (url) { process.env.DATABASE_URL = url; process.env.DIRECT_URL = url }
  return url
})

vi.mock('@/services/notification.service', () => ({ notify: vi.fn(async () => {}), notifyMany: vi.fn(async () => {}) }))

import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { NotIntegratedBank } from './gateway/base'
import { __resetBankProvidersForTests, __setBankProviderForTests } from './gateway/registry'
import { BankGatewayError, type ApplicantPayload, type BankCapabilities, type BankChannel, type BankContext, type BankDecision, type ProposalTerms } from './gateway/types'
import {
  adjustProposal, advancePostApproval, applyDecision, cancelProposal, dispatchAttempt, findByPortalToken, FiError,
  issuePortalLink, linkFinancingToDeal, recordManualResponse, reflectFinancingPayment, selectOffer, sendToBanks, verifyAttempt,
} from './orchestrator'
import { syncDealFinance } from '@/lib/finance/deal-finance-sync'

// ── Banco falso controlável (canal TESTE: só existe em testes) ────────────────
type Behaviour = 'aprova' | 'recusa' | 'pendencia' | 'lento' | 'fora' | 'sem_resposta'
class FakeBank extends NotIntegratedBank {
  readonly channel: BankChannel = 'TESTE'
  readonly capabilities: BankCapabilities = { simulate: false, preAnalyze: false, submit: true, update: true, status: true, documents: false, formalize: false, contract: false, funding: false, cancel: true, webhook: true }
  behaviour: Behaviour = 'aprova'
  received = new Map<string, BankDecision>()
  calls = 0
  constructor(readonly key: string, readonly name: string) { super() }
  isIntegrated() { return true }
  async submitProposal(_a: ApplicantPayload, t: ProposalTerms, ctx: BankContext): Promise<BankDecision> {
    this.calls++
    if (this.behaviour === 'lento') await new Promise((r) => setTimeout(r, 400))
    if (this.behaviour === 'fora') throw new BankGatewayError('O banco está fora do ar.', 'INDISPONIVEL', 'NAO')
    if (this.behaviour === 'sem_resposta') throw new BankGatewayError('Sem resposta.', 'TEMPO_ESGOTADO', 'TALVEZ')
    const d: BankDecision = this.behaviour === 'recusa'
      ? { externalId: `EXT-${ctx.idempotencyKey}`, status: 'RECUSADA', reason: 'Política de crédito.' }
      : this.behaviour === 'pendencia'
        ? { externalId: `EXT-${ctx.idempotencyKey}`, status: 'PENDENTE', pendingItems: [{ key: 'RENDA', label: 'Comprovante de renda', kind: 'DOCUMENTO' }] }
        : { externalId: `EXT-${ctx.idempotencyKey}`, status: 'APROVADA', offer: { approvedAmount: t.amount, downPayment: t.downPayment, installments: t.installments, installmentValue: 2100, rateMonthly: 1.8, cetMonthly: 2.1 } }
    if (ctx.idempotencyKey) this.received.set(ctx.idempotencyKey, d)
    return d
  }
  async getStatus(externalId: string): Promise<BankDecision> {
    for (const d of this.received.values()) if (d.externalId === externalId) return d
    return { externalId, status: 'EM_ANALISE' }
  }
  async findByIdempotencyKey(key: string): Promise<BankDecision | null> { return this.received.get(key) ?? null }
  async cancel() {}
}

const run = randomUUID().slice(0, 8)
const fast = new FakeBank(`fake-a-${run}`, 'Banco A')
const other = new FakeBank(`fake-b-${run}`, 'Banco B')
let tenantId = ''
let otherTenantId = ''
let actor = { id: '', name: 'Teste F&I', role: 'ADM' }
const ids: Record<string, string> = {}

async function newProposal(extra: Record<string, unknown> = {}) {
  const p = await prisma.financeProposal.create({
    data: { tenantId, proponentId: ids.person, vehicleValue: 100000, downPayment: 20000, amountRequested: 80000, installments: 48, status: 'SIMULACAO', createdById: actor.id, ...extra },
  })
  return p.id
}
const consent = { confirmed: true, origin: 'INTERNO' as const }

describe.runIf(!!DB)('F&I Core — orquestrador (Postgres real)', () => {
  beforeAll(async () => {
    const t = await prisma.tenant.create({ data: { publicId: `FI-${run}`, slug: `fi-${run}`, name: `Loja F&I ${run}` } })
    const t2 = await prisma.tenant.create({ data: { publicId: `FI2-${run}`, slug: `fi2-${run}`, name: `Outra loja ${run}` } })
    tenantId = t.id; otherTenantId = t2.id
    const u = await prisma.user.create({ data: { name: 'Teste F&I', email: `fi-${run}@teste.local`, passwordHash: 'x', tenantId, role: 'ADM', status: 'ATIVO' } })
    actor = { id: u.id, name: u.name, role: 'ADM' }
    __setBankProviderForTests(fast); __setBankProviderForTests(other)
    ids.bankA = (await prisma.financeBank.create({ data: { tenantId, name: 'Banco A', adapterKey: fast.key } })).id
    ids.bankB = (await prisma.financeBank.create({ data: { tenantId, name: 'Banco B', adapterKey: other.key } })).id
    ids.bankManual = (await prisma.financeBank.create({ data: { tenantId, name: 'Banco Manual' } })).id
    ids.bankOther = (await prisma.financeBank.create({ data: { tenantId: otherTenantId, name: 'Banco da outra loja' } })).id
    ids.person = (await prisma.financeProponent.create({
      data: { tenantId, personType: 'PF', nomeCompleto: 'João da Silva', cpf: '52998224725', dataNascimento: new Date('1990-05-10'), celular: '11999990000', cep: '06400000', logradouro: 'Rua A', numero: '10', cidade: 'Barueri', estado: 'SP', occupation: 'CLT', renda: 8000,
        email: 'joao@exemplo.com', sexo: 'M', estadoCivil: 'SOLTEIRO', nacionalidade: 'Brasileira', naturalidade: 'São Paulo', naturalidadeUf: 'SP', pep: 'NAO',
        rg: '123456789', rgOrgao: 'SSP', rgUf: 'SP', rgDataEmissao: new Date('2010-01-01'), nomeMae: 'Ana da Silva', nomePai: 'José da Silva', bairro: 'Centro',
        tipoResidencia: 'PROPRIA', tempoResidenciaMeses: 60, profissao: 'Analista', empresaNome: 'ACME', empresaTelefone: '1133334444', cargo: 'Analista',
        dataAdmissao: new Date('2018-01-01'), empresaCep: '06400000', empresaLogradouro: 'Av B', empresaNumero: '100', empresaBairro: 'Centro', empresaCidade: 'Barueri', empresaEstado: 'SP' },
    })).id
    ids.co = (await prisma.financeProponent.create({ data: { tenantId, personType: 'PF', nomeCompleto: 'Maria da Silva', cpf: '11144477735', celular: '11988880000' } })).id
  })
  beforeEach(() => { fast.behaviour = 'aprova'; other.behaviour = 'aprova' })
  afterAll(async () => { __resetBankProvidersForTests(); await prisma.$disconnect() })

  it('cliente PF: envia a dois bancos (um integrado, um manual) sem travar e consolida a situação', async () => {
    const id = await newProposal()
    const res = await sendToBanks({ proposalId: id, bankIds: [ids.bankA, ids.bankManual], idempotencyKey: `k-${randomUUID()}`, actor, consent })
    expect(res.attempts).toHaveLength(2)
    const manual = res.attempts.find((a) => a.bankId === ids.bankManual)!
    expect(manual).toMatchObject({ status: 'ENVIADA', mode: 'MANUAL' })
    expect(res.dispatch).toHaveLength(1)
    expect(await dispatchAttempt(res.dispatch[0])).toBe('APROVADA')
    const p = await prisma.financeProposal.findUniqueOrThrow({ where: { id } })
    expect(p.status).toBe('APROVADA')
    const consentRow = await prisma.financeConsent.findFirst({ where: { proposalId: id, type: 'ENVIO_BANCO' } })
    expect(consentRow?.legalBasis).toBeTruthy()
    expect(consentRow?.sharedWith).toEqual(['Banco A', 'Banco Manual'])
  })

  it('clique duplicado (mesma chave) não cria segunda proposta', async () => {
    const id = await newProposal()
    const key = `k-${randomUUID()}`
    const a = await sendToBanks({ proposalId: id, bankIds: [ids.bankManual], idempotencyKey: key, actor, consent })
    const b = await sendToBanks({ proposalId: id, bankIds: [ids.bankManual], idempotencyKey: key, actor, consent })
    expect(b.attempts[0]).toMatchObject({ id: a.attempts[0].id, duplicate: true })
    expect(await prisma.financeProposalSubmission.count({ where: { proposalId: id } })).toBe(1)
  })

  it('duas abas / dois usuários enviando ao mesmo tempo: uma proposta por banco', async () => {
    const id = await newProposal()
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => sendToBanks({ proposalId: id, bankIds: [ids.bankManual, ids.bankB], idempotencyKey: `k-${randomUUID()}`, actor, consent })))
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    expect(await prisma.financeProposalSubmission.count({ where: { proposalId: id } })).toBe(2)
  })

  it('banco lento: estoura o tempo → "Verificando"; consulta confirma que não chegou → libera reenvio', async () => {
    const id = await newProposal()
    fast.behaviour = 'lento'
    const res = await sendToBanks({ proposalId: id, bankIds: [ids.bankA], idempotencyKey: `k-${randomUUID()}`, actor, consent })
    expect(await dispatchAttempt(res.dispatch[0], 50)).toBe('VERIFICANDO')
    // Não reenvia às cegas: banco com tentativa aberta não recebe outra.
    const again = await sendToBanks({ proposalId: id, bankIds: [ids.bankA], idempotencyKey: `k-${randomUUID()}`, actor, consent })
    expect(again.attempts[0].duplicate).toBe(true)
    // A chamada lenta terminou no banco (ficou registrada lá) → a consulta traz a resposta.
    await new Promise((r) => setTimeout(r, 450))
    expect(await verifyAttempt(res.dispatch[0], actor)).toBe('APROVADA')
  })

  it('sem resposta e o banco confirma que não recebeu → falha de envio e reenvio liberado', async () => {
    const id = await newProposal()
    fast.behaviour = 'sem_resposta'
    const res = await sendToBanks({ proposalId: id, bankIds: [ids.bankA], idempotencyKey: `k-${randomUUID()}`, actor, consent })
    expect(await dispatchAttempt(res.dispatch[0])).toBe('VERIFICANDO')
    expect(await verifyAttempt(res.dispatch[0], actor)).toBe('FALHA_ENVIO')
    fast.behaviour = 'aprova'
    const retry = await sendToBanks({ proposalId: id, bankIds: [ids.bankA], idempotencyKey: `k-${randomUUID()}`, actor, consent })
    expect(retry.attempts[0].duplicate).toBe(false)
    expect(await dispatchAttempt(retry.dispatch[0])).toBe('APROVADA')
  })

  it('banco indisponível (pedido não saiu) → "Não foi possível enviar", sem marcar como enviada', async () => {
    const id = await newProposal()
    fast.behaviour = 'fora'
    const res = await sendToBanks({ proposalId: id, bankIds: [ids.bankA], idempotencyKey: `k-${randomUUID()}`, actor, consent })
    expect(await dispatchAttempt(res.dispatch[0])).toBe('FALHA_ENVIO')
    expect((await prisma.financeProposal.findUniqueOrThrow({ where: { id } })).status).toBe('SIMULACAO')
    const log = await prisma.financeIntegrationLog.findFirst({ where: { submissionId: res.dispatch[0] } })
    expect(log).toMatchObject({ status: 'ERRO', errorCode: 'INDISPONIVEL' })
  })

  it('exige os campos do banco e a autorização do cliente antes de gravar qualquer coisa', async () => {
    await prisma.financeTenantSetting.upsert({ where: { tenantId_key: { tenantId, key: 'bank_required_fields' } }, create: { tenantId, key: 'bank_required_fields', value: { [ids.bankB]: ['cnh', 'escolaridade'] } }, update: { value: { [ids.bankB]: ['cnh', 'escolaridade'] } } })
    const id = await newProposal()
    await expect(sendToBanks({ proposalId: id, bankIds: [ids.bankB], idempotencyKey: `k-${randomUUID()}`, actor, consent })).rejects.toMatchObject({ code: 'CAMPOS_FALTANDO' })
    await expect(sendToBanks({ proposalId: id, bankIds: [ids.bankManual], idempotencyKey: `k-${randomUUID()}`, actor, consent: { confirmed: false } })).rejects.toMatchObject({ code: 'CONSENTIMENTO' })
    expect(await prisma.financeProposalSubmission.count({ where: { proposalId: id } })).toBe(0)
    await prisma.financeTenantSetting.delete({ where: { tenantId_key: { tenantId, key: 'bank_required_fields' } } })
  })

  it('banco de outra loja é recusado', async () => {
    const id = await newProposal()
    await expect(sendToBanks({ proposalId: id, bankIds: [ids.bankOther], idempotencyKey: `k-${randomUUID()}`, actor, consent })).rejects.toBeInstanceOf(FiError)
  })

  it('pendência do banco vira documento pedido; transição inválida é recusada', async () => {
    const id = await newProposal()
    const res = await sendToBanks({ proposalId: id, bankIds: [ids.bankManual], idempotencyKey: `k-${randomUUID()}`, actor, consent })
    const sid = res.attempts[0].id
    await recordManualResponse(sid, { status: 'PENDENTE', pendingItems: [{ key: 'CNH', label: 'CNH', kind: 'DOCUMENTO' }] }, actor)
    expect(await prisma.financeProposalDocument.count({ where: { proposalId: id, type: 'CNH', status: 'PENDENTE' } })).toBe(1)
    await recordManualResponse(sid, { status: 'RECUSADA', reason: 'Renda insuficiente' }, actor)
    await expect(recordManualResponse(sid, { status: 'APROVADA' }, actor)).rejects.toMatchObject({ code: 'TRANSICAO' })
  })

  it('webhook duplicado / atrasado não muda a operação duas vezes', async () => {
    const id = await newProposal()
    const res = await sendToBanks({ proposalId: id, bankIds: [ids.bankManual], idempotencyKey: `k-${randomUUID()}`, actor, consent })
    const sid = res.attempts[0].id
    expect((await applyDecision(sid, { status: 'APROVADA' }, { source: 'WEBHOOK' })).applied).toBe(true)
    expect((await applyDecision(sid, { status: 'APROVADA' }, { source: 'WEBHOOK' })).applied).toBe(false)
    const late = await applyDecision(sid, { status: 'EM_ANALISE' }, { source: 'WEBHOOK' })
    expect(late.applied).toBe(false)
    expect((await prisma.financeProposalSubmission.findUniqueOrThrow({ where: { id: sid } })).status).toBe('APROVADA')
    const evId = `ev-${randomUUID()}`
    await prisma.financeWebhookEvent.create({ data: { provider: fast.key, eventId: evId, payload: {} } })
    await expect(prisma.financeWebhookEvent.create({ data: { provider: fast.key, eventId: evId, payload: {} } })).rejects.toMatchObject({ code: 'P2002' })
  })

  it('ajustar proposta cria nova versão e preserva o histórico (com co-comprador)', async () => {
    const id = await newProposal()
    fast.behaviour = 'recusa'
    const r1 = await sendToBanks({ proposalId: id, bankIds: [ids.bankA], idempotencyKey: `k-${randomUUID()}`, actor, consent })
    expect(await dispatchAttempt(r1.dispatch[0])).toBe('RECUSADA')
    fast.behaviour = 'aprova'
    const key = `k-${randomUUID()}`
    const r2 = await adjustProposal({ proposalId: id, idempotencyKey: key, actor, downPayment: 30000, installments: 36, coProponentId: ids.co, consent })
    expect(await dispatchAttempt(r2.dispatch[0])).toBe('APROVADA')
    const all = await prisma.financeProposalSubmission.findMany({ where: { proposalId: id }, orderBy: { attemptVersion: 'asc' } })
    expect(all.map((a) => [a.attemptVersion, a.status, a.active])).toEqual([[1, 'RECUSADA', false], [2, 'APROVADA', true]])
    const p = await prisma.financeProposal.findUniqueOrThrow({ where: { id } })
    expect(Number(p.downPayment)).toBe(30000)
    expect(p.coProponentId).toBe(ids.co)
    // Repetir o mesmo ajuste não cria versão 3.
    await adjustProposal({ proposalId: id, idempotencyKey: key, actor, downPayment: 30000, installments: 36, consent })
    expect(await prisma.financeProposalSubmission.count({ where: { proposalId: id } })).toBe(2)
  })

  it('do aprovado ao dinheiro na conta: negociação, formalização, gravame, pagamento e financeiro', async () => {
    const deal = await prisma.deal.create({ data: { tenantId, status: 'APROVADA', saleAmount: 100000, dealNumber: `NEG-${run}` } })
    const id = await newProposal({ dealId: deal.id })
    const res = await sendToBanks({ proposalId: id, bankIds: [ids.bankA], idempotencyKey: `k-${randomUUID()}`, actor, consent })
    await dispatchAttempt(res.dispatch[0])
    await expect(advancePostApproval(id, 'funding', { to: 'PAGO' }, actor)).rejects.toMatchObject({ code: 'TRANSICAO' })
    await selectOffer(id, res.attempts[0].id, actor)
    let p = await prisma.financeProposal.findUniqueOrThrow({ where: { id } })
    expect(p.fundingStatus).toBe('AGUARDANDO')
    expect(p.dealPaymentId).toBeTruthy()
    const pay = await prisma.dealPayment.findUniqueOrThrow({ where: { id: p.dealPaymentId! } })
    expect(pay).toMatchObject({ type: 'FINANCIAMENTO', status: 'PENDENTE', bank: 'Banco A' })
    // Aplicar de novo não duplica receita.
    await linkFinancingToDeal(id, actor)
    expect(await prisma.dealPayment.count({ where: { dealId: deal.id, type: 'FINANCIAMENTO' } })).toBe(1)
    await syncDealFinance(deal.id)
    expect(await prisma.financialEntry.findFirst({ where: { dealId: deal.id, source: `NEG_PGTO_${pay.id}` } })).toMatchObject({ status: 'PREVISTO' })
    // Pagamento exige contrato assinado.
    await expect(advancePostApproval(id, 'funding', { to: 'PAGO' }, actor)).rejects.toMatchObject({ code: 'TRANSICAO' })
    await advancePostApproval(id, 'formalization', { to: 'EM_ANDAMENTO' }, actor)
    await advancePostApproval(id, 'formalization', { to: 'AGUARDANDO_ASSINATURA', contractNumber: 'CT-123' }, actor)
    await advancePostApproval(id, 'formalization', { to: 'ASSINADA', date: '2026-10-07' }, actor)
    await advancePostApproval(id, 'lien', { to: 'SOLICITADO' }, actor)
    await advancePostApproval(id, 'lien', { to: 'REGISTRADO' }, actor)
    await advancePostApproval(id, 'funding', { to: 'PAGO', date: '2026-10-08', amount: 80000 }, actor)
    p = await prisma.financeProposal.findUniqueOrThrow({ where: { id } })
    expect(p).toMatchObject({ fundingStatus: 'PAGO', lienStatus: 'REGISTRADO', formalizationStatus: 'ASSINADA', contractNumber: 'CT-123' })
    expect(await prisma.dealPayment.findUniqueOrThrow({ where: { id: pay.id } })).toMatchObject({ status: 'CONFIRMADO', contractNumber: 'CT-123' })
    expect(await prisma.financialEntry.findFirst({ where: { dealId: deal.id, source: `NEG_PGTO_${pay.id}` } })).toMatchObject({ status: 'RECEBIDO' })
    // Banco pagou → não dá para cancelar a ficha.
    await expect(cancelProposal(id, 'cliente desistiu', actor)).rejects.toBeInstanceOf(FiError)
    // Financeiro reabre o recebimento → a ficha volta a aguardar pagamento.
    await prisma.dealPayment.update({ where: { id: pay.id }, data: { status: 'PENDENTE', paidAt: null } })
    await reflectFinancingPayment(pay.id)
    expect((await prisma.financeProposal.findUniqueOrThrow({ where: { id } })).fundingStatus).toBe('AGUARDANDO')
  })

  it('cancelamento encerra as propostas abertas e o pagamento previsto na negociação', async () => {
    const deal = await prisma.deal.create({ data: { tenantId, status: 'APROVADA', saleAmount: 90000, dealNumber: `NEG2-${run}` } })
    const id = await newProposal({ dealId: deal.id })
    const res = await sendToBanks({ proposalId: id, bankIds: [ids.bankA, ids.bankManual], idempotencyKey: `k-${randomUUID()}`, actor, consent })
    await dispatchAttempt(res.dispatch[0])
    await selectOffer(id, res.attempts.find((a) => a.bankId === ids.bankA)!.id, actor)
    await cancelProposal(id, 'Cliente desistiu da compra', actor)
    const p = await prisma.financeProposal.findUniqueOrThrow({ where: { id } })
    expect(p.status).toBe('CANCELADA')
    expect(await prisma.financeProposalSubmission.count({ where: { proposalId: id, status: 'CANCELADA' } })).toBeGreaterThanOrEqual(1)
    expect((await prisma.dealPayment.findUniqueOrThrow({ where: { id: p.dealPaymentId! } })).status).toBe('CANCELADO')
    await expect(sendToBanks({ proposalId: id, bankIds: [ids.bankB], idempotencyKey: `k-${randomUUID()}`, actor, consent })).rejects.toBeInstanceOf(FiError)
  })

  it('link seguro do cliente: só o hash fica salvo, expira e morre com a ficha cancelada', async () => {
    const id = await newProposal()
    const { token } = await issuePortalLink(id, actor, 7)
    const p = await prisma.financeProposal.findUniqueOrThrow({ where: { id } })
    expect(p.portalTokenHash).not.toContain(token)
    expect((await findByPortalToken(token))?.id).toBe(id)
    expect(await findByPortalToken(`${token}x`)).toBeNull()
    await prisma.financeProposal.update({ where: { id }, data: { portalTokenExpiresAt: new Date(Date.now() - 1000) } })
    expect(await findByPortalToken(token)).toBeNull()
  })

  it('webhook: exige assinatura, deduplica evento, não aceita segredo na URL e ignora outro canal', async () => {
    const { createHmac } = await import('node:crypto')
    process.env.FINANCE_WEBHOOK_SECRET = 'segredo-de-teste-com-mais-de-16'
    const { POST } = await import('@/app/api/webhook/financing/[provider]/route')
    const id = await newProposal()
    const res = await sendToBanks({ proposalId: id, bankIds: [ids.bankA], idempotencyKey: `k-${randomUUID()}`, actor, consent })
    fast.behaviour = 'pendencia'
    await dispatchAttempt(res.dispatch[0])
    const sub = await prisma.financeProposalSubmission.findUniqueOrThrow({ where: { id: res.dispatch[0] } })
    const body = JSON.stringify({ eventId: `ev-${randomUUID()}`, externalId: sub.externalId, status: 'aprovada' })
    const sign = (b: string) => createHmac('sha256', process.env.FINANCE_WEBHOOK_SECRET!).update(b).digest('hex')
    const call = (b: string, headers: Record<string, string>, provider = fast.key, qs = '') =>
      POST(new Request(`http://localhost/api/webhook/financing/${provider}${qs}`, { method: 'POST', body: b, headers }), { params: Promise.resolve({ provider }) })
    expect((await call(body, {})).status).toBe(401)
    expect((await call(body, {}, fast.key, `?secret=${process.env.FINANCE_WEBHOOK_SECRET}`)).status).toBe(401)
    const ok = await call(body, { 'x-signature': sign(body) })
    expect(ok.status).toBe(200)
    expect((await prisma.financeProposalSubmission.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('APROVADA')
    const dup = await (await call(body, { 'x-signature': sign(body) })).json()
    expect(dup.results[0].duplicate).toBe(true)
    // Mesmo id externo chegando por outro canal não toca nesta proposta.
    const other = JSON.stringify({ eventId: `ev-${randomUUID()}`, externalId: sub.externalId, status: 'recusada' })
    const r = await (await call(other, { 'x-signature': sign(other) }, `fake-b-${run}`)).json()
    expect(r.results[0].processed).toBe(false)
    expect((await prisma.financeProposalSubmission.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('APROVADA')
  })

  it('código FI-AAAA-NNNNNN sem repetição mesmo com criação simultânea', async () => {
    const { nextFiCode } = await import('./orchestrator')
    const codes = await Promise.all(Array.from({ length: 6 }, () => prisma.$transaction((tx) => nextFiCode(tx, tenantId).then(async (code) => { await tx.financeProposal.create({ data: { tenantId, proponentId: ids.person, code } }); return code }))))
    expect(new Set(codes).size).toBe(6)
    expect(codes.every((c) => /^FI-\d{4}-\d{6}$/.test(c))).toBe(true)
  })
})
