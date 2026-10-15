import { afterEach, describe, expect, it } from 'vitest'
import {
  PanAdapter, clientComplementPayload, decisionFromPreAnalysis, decisionFromProposal, firstLink, parseProposalNumber, parseSimulation,
  pickOperator, pickProduct, pickSimOption, preAnalysisRequest, recordSimulationPayload, simulationPayload, vehicleComplementPayload,
} from './pan'
import { panFarol, panMaritalStatus, panParsePreApproved, panProposalStatus, panSex } from './pan-codes'
import { __resetPanCachesForTests, __setPanFetchForTests, panBaseUrl, panErrorMessage, panTokenExpiry } from './pan-http'
import { connectionState } from './registry'
import { credentialSpecFor } from './credential-specs'
import type { ApplicantPayload, BankContext, ProposalTerms } from './types'

const creds = {
  apiKey: 'AK1', secretKey: 'SK1', usuarioIntegracao: '00000000001_000001', senhaIntegracao: 'test@123',
  idLoja: '98329834', cnpjLoja: '12.345.678/0001-90', cpfAgenteCertificado: '111.444.777-35',
}
const ctx: BankContext = { tenantId: 't1', environment: 'HOMOLOGACAO', credentials: creds, correlationId: 'c1' }
const terms: ProposalTerms = {
  vehicleValue: 60000, downPayment: 20000, amount: 40000, installments: 48,
  vehicle: { fipeCode: '005415-6', fipeValue: 61000, modelYear: 2020, year: 2019, km: 45000, plate: 'abc-1d23', zeroKm: false, category: 'AUTOMOVEL', chassi: '9bwzzz377vt004251', renavam: '0123456789-0', color: 'Prata' },
  storeUf: 'SP',
}
const applicant: ApplicantPayload = {
  personType: 'PF',
  data: {
    nomeCompleto: 'José da Silva', cpf: '123.456.789-09', dataNascimento: '1985-04-10', sexo: 'M', estadoCivil: 'Casado(a)', nacionalidade: 'Brasileira',
    naturalidade: 'São Paulo', naturalidadeUf: 'SP', nomeMae: 'Maria da Silva', rg: '12.345.678-x', rgOrgao: 'SSP', rgUf: 'SP',
    celular: '(11) 98765-4321', telefoneFixo: '(11) 4000-0000', email: 'jose@ex.com', cep: '01310100', logradouro: 'Av. Paulista', numero: '1000', bairro: 'Bela Vista', cidade: 'São Paulo', estado: 'SP',
    occupation: 'CLT', profissao: 'Administrador', renda: 8500, outrasRendas: [{ valor: 500 }], empresaNome: 'ACME Ltda', empresaCnpj: '11222333000181',
    conjugeNome: 'Ana Souza', conjugeCpf: '987.654.321-00', conjugeDataNascimento: '1990-01-01',
  },
}

// Resposta de simulação no formato provável (schema não publicado pelo PAN).
const simResponse = {
  identificadorSimulacao: 'hash-abc',
  simulacoes: [{
    tabelaCalculada: { codigo: 'T123', carencia: 30, condicao: 'C1', plusComissao: { taxa: null, descricao: null } },
    despesas: [{ codigoItem: 7, descricaoDespesa: 'TARIFA DE CADASTRO', valor: 900, financia: true, debita: true, isenta: false, permiteEdicao: false, idServico: null }],
    prazos: [
      { prazo: 36, valorParcela: 1600.5, valorEntrada: 20000 },
      { prazo: 48, valorParcela: 1300.25, valorEntrada: 20000, valorFinanciado: 40900 },
    ],
  }],
}

afterEach(() => { __setPanFetchForTests(null); __resetPanCachesForTests() })

describe('PAN — conector oficial', () => {
  it('é oficial, consulta status e só fica integrado com a credencial completa da loja', () => {
    const pan = new PanAdapter()
    expect(pan.official).toBe(true)
    expect(pan.capabilities).toMatchObject({ preAnalyze: true, submit: true, status: true, webhook: false, cancel: false })
    expect(pan.isIntegrated(ctx)).toBe(true)
    expect(pan.isIntegrated({ ...ctx, credentials: { ...creds, senhaIntegracao: '' } })).toBe(false)
    const base = { adapterKey: 'pan', provider: pan, hasCredential: true, credentialReadable: true, credentialExpiresAt: null }
    expect(connectionState({ ...base, integrated: true })).toBe('CONECTADO')
    expect(connectionState({ ...base, integrated: false })).toBe('CONFIGURACAO_NECESSARIA')
  })

  it('tela de credenciais pede todos os campos obrigatórios do conector', () => {
    const spec = credentialSpecFor('pan')!
    const required = spec.fields.filter((f) => !f.optional).map((f) => f.key).sort()
    expect(required).toEqual(['apiKey', 'cnpjLoja', 'cpfAgenteCertificado', 'idLoja', 'secretKey', 'senhaIntegracao', 'usuarioIntegracao'])
    expect(spec.fields.find((f) => f.key === 'secretKey')?.secret).toBe(true)
  })

  it('URL por ambiente e só https', () => {
    expect(panBaseUrl(ctx)).toBe('https://sandbox-hml.bancopan.com.br')
    expect(panBaseUrl({ ...ctx, environment: 'PRODUCAO' })).toBe('https://ap-gateway-web.bancopan.com.br')
    expect(() => panBaseUrl({ ...ctx, credentials: { ...creds, urlBase: 'http://x' } })).toThrow(/https/)
  })

  it('pré-análise: caminho, categoria e farol', () => {
    expect(preAnalysisRequest(applicant, terms, creds)).toEqual({ path: '/openapi/veiculos/v0/lojas/98329834/preanalise', query: { cpf: '12345678909', categoriaVeiculo: 'LEVES' } })
    expect(preAnalysisRequest(applicant, { ...terms, vehicle: { category: 'MOTO' } }, creds).query.categoriaVeiculo).toBe('MOTOS')
    expect(() => preAnalysisRequest({ ...applicant, personType: 'PJ' }, terms, creds)).toThrow(/PJ/)
    const ok = decisionFromPreAnalysis({ codigo: 2, descricao: 'Pré-Aprovado', descricaoPA: 'Até R$ 14.000,00. Parcela até R$ 500,00. Prazo até 48x e zero de entrada.' })
    expect(ok).toMatchObject({ status: 'PRE_APROVADA', offer: { approvedAmount: 14000, installmentValue: 500, installments: 48 } })
    expect(decisionFromPreAnalysis({ codigo: 4, descricao: 'Não Elegivel', descricaoPA: 'Infelizmente…' }).status).toBe('RECUSADA')
    expect(() => decisionFromPreAnalysis({ descricao: 'SISTEMA_INDISPONIVEL' })).toThrow(/indisponível/)
    expect(panFarol(null, 'ELEGIVEL')).toBe('ELEGIVEL')
    expect(panParsePreApproved('sem números')).toBeNull()
  })

  it('simulação monta o corpo documentado a partir da ficha e do veículo', () => {
    const p = simulationPayload(applicant, terms, creds, 'P01')
    expect(p.dadosBasicos).toEqual({ idLoja: '98329834', codigoProduto: 'P01' })
    expect(p.dadosCliente).toEqual({ cpf: '12345678909', dataNascimento: '1985-04-10', ddd: '11', celular: '987654321', renda: 8500, rendaComplementar: 500, taxistaPne: false })
    expect(p.dadosVeiculos[0]).toEqual({ categoria: 'LEVES', codigoVeiculo: '005415-6', zeroKm: false, anoModelo: 2020, ufLicenciamento: 'SP', valorVenda: 60000 })
    expect(p.condicoesPreferenciais.prazoSelecionadoPreferencial).toBe(48)
    expect(p.simulacao).toEqual({ valorEntrada: 20000, prazos: [{}] })
    expect(simulationPayload(applicant, terms, { ...creds, tipoIdLoja: 'X' }, 'P01').dadosBasicos.tipoIdLoja).toBe('X')
    expect(() => simulationPayload(applicant, { ...terms, vehicle: { modelYear: 2020 } }, creds, 'P')).toThrow(/FIPE/)
    expect(() => simulationPayload(applicant, { ...terms, vehicle: { ...terms.vehicle, category: 'PESADO' } }, creds, 'P')).toThrow(/leves/)
  })

  it('lê a simulação e grava a condição do prazo pedido', () => {
    const sim = parseSimulation(simResponse)
    expect(sim.identificadorSimulacao).toBe('hash-abc')
    expect(sim.options.map((o) => o.prazo)).toEqual([36, 48])
    const opt = pickSimOption(sim, 48)!
    expect(opt.tabela).toMatchObject({ codigo: 'T123', carencia: 30, condicao: 'C1' })
    expect(pickSimOption(sim, 60)).toBeNull() // não troca o prazo do cliente
    const rec = recordSimulationPayload(sim, opt, { codigoProduto: 'P01', codigoOperador: '000123', cpfCertificado: creds.cpfAgenteCertificado }, terms)
    expect(rec.dadosBasicos).toEqual({ codigoOperador: '000123', cpfCertificado: '11144477735', codigoProduto: 'P01', identificadorSimulacao: 'hash-abc' })
    expect(rec.dadosSimulacao).toMatchObject({ prazo: 48, valorParcela: 1300.25, valorEntrada: 20000, tabelaCalculada: { codigo: 'T123', carencia: 30, condicao: 'C1' } })
    expect(rec.dadosSimulacao.despesasSelecionadas).toHaveLength(1)
    expect(() => recordSimulationPayload({ ...sim, identificadorSimulacao: null }, opt, { codigoProduto: 'P', codigoOperador: '1', cpfCertificado: creds.cpfAgenteCertificado }, terms)).toThrow(/identificador/)
    expect(parseProposalNumber({ dados: { numeroProposta: 123456 } })).toBe('123456')
    expect(parseProposalNumber('987')).toBe('987')
    expect(parseProposalNumber({})).toBeNull()
  })

  it('complemento do cliente no formato do exemplo do PAN', () => {
    const c = clientComplementPayload(applicant, creds, { codigo: '000123', nome: 'OPERADOR' }, { codigo: '1', nome: 'ADMINISTRADOR' })
    expect(c.usuario).toBe('00000000001_000001')
    expect(c.informacoesBase).toEqual({ cpfAgenteCertificado: '11144477735', operador: { codigo: '000123', nome: 'OPERADOR' } })
    expect(c.cliente).toMatchObject({
      nome: 'JOSE DA SILVA', sexo: 'MASCULINO', estadoCivil: 'CASADO', codigoNacionalidade: '01', filiacao: { mae: 'MARIA DA SILVA' },
      documentos: { rgIe: { numero: '12345678X', uf: 'SP', emissor: 'SSP', tipo: 'RG' } }, naturalidade: { descricao: 'SAO PAULO', uf: 'SP' },
      contato: { email: 'jose@ex.com' },
      renda: { principal: { profissao: { codigo: '1', nome: 'ADMINISTRADOR' }, empresa: { nome: 'ACME LTDA', cnpj: '11.222.333/0001-81' } } },
      conjuge: { nome: 'ANA SOUZA', cpf: '987.654.321-00', dataNascimento: '01/01/1990 00:00:00' },
    })
    expect(c.cliente.telefones).toEqual([{ tipo: 'FONE_RESIDENCIAL', ddd: '11', numero: '40000000' }, { tipo: 'CELULAR', ddd: '11', numero: '987654321' }])
    expect(c.cliente.dadosPostais.map((x) => x.tipo)).toEqual(['RESIDENCIAL', 'CORRESPONDENCIA'])
    expect(c.cliente.dadosPostais[0]).toMatchObject({ cep: '01310-100', cidade: 'SAO PAULO' })
    expect(() => clientComplementPayload({ ...applicant, data: { ...applicant.data, sexo: '' } }, creds, { codigo: '1', nome: '' }, null)).toThrow(/sexo/)
  })

  it('complemento do bem com placa, chassi, renavam e cor', () => {
    const b = vehicleComplementPayload(terms, creds, { codigo: '1', nome: 'OP' })
    expect(b.veiculo).toEqual({ anoFabricacao: 2019, chassi: '9BWZZZ377VT004251', cor: 'PRATA', motivoAgendamento: 'NAO_DEFINIDO', placa: 'ABC1D23', ufplaca: 'SP', renavam: '01234567890' })
    expect(vehicleComplementPayload({ ...terms, vehicle: { ...terms.vehicle, zeroKm: true } }, creds, { codigo: '1', nome: '' }).veiculo).not.toHaveProperty('placa')
  })

  it('situação da proposta: status desconhecido nunca vira sucesso', () => {
    expect(panProposalStatus('APROVADA')).toBe('APROVADA')
    expect(panProposalStatus('Reprovada')).toBe('RECUSADA')
    expect(panProposalStatus('NAO APROVADA')).toBe('RECUSADA')
    expect(panProposalStatus('Cancelada')).toBe('CANCELADA')
    expect(panProposalStatus('PENDENTE DOCUMENTACAO')).toBe('PENDENTE')
    expect(panProposalStatus('XYZ')).toBe('EM_ANALISE')
    const d = decisionFromProposal('555', {
      status: 'APROVADA',
      dadosFinanciamento: { valorFinanciado: 40000, valorParcela: 1300, valorEntrada: 20000, quantidadeParcela: 48, atividades: [{ descricao: 'ANALISE', data: '2026-10-01', situacao: 'OK' }] },
    })
    expect(d).toMatchObject({ externalId: '555', status: 'APROVADA', offer: { approvedAmount: 40000, installments: 48, installmentValue: 1300, totalAmount: 62400 } })
    expect(decisionFromProposal('555', { status: 'EM ANALISE', indicadorBloqueado: true }).status).toBe('PENDENTE')
    expect(decisionFromProposal('555', { status: 'RECUSADA', indicadorBloqueado: true }).status).toBe('RECUSADA')
  })

  it('códigos da ficha', () => {
    expect(panSex('Feminino')).toBe('FEMININO')
    expect(panMaritalStatus('União estável')).toBe('CASADO')
    expect(panMaritalStatus('Solteiro(a)')).toBe('SOLTEIRO')
    expect(panErrorMessage({ codigo: '400', mensagem: 'x', detalhes: ['Usuário ou senha incorreta.'] })).toBe('Usuário ou senha incorreta.')
    expect(panTokenExpiry('2019-09-24T17:27:09.000Z', Date.parse('2019-09-24T17:00:00Z'))).toBe(Date.parse('2019-09-24T17:27:09.000Z'))
    expect(panTokenExpiry(600, 0)).toBe(600_000)
  })

  it('produto e operador da loja', () => {
    const stores = [{ codigoLoja: '98329834', produtos: [{ codigoProduto: 'L1', categoriaProduto: 'LEVES' }, { codigoProduto: 'M1', categoriaProduto: 'MOTOS' }] }]
    expect(pickProduct(stores, '98329834', 'LEVES')).toBe('L1')
    expect(pickProduct(stores, '98329834', 'MOTOS')).toBe('M1')
    const ops = { operadores: [{ codigoOperador: '1', nomeOperador: 'Ana', cpfOperador: '000' }, { codigoOperador: '2', nomeOperador: 'Beto', cpfOperador: '111.444.777-35' }] }
    expect(pickOperator(ops, creds)).toEqual({ codigo: '2', nome: 'BETO' })
    expect(pickOperator(ops, { ...creds, codigoOperador: '1' })).toEqual({ codigo: '1', nome: 'ANA' })
    expect(pickOperator({ operadores: [] }, { cpfAgenteCertificado: '' })).toBeNull()
    expect(firstLink({ links: [{ tipo: 'ASSINATURA', url: 'https://formaliza.pan/x' }] })).toBe('https://formaliza.pan/x')
  })
})

// ── Fluxo completo contra um PAN simulado (sem rede) ─────────────────────────
type Call = { method: string; url: string; headers: Record<string, string>; body: unknown }
function fakePan(routes: (c: Call) => { status?: number; body: unknown } | undefined) {
  const calls: Call[] = []
  __setPanFetchForTests(async (url, init) => {
    const c: Call = { method: String(init.method), url, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null }
    calls.push(c)
    const r = (c.url.endsWith('/veiculos/v0/tokens') ? { body: { token: 'TK', expires_in: new Date(Date.now() + 3_600_000).toISOString() } } : routes(c)) ?? { status: 404, body: { mensagem: 'rota desconhecida' } }
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 })
  })
  return calls
}
const routesOk = (c: Call) => {
  if (c.url.includes('/veiculos/v0/lojas?')) return { body: [{ codigoLoja: '98329834', produtos: [{ codigoProduto: 'P01', categoriaProduto: 'LEVES' }] }] }
  if (c.url.endsWith('/simulacao')) return { body: simResponse }
  if (c.url.endsWith('/operadores')) return { body: { operadores: [{ codigoOperador: '000123', nomeOperador: 'Beto', cpfOperador: '11144477735' }] } }
  if (c.url.endsWith('/gravarSimulacao')) return { body: { numeroProposta: '777001' } }
  if (c.url.endsWith('/propostas/777001') && c.method === 'POST') return { body: {} }
  if (c.url.endsWith('/propostas/777001') && c.method === 'GET') return { body: { status: 'APROVADA', dadosCadastrais: { cpfCnpj: '123.456.789-09' }, dadosFinanciamento: { valorParcela: 1300, quantidadeParcela: 48 } } }
  if (c.url.includes('/formalizador/')) return { body: { links: ['https://pan.example/assinar'] } }
  return undefined
}

describe('PAN — jornada com API simulada', () => {
  it('envia a proposta: token (Basic + ApiKey) → produto → simulação → gravar → complementos', async () => {
    const calls = fakePan(routesOk)
    const d = await new PanAdapter().submitProposal(applicant, terms, ctx)
    expect(d).toMatchObject({ externalId: '777001', status: 'EM_ANALISE', offer: { installments: 48, installmentValue: 1300.25 } })
    const tok = calls[0]
    expect(tok.url).toBe('https://sandbox-hml.bancopan.com.br/veiculos/v0/tokens')
    expect(tok.headers.Authorization).toBe(`Basic ${Buffer.from('AK1:SK1').toString('base64')}`)
    expect(tok.headers.ApiKey).toBe('AK1')
    expect(tok.body).toEqual({ username: '00000000001_000001', password: 'test@123', grant_type: 'client_credentials+password' })
    expect(calls.filter((c) => c.url.endsWith('/veiculos/v0/tokens'))).toHaveLength(1) // token em cache (limite 5/min)
    expect(calls.slice(1).every((c) => c.headers.Authorization === 'Bearer TK' && c.headers.ApiKey === 'AK1')).toBe(true)
    expect(calls.map((c) => c.url.replace('https://sandbox-hml.bancopan.com.br', '').split('?')[0])).toEqual([
      '/veiculos/v0/tokens', '/veiculos/v0/lojas', '/openapi/veiculos/v1/simulacao', '/openapi/veiculos/v1/lojas/98329834/operadores',
      '/openapi/veiculos/v0/gravarSimulacao', '/openapi/veiculos/v0/propostas/777001', '/openapi/veiculos/v0/propostas/777001',
    ])
  })

  it('complemento falhou depois de criar a proposta: devolve o número como pendência', async () => {
    fakePan((c) => (c.url.endsWith('/propostas/777001') ? { status: 400, body: { mensagem: 'x', detalhes: ['CEP inválido'] } } : routesOk(c)))
    const d = await new PanAdapter().submitProposal(applicant, terms, ctx)
    expect(d).toMatchObject({ externalId: '777001', status: 'PENDENTE' })
    expect(d.reason).toMatch(/CEP inválido/)
  })

  it('queda no gravarSimulacao vira "verificar" (pode ter chegado)', async () => {
    fakePan((c) => (c.url.endsWith('/gravarSimulacao') ? { status: 503, body: {} } : routesOk(c)))
    await expect(new PanAdapter().submitProposal(applicant, terms, ctx)).rejects.toMatchObject({ code: 'INDISPONIVEL', delivered: 'TALVEZ' })
  })

  it('validação local falha antes de qualquer chamada', async () => {
    const calls = fakePan(routesOk)
    await expect(new PanAdapter().submitProposal({ ...applicant, data: { ...applicant.data, nomeMae: '' } }, terms, ctx)).rejects.toMatchObject({ code: 'REJEITADO', delivered: 'NAO' })
    expect(calls).toHaveLength(0)
  })

  it('consulta status, formalização e teste de conexão', async () => {
    fakePan(routesOk)
    const pan = new PanAdapter()
    expect(await pan.getStatus('777001', ctx)).toMatchObject({ status: 'APROVADA', externalId: '777001' })
    expect(await pan.formalize('777001', ctx)).toEqual({ contractNumber: '777001', documentUrl: 'https://pan.example/assinar', signed: false })
    await expect(pan.testConnection(ctx)).resolves.toBeUndefined()
    await expect(pan.findByIdempotencyKey()).rejects.toMatchObject({ code: 'NAO_SUPORTADO' })
  })

  it('login recusado vira erro de credencial com a mensagem do PAN', async () => {
    __setPanFetchForTests(async () => new Response(JSON.stringify({ codigo: '400', mensagem: 'Ocorreu um erro', detalhes: ['Usuário ou senha incorreta.'] }), { status: 400 }))
    await expect(new PanAdapter().testConnection(ctx)).rejects.toMatchObject({ code: 'CREDENCIAL', message: expect.stringMatching(/Usuário ou senha incorreta/) })
  })

  it('token expirado (401) é renovado uma vez', async () => {
    let n = 0
    const calls = fakePan((c) => (c.url.includes('/propostas/') ? (n++ === 0 ? { status: 401, body: {} } : { body: { status: 'EM ANALISE' } }) : undefined))
    expect((await new PanAdapter().getStatus('9', ctx)).status).toBe('EM_ANALISE')
    expect(calls.filter((c) => c.url.endsWith('/tokens'))).toHaveLength(2)
  })
})
