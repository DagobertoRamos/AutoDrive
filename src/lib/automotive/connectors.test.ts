import { describe, it, expect, vi, afterEach } from 'vitest'
import { defaultFiscalRules, normalizeFiscalRules, cfopFor, icmsReductionOn } from './fiscal-rules'
import { buildNfeDraft, missingForDraft, tPagOf, type DraftInput } from './nfe-draft'
import { zapay, celcoin, partnerVehicleData } from './gateways/vehicle-data'
import { focusNfe } from './gateways/fiscal-api'
import { partnerRenave } from './gateways/partner'
import { providerEntry, providersFor } from './providers-catalog'

const base = (over: Partial<DraftInput> = {}): DraftInput => ({
  reference: 'TXN-2026-0000001-1', operation: 'SALE',
  rules: { ...defaultFiscalRules('SP', 'NORMAL'), ncmDefault: '87032310' },
  issuer: { cnpj: '11.222.333/0001-81', ie: '123', uf: 'SP' },
  counterpart: { name: 'João', doc: '529.982.247-25', street: 'Rua A', number: '10', district: 'Centro', city: 'São Paulo', cityCode: '3550308', uf: 'SP', zip: '01001-000' },
  vehicle: { brand: 'Toyota', model: 'Corolla', chassi: '9BWZZZ377VT004251', renavam: '12345678900', plate: 'ABC1D23', year: 2020, modelYear: 2021 },
  amount: 100000, cost: 82000, now: new Date('2026-10-07T12:00:00-03:00'),
  ...over,
})

describe('regras fiscais pré-preenchidas', () => {
  it('SP: 90% de redução até 31/12/2026; outras UFs: 80% a confirmar', () => {
    expect(defaultFiscalRules('SP').icms).toMatchObject({ reducaoPct: 90, validoAte: '2026-12-31' })
    expect(defaultFiscalRules('MG').icms.reducaoPct).toBe(80)
    expect(icmsReductionOn(defaultFiscalRules('SP'), new Date('2027-01-02')).expired).toBe(true)
  })
  it('CFOPs de veículo usado', () => {
    const r = defaultFiscalRules('SP')
    expect(cfopFor(r, 'SALE', false)).toBe('5102')
    expect(cfopFor(r, 'SALE', true)).toBe('6102')
    expect(cfopFor(r, 'CONSIGNED_SALE', false)).toBe('5115')
    expect(cfopFor(r, 'CONSIGNMENT_IN', false)).toBe('1917')
    expect(cfopFor(r, 'PURCHASE', false)).toBe('1102')
  })
  it('normaliza entrada da tela (CFOP/NCM inválidos voltam ao padrão)', () => {
    const r = normalizeFiscalRules({ regime: 'NORMAL', ncmDefault: '8703.23.10', cfop: { saleInState: '51' }, icms: { reducaoPct: 500 } }, 'SP')
    expect(r.ncmDefault).toBe('87032310')
    expect(r.cfop.saleInState).toBe('5102')
    expect(r.icms.reducaoPct).toBe(90)
  })
})

describe('rascunho da NF-e', () => {
  it('venda regime normal em SP: base reduzida e PIS/COFINS sobre a margem', () => {
    const d = buildNfeDraft(base())
    expect(d.item.cfop).toBe('5102')
    expect(d.item.icms).toMatchObject({ mode: 'CST', cst: '20', reducaoPct: 90, base: 10000, aliquota: 18, value: 1800 })
    expect(d.item.pis).toMatchObject({ base: 18000, value: 117 })
    expect(d.item.cofins.value).toBe(540)
    expect(d.item.extra).toContain('CHASSI 9BWZZZ377VT004251')
    expect(d.counterpart.doc).toBe('52998224725')
    expect(d.finalConsumer).toBe(true)
  })
  it('interestadual e consignado', () => {
    expect(buildNfeDraft(base({ counterpart: { ...base().counterpart, uf: 'RJ' } })).item.cfop).toBe('6102')
    expect(buildNfeDraft(base({ operation: 'CONSIGNED_SALE' })).item.cfop).toBe('5115')
  })
  it('Simples: CSOSN 102, sem destaque', () => {
    const d = buildNfeDraft(base({ rules: { ...defaultFiscalRules('SP', 'SIMPLES'), ncmDefault: '87032310' } }))
    expect(d.item.icms).toEqual({ mode: 'CSOSN', csosn: '102' })
    expect(d.item.pis.value).toBe(0)
  })
  it('aponta o que falta', () => {
    const m = missingForDraft(base({ rules: defaultFiscalRules('SP'), counterpart: { name: 'X', doc: '1' } }))
    expect(m).toEqual(expect.arrayContaining(['NCM padrão nas regras fiscais', 'CPF/CNPJ do cliente', 'CEP do cliente']))
  })
  it('forma de pagamento', () => {
    expect(tPagOf('PIX')).toBe('17')
    expect(tPagOf('FINANCIAMENTO')).toBe('99')
  })
})

describe('catálogo', () => {
  it('cada área tem modo manual e indicados', () => {
    for (const d of ['RENAVE', 'FISCAL', 'TRANSFER', 'VEHICLE_DATA'] as const) expect(providersFor(d).length).toBeGreaterThan(1)
    expect(providerEntry('FISCAL', 'FOCUS_NFE')?.mode).toBe('API')
    expect(providerEntry('RENAVE', 'INTEGRARENAVE')?.mode).toBe('PARCEIRO')
  })
})

describe('adapters (respostas simuladas)', () => {
  afterEach(() => vi.unstubAllGlobals())
  const stub = (handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) => {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      const r = handler(url, init)
      return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status ?? 200 })
    }))
    return calls
  }

  it('Zapay: envia request_id e lê o webhook de débitos', async () => {
    const calls = stub(() => ({ body: { request_id: 'r-1' } }))
    const r = await zapay.consult({ tenantId: 't', credentials: { username: 'u', password: 'p' }, environment: 'HOMOLOGACAO' }, { plate: 'AAA0001', renavam: '1', reference: 'q-1' })
    expect(r).toMatchObject({ state: 'PROCESSING', externalId: 'r-1' })
    expect(calls[0].url).toContain('api.b2b.sandbox.usezapay.com.br/v2/vehicle/debts')
    expect(JSON.parse(String(calls[0].init.body)).request_id).toBe('q-1')
    const w = zapay.parseWebhook!({ event: 'vehicle_debt_found', data: { request_id: 'r-1', debts: [{ id: 9, type: 'ipva-unique', title: 'IPVA 2026', amount: 1500.5, due_date: '2026-03-10', is_expired: true }, { type: 'licensing', title: 'Licenciamento', amount: 160 }] } })
    expect(w?.result.debts.map((d) => d.type)).toEqual(['IPVA', 'LICENCIAMENTO'])
    expect(w?.result.debts[0]).toMatchObject({ amount: 1500.5, expired: true })
    expect(zapay.parseWebhook!({ event: 'vehicle_debt_unavailable', data: { request_id: 'r-1' } })?.result.state).toBe('UNAVAILABLE')
  })

  it('Celcoin: token OAuth2 e consulta concluída', async () => {
    stub((url) => url.endsWith('/v5/token') ? { body: { access_token: 'tok', expires_in: 2400 } } : { body: { status: 'SUCCESS', idConsult: 77, debts: [{ amount: 88.38, description: 'Multa', type: 'Infração', isExpired: true }] } })
    const r = await celcoin.consult({ tenantId: 't', credentials: { clientId: 'a', clientSecret: 'b' }, environment: 'HOMOLOGACAO', connectionId: 'c1' }, { plate: 'ABC1D23', reference: 'q-2' })
    expect(r).toMatchObject({ state: 'DONE', externalId: '77' })
    expect(r.debts[0].type).toBe('MULTA')
  })

  it('parceiro: restrições normalizadas e chave recusada vira recusa definitiva', async () => {
    stub(() => ({ body: { id: 'p1', status: 'DONE', debts: [], restrictions: [{ kind: 'renajud', description: 'Bloqueio judicial', blocking: true }] } }))
    const p = partnerVehicleData('INFOSIMPLES', 'Infosimples')
    const r = await p.consult({ tenantId: 't', credentials: { baseUrl: 'https://x.test', apiKey: 'k' } }, { plate: 'ABC1D23', reference: 'q-3' })
    expect(r.restrictions[0]).toMatchObject({ kind: 'RENAJUD', blocking: true })
    stub(() => ({ status: 401, body: { message: 'invalid key' } }))
    expect((await p.test({ tenantId: 't', credentials: { baseUrl: 'https://x.test', apiKey: 'k' } })).ok).toBe(false)
  })

  it('RENAVE parceiro: Idempotency-Key = referência da operação; timeout não é recusa', async () => {
    const calls = stub(() => ({ body: { id: 'e1', status: 'CONFIRMED', protocol: 'P-1' } }))
    const p = partnerRenave('INTEGRARENAVE', 'IntegraRenave')
    const r = await p.enterStock({ tenantId: 't', credentials: { baseUrl: 'https://int.test/', apiKey: 'k' } }, { vehicle: { vehicleId: 'v1' }, reference: 'RENAVE:ENTER_STOCK:op1' })
    expect(r).toMatchObject({ state: 'CONFIRMED', protocol: 'P-1' })
    expect((calls[0].init.headers as Record<string, string>)['Idempotency-Key']).toBe('RENAVE:ENTER_STOCK:op1')
    expect(calls[0].url).toBe('https://int.test/renave/entradas')
    stub(() => ({ status: 503, body: {} }))
    await expect(p.exitStock({ tenantId: 't', credentials: { baseUrl: 'https://int.test', apiKey: 'k' } }, { vehicle: { vehicleId: 'v1' } })).rejects.toMatchObject({ rejected: false })
  })

  it('Focus NFe: emite com ref, lê autorização e baixa o XML', async () => {
    const calls = stub((url) => {
      if (url.includes('?ref=')) return { status: 202, body: { status: 'processando_autorizacao' } }
      if (url.includes('/arquivos/')) return { body: '<nfeProc>xml</nfeProc>' }
      return { body: { status: 'autorizado', chave_nfe: '35261011222333000181550010000012341000001234', numero: '1234', serie: '1', caminho_xml_nota_fiscal: '/arquivos/x.xml' } }
    })
    const ctx = { tenantId: 't', credentials: { token: 'tok' }, environment: 'HOMOLOGACAO' as const }
    const e = await focusNfe.emit(ctx, { model: 'NFE', reference: 'TXN-1-1', payload: buildNfeDraft(base()) as never })
    expect(e).toMatchObject({ state: 'PROCESSING', externalId: 'TXN-1-1' })
    const sent = JSON.parse(String(calls[0].init.body))
    expect(sent).toMatchObject({ cnpj_emitente: '11222333000181', cpf_destinatario: '52998224725', tipo_documento: 1 })
    expect(sent.items[0]).toMatchObject({ cfop: '5102', codigo_ncm: '87032310', icms_situacao_tributaria: '20', icms_reducao_base_calculo: 90 })
    expect(String((calls[0].init.headers as Record<string, string>).Authorization)).toMatch(/^Basic /)
    const s = await focusNfe.status(ctx, 'TXN-1-1')
    expect(s).toMatchObject({ state: 'CONFIRMED' })
    expect((s?.data as { xml?: string }).xml).toBe('<nfeProc>xml</nfeProc>')
  })
})
