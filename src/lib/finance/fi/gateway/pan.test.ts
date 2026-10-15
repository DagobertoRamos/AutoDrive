import { afterEach, describe, expect, it } from 'vitest'
import {
  PanAdapter, clientComplementPayload, decisionFromPreAnalysis, decisionFromProposal, formalizationLink, missingVehicleData, parseRecordResult,
  pickOperator, pickProduct, pickSimOption, preAnalysisRequest, recordSimulationPayload, simOptionRefusal, simulationPayload, vehicleComplementPayload,
  type PanSimulation,
} from './pan'
import {
  panFarol, panMaritalStatus, panMatchBrand, panMatchModels, panOccupationNature, panParsePreApproved, panPickVersion, panProposalStatus, panSex,
} from './pan-codes'
import { __resetPanCachesForTests, __setPanFetchForTests, panBaseUrl, panErrorMessage, panTokenExpiry } from './pan-http'
import { connectionState } from './registry'
import { credentialSpecFor } from './credential-specs'
import type { ApplicantPayload, BankContext, ProposalTerms } from './types'

const creds = {
  apiKey: 'AK1', secretKey: 'SK1', usuarioIntegracao: '00000000001_000001', senhaIntegracao: 'test@123',
  idLoja: '000129', cnpjLoja: '64.900.194/0001-64', cpfAgenteCertificado: '111.444.777-35',
}
const ctx: BankContext = { tenantId: 't1', environment: 'HOMOLOGACAO', credentials: creds, correlationId: 'c1' }
const terms: ProposalTerms = {
  vehicleValue: 117793, downPayment: 110000, amount: 7793, installments: 48,
  vehicle: {
    brand: 'Honda', model: 'Civic', version: 'EXL 2.0 16V CVT', engine: '2.0', transmission: 'CVT', fuel: 'FLEX',
    fipeCode: '014088-5', fipeValue: 118000, modelYear: 2019, year: 2019, km: 45000, plate: 'abc-1d23', zeroKm: false, category: 'AUTOMOVEL',
    chassi: '9bwzzz377vt004251', renavam: '123456789', color: 'Preta',
  },
  storeUf: 'SP',
}
const applicant: ApplicantPayload = {
  personType: 'PF',
  data: {
    nomeCompleto: 'José da Silva', cpf: '123.456.789-09', dataNascimento: '1985-04-10', sexo: 'M', estadoCivil: 'Casado(a)', nacionalidade: 'Brasileira',
    naturalidade: 'São Paulo', naturalidadeUf: 'SP', nomeMae: 'Maria da Silva', rg: '12.345.678-x', rgOrgao: 'SSP', rgUf: 'SP',
    celular: '(11) 98765-4321', telefoneFixo: '(11) 4000-0000', email: 'jose@ex.com', cep: '01310100', logradouro: 'Av. Paulista', numero: '1000', bairro: 'Bela Vista', cidade: 'São Paulo', estado: 'SP',
    occupation: 'CLT', profissao: 'Advogado', renda: 7700, outrasRendas: [{ valor: 1000 }], empresaNome: 'ACME Ltda', empresaCnpj: '11222333000181',
    conjugeNome: 'Ana Souza', conjugeCpf: '987.654.321-00', conjugeDataNascimento: '1990-01-01',
  },
}

// Recortes das respostas de exemplo do PAN ("Documentação v4").
const despesas = [
  { permiteEdicao: false, codigoItem: 0, idServico: null, descricaoDespesa: 'Vlr. IOF', isenta: false, valor: 460.87, financia: true, debita: true },
  { permiteEdicao: false, codigoItem: 44, idServico: null, descricaoDespesa: 'TARIFA DE CADASTRO', isenta: false, valor: 750.0, financia: true, debita: true },
]
const simOpt = (prazo: number, valorParcela: number, extra: Record<string, unknown> = {}) => ({
  prazo, prazoPreferencial: false, decisaoCredito: 'Aprovada', mensagemCredito: 'Proposta Aprovada', valorParcela, valorPrincipal: 7793.0,
  entradaSolicitada: 110000.0, entradaAnalisada: 110000.0, entradaMinimaAnalisada: 101026.7, entradaSugerida: 101026.7, idPacoteSegurosServicos: 167,
  tabelaCalculada: { codigoTabela: '007810', carencia: 30, retorno: { taxa: 0.0, condicao: 'PAN0' }, plusCalculado: { descricao: null, taxa: null } },
  despesasCalculada: despesas, codigoAutorizacaoTC: 180774895,
  dadosOperacao: { dataBase: '20/01/2023', taxaJurosAoMes: 1.64, taxaJurosAoAno: 21.5558, taxaCETAoMes: 5.35, taxaCETAoAno: 88.55, valorTotalFinanciado: 9723.25 },
  status: { sucesso: true, mensagem: null },
  ...extra,
})
const simResponse: PanSimulation = {
  identificadorSimulacao: '63caad4c177933000709857f',
  veiculosFinanciado: [{ marca: 'HONDA', modelo: 'CIVIC - 4P - Completo - G10 EXL 2.0 16V CVT FLEX' }],
  simulacoes: [simOpt(12, 899.25), simOpt(48, 458.87)],
}
const versoes = [
  { codigoMolicar: '019021963', valorMolicar: 110000, descricaoVersao: 'LX 2.0 16v CVT 4 Portas Automático Flex' },
  { codigoMolicar: '019021975', valorMolicar: 117793, descricaoVersao: 'EXL 2.0 16v CVT 4 Portas Automático Flex' },
  { codigoMolicar: '019021987', valorMolicar: 125000, descricaoVersao: 'TOURING 1.5 Turbo CVT 4 Portas Automático Gasolina' },
]

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

  it('pré-análise: caminho, categoria e farol (exemplos do PAN)', () => {
    expect(preAnalysisRequest(applicant, terms, creds)).toEqual({ path: '/openapi/veiculos/v0/lojas/000129/preanalise', query: { cpf: '12345678909', categoriaVeiculo: 'LEVES' } })
    expect(preAnalysisRequest(applicant, { ...terms, vehicle: { category: 'MOTO' } }, creds).query.categoriaVeiculo).toBe('MOTOS')
    expect(() => preAnalysisRequest({ ...applicant, personType: 'PJ' }, terms, creds)).toThrow(/PJ/)
    const ok = decisionFromPreAnalysis({ codigo: 2, descricao: 'Pré-Aprovado', descricaoPA: 'Até R$ 12.373,00. Parcela até R$ 1.050,00. Prazo até 48x e zero de entrada.' })
    expect(ok).toMatchObject({ status: 'PRE_APROVADA', offer: { approvedAmount: 12373, installmentValue: 1050, installments: 48 } })
    expect(decisionFromPreAnalysis({ codigo: 3, descricao: 'Elegivel', descricaoPA: 'Preencha os dados…' }).status).toBe('EM_ANALISE')
    expect(decisionFromPreAnalysis({ codigo: 4, descricao: 'Não Elegivel', descricaoPA: 'Infelizmente…' }).status).toBe('RECUSADA')
    expect(() => decisionFromPreAnalysis({ descricao: 'SISTEMA_INDISPONIVEL' })).toThrow(/indisponível/)
    expect(panFarol(3, '')).toBe('ELEGIVEL')
    expect(panParsePreApproved('sem números')).toBeNull()
  })

  it('código Molicar: marca, modelo e versão casados com o estoque', () => {
    const marcas = ['ACURA          ', 'HONDA  ', 'VOLKSWAGEN     ', 'CHEVROLET      ', 'MERCEDES-BENZ  ', 'CAOA CHERY']
    expect(panMatchBrand(marcas, 'Honda')).toBe('HONDA')
    expect(panMatchBrand(marcas, 'VW - VolksWagen')).toBe('VOLKSWAGEN')
    expect(panMatchBrand(marcas, 'GM - Chevrolet')).toBe('CHEVROLET')
    expect(panMatchBrand(marcas, 'Mercedes-Benz')).toBe('MERCEDES-BENZ')
    expect(panMatchBrand(marcas, 'Tesla')).toBeNull()
    const modelos = ['ACCORD', 'CITY HATCH', 'CITY', 'CIVIC COUPE', 'CIVIC', 'CIVIC(N.Geracao)', 'HR-V']
    expect(panMatchModels(modelos, 'Civic')[0]).toBe('CIVIC')
    expect(panMatchModels(modelos, 'City')[0]).toBe('CITY')
    expect(panMatchModels(modelos, 'Corolla')).toEqual([])
    expect(panPickVersion(versoes, terms.vehicle!, 118000)?.codigoMolicar).toBe('019021975')
    // Sem versão no estoque: o valor Molicar mais perto da FIPE decide.
    expect(panPickVersion(versoes, {}, 126000)?.codigoMolicar).toBe('019021987')
  })

  it('simulação monta o corpo documentado (tipoIdLoja, Molicar, Multiplos, natureza da ocupação)', () => {
    const p = simulationPayload(applicant, terms, creds, '100001', '019021975')
    expect(p.dadosBasicos).toEqual({ tipoIdLoja: 'CODIGO_LOJA', idLoja: '000129', codigoProduto: '100001' })
    expect(p.dadosCliente).toEqual({ cpf: '12345678909', dataNascimento: '1985-04-10', ddd: '11', celular: '987654321', cep: '01310100', codigoNaturezaOcupacao: '04', renda: 7700, rendaComplementar: 1000, taxistaPne: false })
    expect(p.dadosVeiculos[0]).toEqual({ categoria: 'LEVES', codigoVeiculo: '019021975', zeroKm: false, anoModelo: 2019, ufLicenciamento: 'SP', valorVenda: 117793 })
    expect(p.condicoesPreferenciais.prazoSelecionadoPreferencial).toBe(48)
    expect(p.simulacao).toEqual({ tipoCalculo: 'Multiplos', valorEntrada: 110000, prazos: [{}] })
    expect(panOccupationNature('APOSENTADO_PENSIONISTA')).toBe('01')
    expect(panOccupationNature('EMPRESARIO')).toBe('09')
    const moto = { ...terms, vehicle: { ...terms.vehicle, category: 'MOTO' as const } }
    expect(() => simulationPayload({ ...applicant, data: { ...applicant.data, cep: '' } }, moto, creds, '200001', '053081018')).toThrow(/CEP/)
    expect(() => simulationPayload(applicant, { ...terms, vehicle: { ...terms.vehicle, category: 'PESADO' } }, creds, 'P', 'M')).toThrow(/leves/)
  })

  it('lê a simulação real e grava a condição do prazo pedido', () => {
    const opt = pickSimOption(simResponse, 48)!
    expect(opt.valorParcela).toBe(458.87)
    expect(pickSimOption(simResponse, 60)).toBeNull() // não troca o prazo do cliente
    expect(simOptionRefusal(opt, 110000)).toBeNull()
    expect(simOptionRefusal(opt, 90000)).toMatch(/entrada mínima de R\$ 101\.026,70/)
    expect(simOptionRefusal({ ...opt, decisaoCredito: 'Reprovada', mensagemCredito: 'Proposta Reprovada' }, 110000)).toMatch(/Reprovada/)
    const rec = recordSimulationPayload(simResponse, opt, { codigoProduto: '100001', codigoOperador: '000222', cpfCertificado: creds.cpfAgenteCertificado }, terms)
    // Mesmo formato do "Request LEVES" do gravarSimulacao.
    expect(rec).toEqual({
      dadosBasicos: { codigoOperador: '000222', cpfCertificado: '111.444.777-35', codigoProduto: '100001', identificadorSimulacao: '63caad4c177933000709857f' },
      dadosSimulacao: {
        prazo: 48, valorParcela: 458.87, valorEntrada: 110000, idPacoteSeguros: 167,
        tabelaCalculada: { codigo: '007810', carencia: 30, condicao: 'PAN0', plusComissao: { taxa: null, descricao: null } },
        despesasSelecionadas: despesas, codigoAutorizacaoTC: 180774895,
      },
    })
    expect(() => recordSimulationPayload({ ...simResponse, identificadorSimulacao: undefined }, opt, { codigoProduto: 'P', codigoOperador: '1', cpfCertificado: creds.cpfAgenteCertificado }, terms)).toThrow(/identificador/)
    expect(parseRecordResult({ numeroProposta: '083312711', status: { codigo: 'Sucesso', erros: { erro: [] } } })).toEqual({ numero: '083312711', erro: null })
    expect(parseRecordResult({ status: { codigo: 'Erro', erros: { erro: [{ Mensagem: 'Tabela inválida', codigo: 1 }] } } })).toEqual({ numero: null, erro: 'Tabela inválida' })
  })

  it('complemento do cliente no formato do exemplo do PAN', () => {
    const c = clientComplementPayload(applicant, creds, { codigo: '000222', nome: 'TESTE TESTE TESTE' }, { codigo: '2', nome: 'ADVOGADO' })
    expect(c.usuario).toBe('00000000001_000001')
    expect(c.informacoesBase).toEqual({ cpfAgenteCertificado: '111.444.777-35', operador: { codigo: '000222', nome: 'TESTE TESTE TESTE' } })
    expect(c.cliente).toMatchObject({
      nome: 'JOSE DA SILVA', sexo: 'MASCULINO', estadoCivil: 'CASADO', codigoNacionalidade: '01', filiacao: { mae: 'MARIA DA SILVA' },
      documentos: { rgIe: { numero: '12345678X', uf: 'SP', emissor: 'SSP', tipo: 'RG' } }, naturalidade: { descricao: 'SAO PAULO', uf: 'SP' },
      contato: { email: 'jose@ex.com' },
      renda: { principal: { profissao: { codigo: '2', nome: 'ADVOGADO' }, empresa: { nome: 'ACME LTDA', cnpj: '11.222.333/0001-81' } } },
      conjuge: { nome: 'ANA SOUZA', cpf: '987.654.321-00', dataNascimento: '01/01/1990 00:00:00' },
    })
    expect(c.cliente.telefones).toEqual([{ tipo: 'FONE_RESIDENCIAL', ddd: '11', numero: '40000000' }, { tipo: 'CELULAR', ddd: '11', numero: '987654321' }])
    expect(c.cliente.dadosPostais.map((x) => x.tipo)).toEqual(['RESIDENCIAL', 'CORRESPONDENCIA'])
    expect(c.cliente.dadosPostais[0]).toMatchObject({ cep: '01310-100', cidade: 'SAO PAULO' })
    expect(() => clientComplementPayload({ ...applicant, data: { ...applicant.data, sexo: '' } }, creds, { codigo: '1', nome: '' }, null)).toThrow(/sexo/)
  })

  it('complemento do bem: placa 7 caracteres, renavam 11, CPF do agente com máscara', () => {
    const b = vehicleComplementPayload(terms, creds, { codigo: '1', nome: 'OP' })
    expect(b.informacoesBase.cpfAgenteCertificado).toBe('111.444.777-35')
    expect(b.veiculo).toEqual({ anoFabricacao: 2019, chassi: '9BWZZZ377VT004251', cor: 'PRETA', motivoAgendamento: 'NAO_DEFINIDO', placa: 'ABC1D23', ufplaca: 'SP', renavam: '00123456789' })
    expect(missingVehicleData(terms)).toEqual([])
    expect(missingVehicleData({ ...terms, vehicle: { ...terms.vehicle, chassi: null, renavam: '' } })).toEqual(['chassi', 'renavam'])
    expect(missingVehicleData({ ...terms, vehicle: { ...terms.vehicle, plate: null, renavam: null, zeroKm: true } })).toEqual([])
  })

  it('situação da proposta: status desconhecido nunca vira sucesso', () => {
    expect(panProposalStatus('2.Formalização Digital')).toBe('APROVADA')
    expect(panProposalStatus('Reprovada')).toBe('RECUSADA')
    expect(panProposalStatus('NAO APROVADA')).toBe('RECUSADA')
    expect(panProposalStatus('Cancelada')).toBe('CANCELADA')
    expect(panProposalStatus('PENDENTE DOCUMENTACAO')).toBe('PENDENTE')
    expect(panProposalStatus('XYZ')).toBe('EM_ANALISE')
    // Recorte do exemplo "(3) Após complementar dados do bem".
    const d = decisionFromProposal('083312711', {
      status: '2.Formalização Digital', descricaoStatusFormalizacao: 'Não Iniciado', indicadorBloqueado: false,
      dadosFinanciamento: { valorFinanciado: 12793.0, valorParcela: 458.87, valorEntrada: 105000.0, quantidadeParcela: 48, atividades: [{ codigo: 234, descricao: 'Formalização Digital', data: '2022-12-16', situacao: 'Aprovada' }] },
    })
    expect(d).toMatchObject({ externalId: '083312711', status: 'APROVADA', offer: { approvedAmount: 12793, installments: 48, installmentValue: 458.87 } })
    expect(d.reason).toBe('Situação no PAN: Formalização Digital · Formalização Digital (Aprovada) · Formalização: Não Iniciado')
    expect(decisionFromProposal('1', { status: 'EM ANALISE', indicadorBloqueado: true }).status).toBe('PENDENTE')
    expect(decisionFromProposal('1', { status: 'RECUSADA', indicadorBloqueado: true }).status).toBe('RECUSADA')
  })

  it('códigos da ficha e utilidades', () => {
    expect(panSex('Feminino')).toBe('FEMININO')
    expect(panMaritalStatus('União estável')).toBe('CASADO')
    expect(panMaritalStatus('Solteiro(a)')).toBe('SOLTEIRO')
    expect(panErrorMessage({ codigo: '400', mensagem: 'x', detalhes: ['Usuário ou senha incorreta.'] })).toBe('Usuário ou senha incorreta.')
    expect(panTokenExpiry('2022-09-05T22:03:41.000Z', Date.parse('2022-09-05T21:00:00Z'))).toBe(Date.parse('2022-09-05T22:03:41.000Z'))
    expect(panTokenExpiry(600, 0)).toBe(600_000)
    expect(formalizationLink({ linkOperador: 'https://op.pan/x', linkCliente: 'https://cli.pan/y' })).toBe('https://cli.pan/y')
    expect(formalizationLink({})).toBeNull()
  })

  it('produto PF da categoria e operador da loja (exemplos do PAN)', () => {
    const stores = [{ codigoLoja: '000129', produtos: [
      { codigoProduto: '100001', descricaoProduto: ' LEVES PF MULTIMARCA', categoriaProduto: 'Automoveis' },
      { codigoProduto: '100002', descricaoProduto: ' LEVES PJ MULTIMARCA', categoriaProduto: 'Automoveis' },
      { codigoProduto: '112001', descricaoProduto: 'LEVES PF REVENDAS', categoriaProduto: 'Automoveis' },
      { codigoProduto: '200001', descricaoProduto: ' MOTOS PF', categoriaProduto: 'Motocicletas' },
      { codigoProduto: '200002', descricaoProduto: ' MOTOS PJ', categoriaProduto: 'Motocicletas' },
    ] }]
    expect(pickProduct(stores, '000129', 'LEVES')).toBe('100001')
    expect(pickProduct(stores, '000129', 'MOTOS')).toBe('200001')
    const ops = { operadores: [{ codigoOperador: '000111', nomeOperador: 'Operador Unid Santan', cpfOperador: '111.111.111-11' }, { codigoOperador: '000222', nomeOperador: 'TESTE TESTE TESTE', cpfOperador: '111.444.777-35' }] }
    expect(pickOperator(ops, creds)).toEqual({ codigo: '000222', nome: 'TESTE TESTE TESTE' })
    expect(pickOperator(ops, { ...creds, codigoOperador: '000111' })).toEqual({ codigo: '000111', nome: 'Operador Unid Santan' })
    expect(pickOperator({ operadores: [] }, { cpfAgenteCertificado: '' })).toBeNull()
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
  const u = c.url
  if (u.includes('/veiculos/v0/lojas?')) return { body: [{ codigoLoja: '000129', produtos: [{ codigoProduto: '100001', descricaoProduto: ' LEVES PF MULTIMARCA', categoriaProduto: 'Automoveis' }] }] }
  if (u.includes('/veiculos/marcas?')) return { body: ['FIAT           ', 'HONDA  '] }
  if (u.includes('/veiculos/modelos?')) return { body: ['CITY', 'CIVIC', 'CIVIC COUPE'] }
  if (u.includes('/veiculos/versoes?')) return { body: versoes }
  if (u.endsWith('/simulacao')) return { body: simResponse }
  if (u.endsWith('/operadores')) return { body: { codigoLoja: '000129', operadores: [{ codigoOperador: '000222', nomeOperador: 'Beto', cpfOperador: '111.444.777-35' }], status: {} } }
  if (u.includes('/propostas/profissoes?')) return { body: [{ codigoDaProfissao: '1', descricao: 'ADMINISTRADOR' }, { codigoDaProfissao: '2', descricao: 'ADVOGADO' }] }
  if (u.endsWith('/gravarSimulacao')) return { body: { numeroProposta: '083312711', status: { codigo: 'Sucesso', erros: { erro: [] } } } }
  if (u.endsWith('/propostas/083312711') && c.method === 'POST') return { body: { proposta: '083312711', mensagem: 'Proposta alterada com sucesso.' } }
  if (u.endsWith('/propostas/083312711') && c.method === 'GET') return { body: { status: '2.Formalização Digital', dadosCadastrais: { cpfCnpj: '123.456.789-09' }, dadosFinanciamento: { valorParcela: 458.87, quantidadeParcela: 48 } } }
  if (u.includes('/formalizador/')) return { body: { linkOperador: 'https://op.pan/x', linkCliente: 'https://cli.pan/assinar' } }
  return undefined
}
const pathOf = (c: Call) => c.url.replace('https://sandbox-hml.bancopan.com.br', '').split('?')[0]

describe('PAN — jornada com API simulada', () => {
  it('envia a proposta: token → produto → Molicar → simulação → operador → profissão → gravar → complementos', async () => {
    const calls = fakePan(routesOk)
    const d = await new PanAdapter().submitProposal(applicant, terms, ctx)
    expect(d).toMatchObject({ externalId: '083312711', status: 'EM_ANALISE', offer: { installments: 48, installmentValue: 458.87, cetMonthly: 5.35 } })
    expect(d.reason).toMatch(/Molicar 019021975/)
    const tok = calls[0]
    expect(tok.url).toBe('https://sandbox-hml.bancopan.com.br/veiculos/v0/tokens')
    expect(tok.headers.Authorization).toBe(`Basic ${Buffer.from('AK1:SK1').toString('base64')}`)
    expect(tok.headers.ApiKey).toBe('AK1')
    expect(tok.body).toEqual({ username: '00000000001_000001', password: 'test@123', grant_type: 'client_credentials+password' })
    expect(calls.filter((c) => c.url.endsWith('/veiculos/v0/tokens'))).toHaveLength(1) // token em cache (limite 5/min)
    expect(calls.slice(1).every((c) => c.headers.Authorization === 'Bearer TK' && c.headers.ApiKey === 'AK1')).toBe(true)
    expect(calls.map(pathOf)).toEqual([
      '/veiculos/v0/tokens', '/veiculos/v0/lojas', '/veiculos/v0/veiculos/marcas', '/veiculos/v0/veiculos/modelos', '/veiculos/v0/veiculos/versoes',
      '/openapi/veiculos/v1/simulacao', '/openapi/veiculos/v1/lojas/000129/operadores', '/openapi/veiculos/v1/propostas/profissoes',
      '/openapi/veiculos/v0/gravarSimulacao', '/openapi/veiculos/v0/propostas/083312711', '/openapi/veiculos/v0/propostas/083312711',
    ])
    const sim = calls.find((c) => c.url.endsWith('/simulacao'))!.body as { dadosVeiculos: { codigoVeiculo: string }[] }
    expect(sim.dadosVeiculos[0].codigoVeiculo).toBe('019021975')
    const cli = calls.filter((c) => c.url.endsWith('/propostas/083312711'))[0].body as { cliente: { renda: { principal: { profissao: unknown } } } }
    expect(cli.cliente.renda.principal.profissao).toEqual({ codigo: '2', nome: 'ADVOGADO' })
  })

  it('complemento falhou depois de criar a proposta: devolve o número como pendência', async () => {
    fakePan((c) => (c.url.endsWith('/propostas/083312711') ? { status: 400, body: { mensagem: 'x', detalhes: ['CEP inválido'] } } : routesOk(c)))
    const d = await new PanAdapter().submitProposal(applicant, terms, ctx)
    expect(d).toMatchObject({ externalId: '083312711', status: 'PENDENTE' })
    expect(d.reason).toMatch(/CEP inválido/)
  })

  it('gravarSimulacao com status "Erro" não cria proposta (pode reenviar)', async () => {
    fakePan((c) => (c.url.endsWith('/gravarSimulacao') ? { body: { status: { codigo: 'Erro', erros: { erro: [{ Mensagem: 'Simulação expirada', codigo: 9 }] } } } } : routesOk(c)))
    await expect(new PanAdapter().submitProposal(applicant, terms, ctx)).rejects.toMatchObject({ code: 'REJEITADO', delivered: 'NAO', message: expect.stringMatching(/Simulação expirada/) })
  })

  it('queda no gravarSimulacao vira "verificar" (pode ter chegado)', async () => {
    fakePan((c) => (c.url.endsWith('/gravarSimulacao') ? { status: 503, body: {} } : routesOk(c)))
    await expect(new PanAdapter().submitProposal(applicant, terms, ctx)).rejects.toMatchObject({ code: 'INDISPONIVEL', delivered: 'TALVEZ' })
  })

  it('entrada abaixo do mínimo do Crivo: recusa com o valor pedido, sem gravar', async () => {
    const calls = fakePan(routesOk)
    const d = await new PanAdapter().submitProposal(applicant, { ...terms, downPayment: 90000 }, ctx)
    expect(d.status).toBe('RECUSADA')
    expect(d.reason).toMatch(/entrada mínima/)
    expect(calls.some((c) => c.url.endsWith('/gravarSimulacao'))).toBe(false)
  })

  it('validação local falha antes de qualquer chamada', async () => {
    const calls = fakePan(routesOk)
    await expect(new PanAdapter().submitProposal({ ...applicant, data: { ...applicant.data, nomeMae: '' } }, terms, ctx)).rejects.toMatchObject({ code: 'REJEITADO', delivered: 'NAO' })
    await expect(new PanAdapter().submitProposal(applicant, { ...terms, vehicle: { ...terms.vehicle, chassi: null } }, ctx)).rejects.toThrow(/chassi/)
    expect(calls).toHaveLength(0)
  })

  it('consulta status, formalização e teste de conexão', async () => {
    fakePan(routesOk)
    const pan = new PanAdapter()
    expect(await pan.getStatus('083312711', ctx)).toMatchObject({ status: 'APROVADA', externalId: '083312711' })
    expect(await pan.formalize('083312711', ctx)).toEqual({ contractNumber: '083312711', documentUrl: 'https://cli.pan/assinar', signed: false })
    await expect(pan.testConnection(ctx)).resolves.toBeUndefined()
    await expect(pan.findByIdempotencyKey()).rejects.toMatchObject({ code: 'NAO_SUPORTADO' })
  })

  it('pré-análise: farol não localizado vira indisponível', async () => {
    fakePan(() => ({ status: 400, body: { codigo: 'Erro', mensagem: 'Farol não localizado.', origem: 'Sistema NPV.', detalhes: ['Farol não localizado.'] } }))
    await expect(new PanAdapter().preAnalyze(applicant, terms, ctx)).rejects.toMatchObject({ code: 'INDISPONIVEL' })
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
