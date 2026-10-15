import { describe, expect, it } from 'vitest'
import {
  BVAdapter, originationPayload, parseBvWebhook, pickPricingOption, preAnalysisPayload, preSimulationPayload, pricingPayload,
  pricingTerms, splitPhone, spDate, verifyBvSignature, type BvPreSimulation,
} from './bv'
import { bvMaritalStatus, bvProfession, bvResidenceType } from './bv-codes'
import { tenantWebhookKey, tenantWebhookUrl } from './webhook-keys'
import { connectionState } from './registry'
import type { ApplicantPayload, ProposalTerms } from './types'

const creds = { clientId: 'cid', clientSecret: 'sec', certPfx: 'AAAA', codigoParceiro: '12345', canal: 'SIMUXXVL', loginUsuario: 'loja.user' }
const ctx = { tenantId: 't1', environment: 'HOMOLOGACAO' as const, credentials: creds, correlationId: 'c1' }
const terms: ProposalTerms = {
  vehicleValue: 60000, downPayment: 20000, amount: 40000, installments: 48,
  vehicle: { fipeCode: '005415-6', fipeValue: 61000, modelYear: 2020, year: 2019, km: 45000, plate: 'abc-1d23', zeroKm: false, category: 'AUTOMOVEL', brand: 'FIAT', model: 'ARGO' },
  storeUf: 'SP',
}
const pre: BvPreSimulation = {
  commercialPartnerInformation: { regionCode: 1, branchCode: 73, uf: 'SP' },
  vehicleInformation: { vehicleCode: '017126277', marketValue: 61000, mark: 'FIAT', model: 'ARGO DRIVE 1.0', category: 'AUTOMOVEL', accessories: 'Completo', numberCylinders: 1000, yearManufacture: '2019', modelYear: '2020' },
  financingTable: { tableCode: 'BVM79', financingReturnRate: [{ code: 1, description: 'T00', value: 1.02 }], termList: [{ term: 12 }, { term: 24 }, { term: 36 }, { term: 48 }, { term: 60 }] },
  adjustedEntry: { minimumEntryValuePercentage: 20, adjustedEntryValuePercentage: 33.33 },
}
const applicant: ApplicantPayload = {
  personType: 'PF',
  data: {
    nomeCompleto: 'José da Silva', cpf: '123.456.789-09', dataNascimento: '1985-04-10', sexo: 'M', estadoCivil: 'Casado(a)', nacionalidade: 'Brasileira',
    naturalidade: 'São Paulo', naturalidadeUf: 'SP', nomeMae: 'Maria da Silva', rg: '12.345.678-9', rgOrgao: 'SSP', rgUf: 'SP', rgDataEmissao: '2005-01-02',
    celular: '(11) 98765-4321', email: 'jose@ex.com', cep: '01310-100', logradouro: 'Av. Paulista', numero: '1000', bairro: 'Bela Vista', cidade: 'São Paulo', estado: 'SP',
    tipoResidencia: 'ALUGADA', occupation: 'CLT', profissao: 'Analista de sistema', renda: 8500, empresaNome: 'ACME Ltda', tempoEmpregoMeses: 37,
    conjugeCpf: '987.654.321-00',
  },
}

describe('BV — conector oficial', () => {
  it('é oficial e só fica integrado com a credencial completa da loja', () => {
    const bv = new BVAdapter()
    expect(bv.official).toBe(true)
    expect(bv.isIntegrated(ctx)).toBe(true)
    expect(bv.isIntegrated({ ...ctx, credentials: { ...creds, certPfx: '' } })).toBe(false)
    const base = { adapterKey: 'bv', provider: bv, hasCredential: true, credentialReadable: true, credentialExpiresAt: null }
    expect(connectionState({ ...base, integrated: true })).toBe('CONECTADO')
    expect(connectionState({ ...base, integrated: false })).toBe('CONFIGURACAO_NECESSARIA')
  })

  it('pré-simulação exige veículo com FIPE e usa o canal de automóveis', () => {
    expect(preSimulationPayload(terms, creds)).toMatchObject({ channel: 'SIMUXXVL', commercialPartner: 12345, fipeCode: '005415-6', modelYear: '2020', ufVehicle: 'SP', entryValue: 20000 })
    expect(() => preSimulationPayload({ ...terms, vehicle: { modelYear: 2020 } }, creds)).toThrow(/FIPE/)
    expect(() => preSimulationPayload({ ...terms, vehicle: { ...terms.vehicle, category: 'MOTO' } }, creds)).toThrow(/motos/)
  })

  it('pré-análise leva filial/UF da pré-simulação e telefone separado', () => {
    const p = preAnalysisPayload(applicant, terms, pre, creds)
    expect(p).toMatchObject({ proponentTaxIdNumber: '12345678909', ddd: '11', phoneNumber: '987654321', commercialBranchCode: 73, commercialPartnerFederalUnit: 'SP', negotiationType: 'PF', acceptedSCR: true, userLogin: 'loja.user', groupCategory: 1 })
  })

  it('precificação usa o código de simulação e os prazos permitidos', () => {
    const p = pricingPayload(applicant, terms, pre, { codeSimulation: '1045353449' }, creds, new Date('2026-10-15T15:00:00Z'))
    expect(p.simulationCode).toBe('1045353449')
    expect(p.calculationDate).toBe('2026-10-15')
    expect(p.firstInstallmentDueDate).toBe('2026-11-14')
    expect(p.financingTermList.map((t) => t.financingTerm)).toEqual([48, 12, 24, 36, 60])
    expect(p.mainGuarantee.vehicleLicensePlateNumber).toBe('ABC1D23')
    expect(p.mainGuarantee.vehicleModelVersionValue.vehicleModelVersion.code).toBe('017126277')
    expect(p.financingReturnRate).toEqual({ code: 1, value: 1.02, description: 'T00' })
    expect(() => pricingPayload(applicant, terms, pre, {}, creds)).toThrow(/código da simulação/)
  })

  it('prazos: o pedido + padrões, no máximo 6 e dentro do limite', () => {
    expect(pricingTerms(18, [12, 48])).toEqual([18, 12, 24, 36, 48])
    expect(pricingTerms(72, [12, 24, 36, 48])).toEqual([12, 24, 36, 48])
  })

  it('não troca o prazo do cliente quando o BV barra a parcela', () => {
    const pricing = { installmentValueCalculationDataList: [
      { term: 48, financingDetailSimulationCode: 'S48', statusApproved: 'Ajuste Valor de Entrada', minimumEntryValueByTerm: 25000 },
      { term: 36, financingDetailSimulationCode: 'S36', statusApproved: 'Aprovado' },
    ] }
    expect(pickPricingOption(pricing, 48)).toMatchObject({ option: null, blocked: { term: 48 } })
    expect(pickPricingOption(pricing, 36).option?.financingDetailSimulationCode).toBe('S36')
    expect(pickPricingOption({ installmentValueCalculationDataList: [{ term: 48, financingDetailSimulationCode: 'X', statusApproved: 'Não Aprovado' }] }, 48).option).toBeNull()
  })

  it('originação mapeia a ficha universal para os códigos do BV', () => {
    const body = originationPayload(applicant, terms, { financingDetailSimulationCode: 'S48', term: 48, costList: [{ financingCost: { code: 1 }, rate: 0.38, costValue: 1437.08, financingCostGroup: { code: 1 } }] }, { code: 30, doc: '03144721506' }, creds)
    const pd = body.prospectPersonList[0].personData
    expect(pd).toMatchObject({ maritalStatus: { code: 5 }, gender: { code: 'M' }, profession: { code: 126 }, residenceType: { code: 3 }, professionalType: { code: 1 }, incomeSourceType: { code: 2 }, spouseCpfNumber: '98765432100' })
    expect(pd.identificationDocumentList).toHaveLength(2)
    expect(body.commercialProposal).toEqual({ financingDetailSimulationCode: 'S48', certifiedAgent: { code: 30, cpfCnpjNumber: '03144721506' } })
    expect(body.financingCostDataList[0]).toEqual({ financingCost: { code: 1 }, rate: 0.38, costValue: 1437.08, financingCostGroupCode: 1 })
    expect(body.prospectPersonList[0].personAddressList[0]).toMatchObject({ zipCode: '01310100', city: { name: 'SAO PAULO' } })
  })

  it('originação recusa antes de enviar quando falta dado ou profissão não existe no BV', () => {
    const opt = { financingDetailSimulationCode: 'S', term: 48 }
    expect(() => originationPayload({ ...applicant, data: { ...applicant.data, profissao: 'Influenciador cósmico', occupation: 'CLT' } }, terms, opt, { code: 1 }, creds)).toThrow(/não existe na tabela do BV/)
    expect(() => originationPayload({ ...applicant, data: { ...applicant.data, tipoResidencia: 'PROPRIA' } }, terms, opt, { code: 1 }, creds)).toThrow(/patrimônio/)
    expect(() => originationPayload({ ...applicant, personType: 'PJ' }, terms, opt, { code: 1 }, creds)).toThrow(/PJ/)
  })

  it('códigos do BV', () => {
    expect(bvMaritalStatus('união estável')).toBe(5)
    expect(bvMaritalStatus('Viúva')).toBe(6)
    expect(bvResidenceType('PROPRIA')).toBe(1)
    expect(bvResidenceType('FINANCIADA')).toBe(5)
    expect(bvProfession('advogado')).toBe(131)
    expect(bvProfession('', 'APOSENTADO_PENSIONISTA')).toBe(923)
    expect(splitPhone('+55 (11) 3333-4444')).toEqual({ ddd: '11', number: '33334444' })
    expect(splitPhone('123')).toBeNull()
    expect(spDate(0, new Date('2026-10-16T02:00:00Z'))).toBe('2026-10-15')
  })
})

const soap = (status: string, extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:v2="x">
  <soapenv:Header><v2:AuthHeader><v2:assinatura>CHAVE-LOJA-1</v2:assinatura></v2:AuthHeader></soapenv:Header>
  <soapenv:Body><v2:ReceberStatusProposta><v2:proposta>
    <v2:numeroProtocolo>999999</v2:numeroProtocolo>
    <v2:listaMensagemRetorno><v2:mensagemRetorno><v2:codigo>${extra ? '200' : '0'}</v2:codigo><v2:descricao>${extra}</v2:descricao></v2:mensagemRetorno></v2:listaMensagemRetorno>
    ${status ? `<v2:propostaComercial><v2:numeroProposta>123</v2:numeroProposta><v2:status>${status}</v2:status><v2:quantidadeParcelas>60</v2:quantidadeParcelas><v2:valorEntrada>20000</v2:valorEntrada><v2:valorFinanciamento>27209.96</v2:valorFinanciamento><v2:valorParcela>635.35</v2:valorParcela></v2:propostaComercial>` : ''}
  </v2:proposta></v2:ReceberStatusProposta></soapenv:Body></soapenv:Envelope>`

describe('BV — webhook SOAP', () => {
  it('valida a chave do header <assinatura>', () => {
    expect(verifyBvSignature(soap('CA'), 'CHAVE-LOJA-1')).toBe(true)
    expect(verifyBvSignature(soap('CA'), 'OUTRA-CHAVE')).toBe(false)
    expect(new BVAdapter().verifyWebhook(soap('CA'), {}, '')).toBe(false)
  })
  it('converte os status do BV', () => {
    const [ca] = parseBvWebhook(soap('CA'))
    expect(ca).toMatchObject({ externalId: '999999', decision: { status: 'APROVADA', requestId: '123', offer: { installments: 60, installmentValue: 635.35, approvedAmount: 27209.96 } } })
    expect(parseBvWebhook(soap('V'))[0].decision?.status).toBe('EM_ANALISE')
    expect(parseBvWebhook(soap('CR'))[0].decision?.status).toBe('RECUSADA')
    expect(parseBvWebhook(soap('C'))[0].decision?.status).toBe('CANCELADA')
    expect(parseBvWebhook(soap('CA'))[0].eventId).not.toBe(parseBvWebhook(soap('V'))[0].eventId)
  })
  it('erro no fluxo vira pendência com o motivo do BV', () => {
    const [ev] = parseBvWebhook(soap('', 'Proponente com restrição ou impedido de operar'))
    expect(ev.decision).toMatchObject({ status: 'PENDENTE', reason: expect.stringContaining('restrição') })
  })
  it('JSON não é webhook do BV', () => {
    expect(new BVAdapter().parseWebhook({ status: 'x' })).toEqual([])
  })
})

describe('chave de webhook por loja', () => {
  it('é estável por loja e diferente entre lojas', () => {
    const a = tenantWebhookKey('segredo-da-plataforma-123', 'loja-a-123456', 'bv')
    expect(a).toMatch(/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/)
    expect(tenantWebhookKey('segredo-da-plataforma-123', 'loja-a-123456', 'bv')).toBe(a)
    expect(tenantWebhookKey('segredo-da-plataforma-123', 'loja-b-123456', 'bv')).not.toBe(a)
    expect(tenantWebhookUrl('https://app.x/', 'bv', 'loja-a')).toBe('https://app.x/api/webhook/financing/bv?l=loja-a')
  })
})
