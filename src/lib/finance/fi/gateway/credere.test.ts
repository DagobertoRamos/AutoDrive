import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CredereAdapter, __resetCredereCachesForTests, attemptKey, customerPayload, decisionFromAttempt, evaluateCondition, febrabanFor, formatCpf,
  leadPayload, mapCredereState, matchDomain, parseCredereWebhook, pickVehicleModel, simulationPayload, splitAttemptKey, verifyCredereSignature,
} from './credere'
import { createHmac } from 'node:crypto'
import { retryAfterMs } from './types'
import { pickStore, signState, verifyState } from './credere-oauth'
import { listBankProviders, getBankProvider } from './registry'
import type { ApplicantPayload, BankContext, ProposalTerms } from './types'

const applicant: ApplicantPayload = {
  personType: 'PF',
  data: {
    nomeCompleto: 'José da Silva', cpf: '12345678909', dataNascimento: '1985-04-10', sexo: 'M', estadoCivil: 'Casado(a)', nacionalidade: 'Brasileira',
    naturalidade: 'São Paulo', naturalidadeUf: 'SP', nomeMae: 'Maria da Silva', rg: '12.345.678-9', rgOrgao: 'ssp', rgUf: 'SP', rgDataEmissao: '2005-01-02',
    celular: '(11) 98765-4321', email: 'jose@ex.com', cep: '01310-100', logradouro: 'Av. Paulista', numero: '1000', bairro: 'Bela Vista', cidade: 'São Paulo', estado: 'SP',
    tipoResidencia: 'ALUGADA', tempoResidenciaMeses: 30, valorAluguel: 1800, occupation: 'CLT', profissao: 'Programador', renda: 8500, empresaNome: 'ACME', dataAdmissao: '2020-02-01',
  },
}
const terms: ProposalTerms = {
  vehicleValue: 60000, downPayment: 20000, amount: 40000, installments: 48, storeUf: 'SP',
  vehicle: { fipeCode: '004519-5', modelYear: 2020, year: 2019, zeroKm: false },
}
const creds = { accessToken: 'tok', refreshToken: 'ref', expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(), storeId: '77', sellerCpf: '36977986859', sellerId: '411', storeUf: 'SP', storeCity: 'São Paulo' }
const leadDom = {
  gender: [{ id: 228, label: 'Masculino', identifier: 'M' }, { id: 229, label: 'Feminino', identifier: 'F' }],
  occupation: [{ id: 435, label: 'Empregado de empresa privada', identifier: '1' }, { id: 436, label: 'Autônomo', identifier: '11' }],
  profession: [{ id: 9, label: 'Programador', identifier: '234' }],
}
const custDom = {
  marital_status: [{ id: 2, label: 'Casado' }, { id: 1, label: 'Solteiro' }, { id: 5, label: 'Vive Maritalmente' }],
  genre: [{ id: 1, label: 'Masculino' }, { id: 2, label: 'Feminino' }],
  states: [{ id: 25, label: 'São Paulo' }, { id: 19, label: 'Rio de Janeiro' }],
  build_type: [{ id: 1, label: 'Quitada' }, { id: 2, label: 'Financiada' }, { id: 3, label: 'Alugada' }, { id: 4, label: 'Com Parentes' }],
  profession: [{ id: 234, label: 'Programador' }],
  professional_ocupation: [{ id: 1, label: 'Assalariado' }, { id: 2, label: 'Autônomo' }],
  phone_type: [{ id: 1, label: 'Celular' }, { id: 6, label: 'Residencial' }],
  address_type: [{ id: 1, label: 'Principal' }, { id: 4, label: 'Comercial' }],
}

describe('Credere — montadores', () => {
  it('lead com domínios da Credere', () => {
    const { lead } = leadPayload(applicant, leadDom)
    expect(lead).toMatchObject({ cpf_cnpj: '123.456.789-09', retrieve_gender: 'M', retrieve_occupation: '1', retrieve_profession: '234', phone_number: '+5511987654321', monthly_income: 850000, has_cnh: false })
    expect(lead.address).toMatchObject({ zip_code: '01310100', state: 'SP', number: '1000' })
  })
  it('simulação em centavos, só no banco roteado', () => {
    const p = simulationPayload(applicant, terms, creds, '655', 18, { uf: 'SP', city: 'São Paulo' })
    expect(p.simulation).toMatchObject({ seller_cpf: '36977986859', assets_value: 6000000, bank_febraban_codes: ['655'], retrieve_lead: { cpf_cnpj: '123.456.789-09' } })
    expect(p.simulation.conditions[0]).toEqual({ installments: 48, down_payment: 2000000, financed_amount: 4000000, bank_febraban_code: '655' })
    expect(p.simulation.vehicle).toMatchObject({ credere_vehicle_model_id: 18, manufacture_year: 2019, model_year: 2020, zero_km: false })
    expect(() => simulationPayload(applicant, { ...terms, vehicle: {} }, creds, '655', 1, { uf: 'SP', city: 'X' })).toThrow(/FIPE/)
  })
  it('cliente com IDs dos domínios', () => {
    const { customer } = customerPayload(applicant, custDom)
    expect(customer).toMatchObject({ cpf: '123.456.789-09', born_at: '10/04/1985', marital_status_id: 2, genre_id: 1, state_of_birth_id: 25, rg_state_id: 25, rg_issuing: 'SSP', nationality: 'Brasileira' })
    expect(customer.address).toMatchObject({ build_type_id: 3, state_id: 25, set_time_year: 2, set_time_month: 6, rent_value_cents: 180000, address_type_id: 1 })
    expect(customer.job_reference).toMatchObject({ professional_ocupation_id: 1, profession_id: 234, income_cents: 850000, joined_at: '01/02/2020' })
    expect(customer.phones[0]).toEqual({ code: 11, number: 987654321, phone_type_id: 1 })
    expect(() => customerPayload({ ...applicant, personType: 'PJ' }, custDom)).toThrow(/PJ/)
  })
  it('domínio por sinônimo e modelo pelo ano', () => {
    expect(matchDomain(custDom.marital_status, 'união estável', ['Vive Maritalmente'])?.id).toBe(5)
    expect(pickVehicleModel([{ id: 1, year_start: 2010, year_end: 2015 }, { id: 2, year_start: 2016, year_end: 2022 }], 2020)).toBe(2)
    expect(formatCpf('12345678000199')).toBe('12.345.678/0001-99')
  })
})

describe('Credere — resultado e status', () => {
  const sim = (c: object) => ({ uuid: 'u', conditions: [{ id: 9, installments: 48, available: true, success: true, bank: { febraban_code: '655' }, processed_at: 'x', first_installment_value: 120159, financed_amount: 4000000, down_payment: 2000000, ...c }] })
  it('condição usável, restrição e entrada mínima', () => {
    expect(evaluateCondition(sim({}), '655', 48)).toMatchObject({ ok: { id: 9 } })
    expect(evaluateCondition(sim({ pre_approval_status: 1 }), '655', 48)).toMatchObject({ refuse: expect.stringContaining('restrição') })
    expect(evaluateCondition(sim({ available: false, reason_identifier: 'down_payment_less_than_minimum_value', bank_minimum_down_payment: 2500000 }), '655', 48)).toMatchObject({ refuse: expect.stringContaining('25.000,00') })
    expect(evaluateCondition({ conditions: [] }, '655', 48)).toMatchObject({ refuse: expect.stringContaining('credencial') })
  })
  it('estados da tentativa', () => {
    expect(mapCredereState('análise')).toBe('EM_ANALISE')
    expect(mapCredereState('pré_aprovada')).toBe('PRE_APROVADA')
    expect(mapCredereState('restrição')).toBe('RECUSADA')
    expect(mapCredereState('desistencia')).toBe('CANCELADA')
    expect(mapCredereState('pago')).toBe('APROVADA')
    expect(mapCredereState('???')).toBeNull()
    expect(decisionFromAttempt('1:2', { state: 'aprovada', term_financing: 48, quota_in_cents: 120000, financed_amount_in_cents: 4000000 })).toMatchObject({ status: 'APROVADA', offer: { installments: 48, installmentValue: 1200, approvedAmount: 40000 } })
  })
  it('webhook só identifica a tentativa (status vem da consulta)', () => {
    const [ev] = parseCredereWebhook({ proposal_attempt: { id: 2, proposal_id: 1, state: 'aprovada', updated_at: 't' } })
    expect(ev).toMatchObject({ externalId: '1:2', decision: null })
    expect(parseCredereWebhook({ foo: 1 })).toEqual([])
    expect(splitAttemptKey(attemptKey(10, 20))).toEqual({ proposalId: '10', attemptId: '20' })
  })
  it('código Febraban do banco', () => {
    expect(febrabanFor({ adapterKey: 'bv', code: null, name: 'x' })).toBe('655')
    expect(febrabanFor({ adapterKey: null, code: '033', name: 'x' })).toBe('033')
    expect(febrabanFor({ adapterKey: null, code: null, name: 'Banco PAN S.A.' })).toBe('623')
    expect(febrabanFor({ adapterKey: null, code: null, name: 'Financeira Z' })).toBeNull()
  })
  it('é reserva automática: não aparece como canal escolhível', () => {
    expect(getBankProvider('credere')?.official).toBe(true)
    expect(listBankProviders().some((p) => p.key === 'credere')).toBe(false)
  })
})

describe('Credere — OAuth', () => {
  it('state assinado com loja, usuário e validade', () => {
    process.env.NEXTAUTH_SECRET = 'segredo-de-teste-123'
    const st = signState('loja1', 'user1')
    expect(verifyState(st)).toEqual({ tenantId: 'loja1', userId: 'user1' })
    expect(verifyState(st.slice(0, -2) + 'xx')).toBeNull()
    expect(verifyState(signState('l', 'u', Date.now() - 20 * 60_000))).toBeNull()
  })
  it('loja da Credere pelo CNPJ', () => {
    const stores = [{ id: 1, name: 'A', cnpj: '111', uf: 'SP', city: 'X' }, { id: 2, name: 'B', cnpj: '12345678000199', uf: 'SP', city: 'Y' }]
    expect(pickStore(stores, '12.345.678/0001-99')?.id).toBe(2)
    expect(pickStore(stores, null)?.id).toBe(1)
  })
})

describe('Credere — envio ponta a ponta (API simulada)', () => {
  afterEach(() => { vi.unstubAllGlobals(); __resetCredereCachesForTests() })
  it('lead → veículo → simulação → cliente → proposta → analyze', async () => {
    const calls: string[] = []
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const u = new URL(url); const key = `${init?.method ?? 'GET'} ${u.pathname.replace('/api', '')}`
      calls.push(key)
      if (key === 'GET /v1/banks_api/domains') return json({ data: { gender: leadDom.gender.map((g) => ({ ...g, credere_identifier: g.identifier })), occupation: [], profession: [] } })
      if (key === 'GET /v1/banks_api/leads/12345678909') return json({ error: 'not found' }, 404)
      if (key === 'POST /v1/banks_api/leads') return json({ data: {} }, 201)
      if (key === 'GET /v1/vehicle_models') return json({ vehicle_models: [{ id: 18, year_start: 2016, year_end: 2022, active: true }] })
      if (key === 'POST /v1/banks_api/simulations') return json({ data: { uuid: 'sim-1', conditions: [{ id: 5, installments: 48, available: true, success: true, bank: { febraban_code: '655' }, process_task: { ended_at: 'x' }, first_installment_value: 150000, financed_amount: 4000000, down_payment: 2000000 }] } }, 201)
      if (key === 'GET /v1/domains') return json({ domains: { marital_status: custDom.marital_status.map((x) => ({ id: x.id, name: x.label })), states: custDom.states.map((x) => ({ id: x.id, name: x.label })) } })
      if (key === 'GET /v1/customers/find') return json({ error: 'not found' }, 404)
      if (key === 'POST /v1/customers') return json({ customer: { id: 321 } }, 201)
      if (key === 'POST /v1/proposals') {
        const body = JSON.parse(String(init?.body))
        expect(body.proposal).toMatchObject({ customer_id: 321, seller_id: 411, store_id: 77, proposal_attemps: { external_simulation_uuid: 'sim-1', simulation_condition_id: 5 } })
        return json({ complete_proposal: { id: 1000, proposal_attempt: { id: 2000, state: 'checagem' } } }, 201)
      }
      if (key === 'GET /v1/proposals/1000/proposal_attempts/2000/analyze') return json({ proposal_attempt: { id: 2000, state: 'análise' } })
      return json({ error: `inesperado ${key}` }, 500)
    }))
    const ctx: BankContext = { tenantId: 't1', environment: 'HOMOLOGACAO', credentials: { ...creds }, correlationId: 'c', routedBankCode: '655' }
    const d = await new CredereAdapter().submitProposal(applicant, terms, ctx)
    expect(d).toMatchObject({ externalId: '1000:2000', status: 'EM_ANALISE', offer: { installments: 48, installmentValue: 1500 } })
    expect(calls).toContain('POST /v1/proposals')
    expect(calls.at(-1)).toBe('GET /v1/proposals/1000/proposal_attempts/2000/analyze')
  })
  it('recusa sem criar proposta quando o banco barra a condição', async () => {
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const p = new URL(url).pathname.replace('/api', ''); const m = init?.method ?? 'GET'
      if (p.startsWith('/v1/banks_api/domains')) return json({ data: {} })
      if (p.startsWith('/v1/banks_api/leads/')) return json({ data: {} })
      if (p === '/v1/banks_api/leads/12345678909' && m === 'PATCH') return json({ data: {} })
      if (p === '/v1/vehicle_models') return json({ vehicle_models: [{ id: 18 }] })
      if (p === '/v1/banks_api/simulations') return json({ data: { uuid: 's', conditions: [{ id: 1, installments: 48, pre_approval_status: 1, bank: { febraban_code: '655' }, processed_at: 'x' }] } }, 201)
      return json({ error: `inesperado ${m} ${p}` }, 500)
    })
    vi.stubGlobal('fetch', fetchMock)
    const ctx: BankContext = { tenantId: 't2', environment: 'HOMOLOGACAO', credentials: { ...creds }, correlationId: 'c', routedBankCode: '655' }
    const d = await new CredereAdapter().submitProposal(applicant, terms, ctx)
    expect(d.status).toBe('RECUSADA')
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/v1/proposals'))).toBe(false)
  })
})

describe('Credere — assinatura do webhook (X-Credere-Signature)', () => {
  const secret = 'whsec_loja_123456'
  const body = '{"event":"proposal_attempt.updated","event_id":"ev-1","proposal_attempt":{"id":2000}}'
  const now = Date.parse('2026-10-17T15:00:00Z')
  const t = Math.floor(now / 1000)
  const sign = (b: string, ts = t, key = secret) => `t=${ts},v1=${createHmac('sha256', key).update(`${ts}.${b}`).digest('hex')}`

  it('aceita a assinatura da documentação (HMAC de "{t}.{corpo bruto}")', () => {
    expect(verifyCredereSignature(body, sign(body), secret, now)).toBe(true)
    expect(verifyCredereSignature(body, ` t=${t} , v1=${sign(body).split('v1=')[1].toUpperCase()} `, secret, now)).toBe(true)
  })
  it('recusa corpo alterado, outro secret, cabeçalho ausente ou malformado', () => {
    expect(verifyCredereSignature(body.replace('2000', '2001'), sign(body), secret, now)).toBe(false)
    expect(verifyCredereSignature(body, sign(body, t, 'outro-secret-qualquer'), secret, now)).toBe(false)
    expect(verifyCredereSignature(body, null, secret, now)).toBe(false)
    expect(verifyCredereSignature(body, 'v1=abc', secret, now)).toBe(false)
    expect(verifyCredereSignature(body, sign(body), '', now)).toBe(false)
  })
  it('recusa assinatura antiga ou do futuro (mais de 5 min): impede reenvio de aviso capturado', () => {
    expect(verifyCredereSignature(body, sign(body, t - 301), secret, now)).toBe(false)
    expect(verifyCredereSignature(body, sign(body, t + 301), secret, now)).toBe(false)
    expect(verifyCredereSignature(body, sign(body, t - 290), secret, now)).toBe(true)
  })
})

describe('Credere — limite de consultas (HTTP 429)', () => {
  afterEach(() => { vi.unstubAllGlobals(); __resetCredereCachesForTests() })
  it('vira "tentar de novo depois" (não chegou; não é recusa), com o Retry-After da Credere', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { 'Retry-After': '120' } })))
    const ctx: BankContext = { tenantId: 't3', environment: 'HOMOLOGACAO', credentials: { ...creds }, correlationId: 'c', routedBankCode: '655' }
    await expect(new CredereAdapter().submitProposal(applicant, terms, ctx)).rejects.toMatchObject({ code: 'INDISPONIVEL', delivered: 'NAO', retryAfterMs: 120_000 })
    await expect(new CredereAdapter().getStatus('1:2', ctx)).rejects.toMatchObject({ retryAfterMs: 120_000 })
  })
  it('Retry-After em segundos, em data HTTP ou ausente (padrão 15 min, entre 1 min e 6 h)', () => {
    const now = Date.parse('2026-10-17T15:00:00Z')
    expect(retryAfterMs('30', now)).toBe(60_000)
    expect(retryAfterMs('600', now)).toBe(600_000)
    expect(retryAfterMs('Fri, 17 Oct 2026 15:10:00 GMT', now)).toBe(600_000)
    expect(retryAfterMs(null, now)).toBe(900_000)
    expect(retryAfterMs('999999', now)).toBe(6 * 3_600_000)
  })
})
