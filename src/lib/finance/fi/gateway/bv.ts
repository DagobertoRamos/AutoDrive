// =============================================================================
// Banco BV — conector OFICIAL "Parceiros F&I" (spec OpenAPI 1.0.5 publicada em
// developers-sandbox.bvopen.com.br). Credenciais DA LOJA (BYOC): client_id /
// client_secret + certificado mTLS + códigos de parceiro/canal/login.
//
// Jornada (ordem exigida pelo BV):
//   pré-simulação (filial, região, veículo, tabela) → pré-análise (código de
//   simulação, restrição) → precificação (parcelas por prazo) → agente
//   certificado → originação (protocolo). O andamento chega por webhook SOAP
//   (status V = virou proposta, CA/CR = aprovada/recusada, C = cancelada).
// O BV não publica consulta de status nem cancelamento por API.
//
// Os montadores de payload são puros e exportados (testados em bv.test.ts).
// =============================================================================

import { timingSafeEqual } from 'node:crypto'
import { NotIntegratedBank } from './base'
import { bvPing, bvPost } from './bv-http'
import {
  bvGender, bvIncomeSourceType, bvMaritalStatus, bvNationality, bvPricingBlocked, bvProfession, bvProfessionalType,
  bvResidenceType, BV_CREDIT_SITUATION, upperClean,
} from './bv-codes'
import {
  BankGatewayError,
  type ApplicantPayload, type BankCapabilities, type BankContext, type BankDecision, type BankOffer, type ProposalTerms, type WebhookEvent,
} from './types'

// ── utilitários ──────────────────────────────────────────────────────────────
const digits = (v: unknown) => String(v ?? '').replace(/\D+/g, '')
const str = (v: unknown) => (v == null ? '' : String(v).trim())
const num = (v: unknown): number | null => { const x = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : null }
const round2 = (x: number) => Math.round(x * 100) / 100
const uf = (v: unknown) => str(v).toUpperCase().slice(0, 2)

/** Data no fuso de São Paulo (AAAA-MM-DD), com deslocamento em dias. */
export function spDate(offsetDays = 0, now: Date = new Date()): string {
  const d = new Date(now.getTime() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** "(11) 98765-4321" → { ddd: '11', number: '987654321' } */
export function splitPhone(v: unknown): { ddd: string; number: string } | null {
  let d = digits(v)
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  if (d.length < 10 || d.length > 11) return null
  return { ddd: d.slice(0, 2), number: d.slice(2) }
}

const reject = (msg: string) => new BankGatewayError(msg, 'REJEITADO', 'NAO')

const CATEGORY_GROUP = { AUTOMOVEL: 1, MOTO: 2, PESADO: 3 } as const
export function bvChannel(terms: ProposalTerms, creds: Record<string, string>): string {
  const cat = terms.vehicle?.category ?? 'AUTOMOVEL'
  const c = cat === 'MOTO' ? creds.canalMoto : creds.canal
  if (!c) throw new BankGatewayError(cat === 'MOTO' ? 'Falta o código de canal de motos do BV na credencial.' : 'Falta o código de canal do BV na credencial.', 'CREDENCIAL')
  return c
}

// ── Respostas do BV usadas entre etapas ──────────────────────────────────────
export interface BvPreSimulation {
  commercialPartnerInformation?: { regionCode?: number; branchCode?: number; uf?: string }
  vehicleInformation?: { vehicleCode?: string; marketValue?: number; mark?: string; model?: string; category?: string; accessories?: string; numberCylinders?: number; yearManufacture?: string; modelYear?: string }
  financingTable?: { tableCode?: string; financingReturnRate?: unknown; termList?: { term?: number }[] }
  adjustedEntry?: { minimumEntryValuePercentage?: number; adjustedMinimumEntryValue?: number; adjustedEntryValuePercentage?: number }
}
export interface BvPreAnalysis {
  codeSimulation?: string
  creditRestrictionIndicator?: boolean
  descriptionReasonCreditRestriction?: string
  personCreditsituation?: { code?: number }
  preApproveddata?: { percentageMinimumEntryValue?: number; maximumFinancingTerm?: number; maximumFinancingValue?: number; maximumPayment?: number }
}
interface BvCost { financingCost?: { code?: number }; rate?: number; costValue?: number; financingCostGroup?: { code?: number } }
export interface BvPricingOption {
  statusApproved?: string
  financingDetailSimulationCode?: string
  term?: number
  installmentValue?: number
  financedValue?: number
  entryValue?: number
  minimumEntryValueByTerm?: number
  totalCostValue?: number
  monthlyAgreedRate?: number
  monthlyCetRate?: number
  annualCetRate?: number
  costList?: BvCost[]
}
export interface BvPricing { installmentValueCalculationDataList?: BvPricingOption[]; serviceResponseStatusList?: { message?: string }[] }

// ── Montadores (puros) ───────────────────────────────────────────────────────
export function vehicleOf(terms: ProposalTerms) {
  const v = terms.vehicle ?? {}
  const vehicleValue = terms.vehicleValue ?? null
  if (!vehicleValue || vehicleValue <= 0) throw reject('Informe o valor do veículo na ficha para enviar ao BV.')
  if (!v.fipeCode) throw reject('Vincule à ficha um veículo do estoque com código FIPE para enviar ao BV.')
  const modelYear = v.modelYear ?? v.year
  if (!modelYear) throw reject('O veículo vinculado está sem ano modelo.')
  return { ...v, vehicleValue, modelYear, fipeValue: v.fipeValue ?? vehicleValue, category: v.category ?? 'AUTOMOVEL' }
}

export function preSimulationPayload(terms: ProposalTerms, creds: Record<string, string>) {
  const v = vehicleOf(terms)
  const partner = Number(digits(creds.codigoParceiro))
  if (!partner) throw new BankGatewayError('Falta o código de parceiro comercial do BV na credencial.', 'CREDENCIAL')
  return {
    channel: bvChannel(terms, creds),
    commercialPartner: partner,
    declaredValue: v.vehicleValue,
    entryValue: terms.downPayment ?? 0,
    modelYear: String(v.modelYear),
    ...(uf(v.uf || terms.storeUf) ? { ufVehicle: uf(v.uf || terms.storeUf) } : {}),
    zeroVehicle: !!v.zeroKm,
    fipeCode: str(v.fipeCode),
    fipeValue: v.fipeValue,
  }
}

function proponentDoc(a: ApplicantPayload): string {
  const d = digits(a.personType === 'PJ' ? a.data.cnpj : a.data.cpf)
  if (!d) throw reject(a.personType === 'PJ' ? 'Falta o CNPJ do cliente.' : 'Falta o CPF do cliente.')
  return d
}

export function preAnalysisPayload(a: ApplicantPayload, terms: ProposalTerms, pre: BvPreSimulation, creds: Record<string, string>) {
  const phone = splitPhone(a.data.celular) ?? splitPhone(a.data.telefoneFixo)
  if (!phone) throw reject('Informe um celular válido do cliente (com DDD).')
  const branch = pre.commercialPartnerInformation?.branchCode
  const storeUf = uf(pre.commercialPartnerInformation?.uf || terms.storeUf)
  if (branch == null || !storeUf) throw reject('O BV não devolveu a filial da loja. Confira o código de parceiro na credencial.')
  if (!creds.loginUsuario) throw new BankGatewayError('Falta o login do lojista no BV na credencial.', 'CREDENCIAL')
  return {
    proponentTaxIdNumber: proponentDoc(a),
    proponentName: upperClean(a.data.nomeCompleto ?? a.data.razaoSocial).slice(0, 120),
    ddd: phone.ddd,
    phoneNumber: phone.number,
    ...(str(a.data.email) ? { email: str(a.data.email) } : {}),
    creditOperation: 1,
    groupCategory: CATEGORY_GROUP[terms.vehicle?.category ?? 'AUTOMOVEL'],
    commercialPartner: digits(creds.codigoParceiro),
    commercialBranchCode: branch,
    commercialPartnerFederalUnit: storeUf,
    negotiationType: a.personType,
    // O envio só acontece com a autorização do cliente registrada na ficha (consulta SCR).
    acceptedSCR: true,
    channel: bvChannel(terms, creds),
    userLogin: creds.loginUsuario,
  }
}

/** Prazos pedidos: o da ficha + padrões do BV dentro do limite da tabela (máx. 6). */
export function pricingTerms(requested: number | null | undefined, allowed: number[]): number[] {
  const max = allowed.length ? Math.max(...allowed) : 60
  const std = [12, 24, 36, 48, 60].filter((t) => t <= max)
  const req = requested && requested > 0 && requested <= max ? [requested] : []
  return [...new Set([...req, ...std])].slice(0, 6)
}

function firstReturnRate(r: unknown) {
  const x = Array.isArray(r) ? r[0] : r
  if (!x || typeof x !== 'object') return undefined
  const o = x as { code?: number; value?: number; description?: string }
  return { code: o.code, value: o.value, description: o.description }
}

export function pricingPayload(a: ApplicantPayload, terms: ProposalTerms, pre: BvPreSimulation, analysis: BvPreAnalysis, creds: Record<string, string>, now: Date = new Date()) {
  const v = vehicleOf(terms)
  const cp = pre.commercialPartnerInformation ?? {}
  const vi = pre.vehicleInformation ?? {}
  const storeUf = uf(cp.uf || terms.storeUf)
  const vehicleUf = uf(v.uf || storeUf)
  if (!analysis.codeSimulation) throw reject('O BV não devolveu o código da simulação na pré-análise.')
  if (!vi.vehicleCode) throw reject('O BV não encontrou o veículo pelo código FIPE informado.')
  const birth = a.personType === 'PJ' ? str(a.data.dataFundacao) : str(a.data.dataNascimento)
  if (!birth) throw reject(a.personType === 'PJ' ? 'Falta a data de constituição da empresa.' : 'Falta a data de nascimento do cliente.')
  const allowed = (pre.financingTable?.termList ?? []).map((t) => Number(t.term)).filter((t) => t > 0)
  const adj = pre.adjustedEntry ?? {}
  return {
    requestMinimumPercentageEntryValue: false,
    channel: bvChannel(terms, creds),
    preApproved: false,
    requestFeeExemptionTariffTac: false,
    commercialBranchCode: cp.branchCode,
    commercialBranchTypeCode: 5,
    commercialPartnerTypeCode: 5,
    proponentBirthDate: birth.slice(0, 10),
    calculationDate: spDate(0, now),
    firstInstallmentDueDate: spDate(30, now),
    proponentTaxIdNumber: proponentDoc(a),
    ...(a.personType === 'PJ' && digits(a.data.representanteCpf) ? { guarantorCpf: digits(a.data.representanteCpf) } : {}),
    proposalValue: v.vehicleValue,
    adjustedMinimumEntryValuePercentage: adj.adjustedEntryValuePercentage ?? adj.minimumEntryValuePercentage ?? 0,
    proponentType: a.personType === 'PJ' ? 'J' : 'F',
    graceDaysNumber: 30,
    entryValue: terms.downPayment ?? 0,
    minimumEntryValuePercentage: adj.minimumEntryValuePercentage ?? 0,
    simulationCode: analysis.codeSimulation,
    financingTermList: pricingTerms(terms.installments, allowed).map((financingTerm) => ({ financingTerm })),
    creditOperation: { code: 1 },
    ...(firstReturnRate(pre.financingTable?.financingReturnRate) ? { financingReturnRate: firstReturnRate(pre.financingTable?.financingReturnRate) } : {}),
    legalVehicle: { code: Number(creds.veiculoLegal) || 1 },
    commercialGroup: { code: Number(creds.grupoComercial) || 1 },
    branchRegion: { code: cp.regionCode },
    commercialPartner: { code: digits(creds.codigoParceiro) },
    commercialPartnerFederalUnit: { code: storeUf },
    ...(pre.financingTable?.tableCode ? { financingTable: { code: pre.financingTable.tableCode } } : {}),
    mainGuarantee: {
      additionalGuaranteeIndicator: false,
      zeroVehicle: !!v.zeroKm,
      vehicleManufactureYear: String(vi.yearManufacture || v.year || v.modelYear),
      vehicleModelVersionValue: {
        vehicleModelVersion: {
          vehicleModel: { vehicleBrand: { description: vi.mark ?? str(v.brand) }, vehicleCategory: { description: vi.category ?? v.category }, code: vi.vehicleCode },
          vehicleCylinderCapacityQuantity: vi.numberCylinders ?? 0,
          accessoriesCategory: vi.accessories ?? '',
          vehicleSubcategoryDescription: vi.model ?? str(v.model),
          code: vi.vehicleCode,
        },
        vehicleModelYear: String(vi.modelYear || v.modelYear),
        marketValue: vi.marketValue ?? v.fipeValue,
        marketValueFederalUnit: { code: vehicleUf },
      },
      vehicleLicensePlateNumber: str(v.plate).toUpperCase().replace(/[^A-Z0-9]/g, ''),
      vehicleKilometersQuantity: v.zeroKm ? 0 : Math.max(1, Number(v.km) || 1),
      declaredValue: v.vehicleValue,
      vehicleLicensingFederalUnit: { code: vehicleUf },
    },
    otherGuarantees: [],
  }
}

/** Escolhe a parcela do prazo pedido (ou a mais próxima aprovável). */
export function pickPricingOption(pricing: BvPricing, requested: number | null | undefined): { option: BvPricingOption | null; blocked: BvPricingOption | null } {
  const list = (pricing.installmentValueCalculationDataList ?? []).filter((o) => o.term && o.financingDetailSimulationCode)
  const exact = requested ? list.find((o) => o.term === requested) : undefined
  if (exact && !bvPricingBlocked(exact.statusApproved)) return { option: exact, blocked: null }
  const ok = list.filter((o) => !bvPricingBlocked(o.statusApproved))
  if (!requested && ok.length) return { option: ok.sort((x, y) => (y.term ?? 0) - (x.term ?? 0))[0], blocked: null }
  // Prazo pedido barrado: não troca o prazo do cliente sozinho — devolve o motivo.
  return { option: null, blocked: exact ?? null }
}

export function offerFromPricing(o: BvPricingOption): BankOffer {
  return {
    approvedAmount: o.financedValue ?? null,
    downPayment: o.entryValue ?? null,
    installments: o.term ?? null,
    installmentValue: o.installmentValue ?? null,
    rateMonthly: o.monthlyAgreedRate ?? null,
    cetMonthly: o.monthlyCetRate ?? null,
    cetYearly: o.annualCetRate ?? null,
    totalAmount: o.installmentValue && o.term ? round2(o.installmentValue * o.term) : null,
  }
}

function sumPatrimonio(v: unknown): number {
  if (!Array.isArray(v)) return 0
  return round2(v.reduce((s, x) => s + (num((x as { valor?: unknown })?.valor) ?? 0), 0))
}
function monthsSince(date: unknown, now: Date): number | null {
  const d = new Date(str(date))
  if (Number.isNaN(d.getTime())) return null
  return Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()))
}

export function originationPayload(a: ApplicantPayload, terms: ProposalTerms, option: BvPricingOption, agent: { code: number; doc?: string | null }, creds: Record<string, string>, now: Date = new Date()) {
  if (a.personType === 'PJ') throw reject('Ficha de empresa (PJ) ainda vai ao BV pelo portal do banco. A integração envia pessoa física.')
  const d = a.data
  const occ = d.occupation
  const need = (cond: unknown, label: string) => { if (!cond) throw reject(`Para enviar ao BV, preencha: ${label}.`) }
  const marital = bvMaritalStatus(d.estadoCivil); need(marital, 'estado civil')
  const gender = bvGender(d.sexo); need(gender, 'sexo')
  const profession = bvProfession(d.profissao, occ)
  if (!profession) throw reject(`A profissão "${str(d.profissao) || 'não informada'}" não existe na tabela do BV. Ajuste a profissão na ficha.`)
  const residence = bvResidenceType(d.tipoResidencia); need(residence, 'tipo de residência')
  need(str(d.nomeMae), 'nome da mãe'); need(str(d.dataNascimento), 'data de nascimento')
  need(str(d.naturalidade) && uf(d.naturalidadeUf), 'naturalidade e UF de naturalidade')
  need(digits(d.rg), 'RG'); need(str(d.cep) && str(d.logradouro) && str(d.bairro) && str(d.cidade) && uf(d.estado), 'endereço completo')
  const renda = num(d.renda); need(renda && renda > 0, 'renda')
  const cel = splitPhone(d.celular); need(cel, 'celular com DDD')
  const assetValue = sumPatrimonio(d.patrimonio)
  if (residence === 1 && assetValue <= 0) throw reject('Residência própria: informe o patrimônio (valor do imóvel) na ficha para o BV.')
  if (occ === 'APOSENTADO_PENSIONISTA') need(digits(d.numeroBeneficio), 'número do benefício do INSS')

  const docs: unknown[] = [
    { identificationDocumentType: { code: 0 }, documentNumber: digits(d.cpf) },
    {
      identificationDocumentType: { code: 1 }, documentNumber: digits(d.rg),
      ...(str(d.rgDataEmissao) ? { issueDate: str(d.rgDataEmissao).slice(0, 10) } : {}),
      ...(str(d.rgOrgao) ? { issuingAuthorityName: upperClean(d.rgOrgao) } : {}),
      ...(uf(d.rgUf) ? { issuingStateUnit: { name: uf(d.rgUf) } } : {}),
    },
  ]
  if (occ === 'APOSENTADO_PENSIONISTA') docs.push({ identificationDocumentType: { code: 2 }, documentNumber: digits(d.numeroBeneficio) })

  const phoneObj = (p: { ddd: string; number: string }, type: string) => ({ number: p.number, areaCode: p.ddd, phoneType: { code: type } })
  const fixo = splitPhone(d.telefoneFixo)
  const addresses: unknown[] = [{
    zipCode: digits(d.cep), addressType: { code: 1 }, state: { name: uf(d.estado) },
    neighborhood: upperClean(d.bairro), street: upperClean(d.logradouro), number: str(d.numero) || 'SN',
    ...(str(d.complemento) ? { additionalInfo: upperClean(d.complemento) } : {}),
    correspondenceIndicator: true,
    city: { name: upperClean(d.cidade), state: { name: uf(d.estado) } },
    phoneList: [phoneObj(cel!, '3'), ...(fixo ? [phoneObj(fixo, '1')] : [])],
  }]
  const empTel = splitPhone(d.empresaTelefone)
  if (occ === 'EMPRESARIO') {
    need(digits(d.empresaCnpj), 'CNPJ da empresa do cliente')
    need(str(d.empresaCep) && str(d.empresaLogradouro) && str(d.empresaCidade) && uf(d.empresaEstado), 'endereço da empresa do cliente')
    addresses.push({
      zipCode: digits(d.empresaCep), addressType: { code: 2 }, state: { name: uf(d.empresaEstado) },
      neighborhood: upperClean(d.empresaBairro) || 'CENTRO', street: upperClean(d.empresaLogradouro), number: str(d.empresaNumero) || 'SN',
      ...(str(d.empresaComplemento) ? { additionalInfo: upperClean(d.empresaComplemento) } : {}),
      correspondenceIndicator: false,
      city: { name: upperClean(d.empresaCidade), state: { name: uf(d.empresaEstado) } },
      phoneList: [phoneObj(empTel ?? cel!, empTel ? '2' : '3')],
    })
  }
  const payer = occ === 'APOSENTADO_PENSIONISTA' ? 'INSS' : occ === 'AUTONOMO' && !str(d.empresaNome) ? 'AUTONOMO' : upperClean(d.empresaNome)
  need(payer, 'nome da empresa onde trabalha')
  const months = num(d.tempoEmpregoMeses) ?? monthsSince(d.dataAdmissao, now) ?? 0
  const refs = Array.isArray(d.referencias) ? (d.referencias as { nome?: unknown; telefone?: unknown }[]) : []
  const ref = refs.map((r) => ({ name: upperClean(r?.nome), phone: splitPhone(r?.telefone) })).find((r) => r.name && r.phone)

  const person = {
    personType: 'F',
    personData: {
      personRole: { code: 1 },
      name: upperClean(d.nomeCompleto).slice(0, 120),
      birthDate: str(d.dataNascimento).slice(0, 10),
      motherName: upperClean(d.nomeMae),
      maritalStatus: { code: marital },
      gender: { code: gender },
      profession: { code: profession },
      identificationDocumentList: docs,
      incomeSourceType: { code: bvIncomeSourceType(occ) },
      professionalType: { code: bvProfessionalType(occ) },
      residenceType: { code: residence },
      nationality: { description: bvNationality(d.nacionalidade) },
      placeOfBirth: { name: upperClean(d.naturalidade), state: { name: uf(d.naturalidadeUf) } },
      personOccupation: {
        payerSourceName: payer.slice(0, 100),
        occupationDurationMonths: Math.min(600, Math.max(0, Math.round(months))),
        ...(empTel ? { companyPhone: phoneObj(empTel, '2') } : {}),
      },
      ...(marital === 5 && digits(d.conjugeCpf).length === 11 ? { spouseCpfNumber: digits(d.conjugeCpf) } : {}),
      assetValue,
    },
    ...(occ === 'EMPRESARIO' ? {
      companyData: {
        cnpjNumber: digits(d.empresaCnpj), legalName: upperClean(d.empresaNome), tradeName: upperClean(d.empresaNome),
        stateRegistration: digits(d.inscricaoEstadual), monthsInActivity: 0,
      },
    } : {}),
    personAddressList: addresses,
    ...(str(d.email) ? { personElectronicAddressList: [{ description: str(d.email) }] } : {}),
    personIncome: { value: renda },
    ...(ref ? { personReference: { basicPersonData: { name: ref.name }, referencePersonPhone: phoneObj(ref.phone!, ref.phone!.number.length === 9 ? '3' : '1') } } : {}),
  }

  return {
    channel: bvChannel(terms, creds),
    prospectPersonList: [person],
    commercialProposal: {
      financingDetailSimulationCode: option.financingDetailSimulationCode,
      certifiedAgent: { code: agent.code, ...(agent.doc ? { cpfCnpjNumber: agent.doc } : {}) },
    },
    financingCostDataList: (option.costList ?? []).map((c) => ({
      financingCost: { code: c.financingCost?.code ?? 0 }, rate: c.rate ?? 0, costValue: c.costValue ?? 0,
      ...(c.financingCostGroup?.code != null ? { financingCostGroupCode: c.financingCostGroup.code } : {}),
    })),
  }
}

// ── Webhook SOAP do BV ───────────────────────────────────────────────────────
function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`))
  return m ? m[1].trim() : null
}
function tags(xml: string, name: string): string[] {
  return [...xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'g'))].map((m) => m[1].trim())
}
const xmlText = (s: string | null) => (s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim()

const BV_STATUS: Record<string, BankDecision['status']> = { V: 'EM_ANALISE', CA: 'APROVADA', CR: 'RECUSADA', C: 'CANCELADA' }

export function verifyBvSignature(rawBody: string, secret: string): boolean {
  const sig = xmlText(tag(rawBody, 'assinatura'))
  if (!sig || !secret) return false
  const a = Buffer.from(sig, 'utf8'); const b = Buffer.from(secret, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export function parseBvWebhook(rawXml: string): WebhookEvent[] {
  return tags(rawXml, 'proposta').map((p) => {
    const protocol = digits(xmlText(tag(p, 'numeroProtocolo'))) || null
    const pc = tag(p, 'propostaComercial') ?? ''
    const code = xmlText(tag(pc, 'status')).toUpperCase()
    const proposalNumber = xmlText(tag(pc, 'numeroProposta')) || null
    const messages = tags(p, 'mensagemRetorno')
      .map((m) => ({ codigo: xmlText(tag(m, 'codigo')), descricao: xmlText(tag(m, 'descricao')) }))
      .filter((m) => m.codigo && m.codigo !== '0')
    const reason = messages.map((m) => m.descricao).filter(Boolean).join(' · ').slice(0, 280) || null
    let decision: BankDecision | null = null
    const status = BV_STATUS[code]
    if (status) {
      const n = (k: string) => num(xmlText(tag(pc, k)))
      const installments = n('quantidadeParcelas')
      const installmentValue = n('valorParcela')
      const offer: BankOffer | null = status === 'APROVADA' || status === 'EM_ANALISE' ? {
        approvedAmount: n('valorFinanciamento') || null, downPayment: n('valorEntrada'), installments: installments || null,
        installmentValue: installmentValue || null, totalAmount: installments && installmentValue ? round2(installments * installmentValue) : null,
      } : null
      decision = {
        externalId: protocol, requestId: proposalNumber, status,
        reason: status === 'RECUSADA' ? (reason ?? 'Recusada pela análise de crédito do BV.') : status === 'CANCELADA' ? (reason ?? 'Proposta cancelada no BV.') : reason,
        offer,
      }
    } else if (messages.length) {
      // "Erro no fluxo": o BV parou a proposta e diz por quê; a loja corrige e reenvia.
      decision = { externalId: protocol, status: 'PENDENTE', reason: `O BV apontou: ${reason ?? 'erro no fluxo da proposta.'}`, pendingItems: [{ key: 'BV_ERRO_FLUXO', label: reason ?? 'Erro no fluxo da proposta', kind: 'OUTRO' }] }
    }
    return {
      eventId: protocol ? `bv:${protocol}:${code || 'ERRO'}:${proposalNumber ?? ''}:${messages.map((m) => m.codigo).join(',')}` : null,
      externalId: protocol,
      decision,
      raw: { protocolo: protocol, status: code || null, numeroProposta: proposalNumber, mensagens: messages },
    }
  })
}

// ── Conector ─────────────────────────────────────────────────────────────────
export class BVAdapter extends NotIntegratedBank {
  readonly key = 'bv'
  readonly name = 'Banco BV'
  readonly official = true
  readonly capabilities: BankCapabilities = {
    simulate: false, preAnalyze: true, submit: true, update: false, status: false, documents: false,
    formalize: false, contract: false, funding: false, cancel: false, webhook: true,
  }
  protected readonly credentialFields = ['clientId', 'clientSecret', 'certPfx', 'codigoParceiro', 'canal', 'loginUsuario']

  /** Campos da ficha que a originação do BV exige (pessoa física). */
  getRequiredFields(): string[] {
    return ['cpf', 'dataNascimento', 'sexo', 'estadoCivil', 'nacionalidade', 'naturalidade', 'naturalidadeUf', 'nomeMae', 'rg', 'rgOrgao', 'rgUf',
      'celular', 'email', 'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado', 'tipoResidencia', 'occupation', 'profissao', 'renda']
  }

  private async preSimulate(terms: ProposalTerms, ctx: BankContext) {
    return bvPost<BvPreSimulation>(ctx, '/partners/v1/pre-simulation', preSimulationPayload(terms, ctx.credentials), { idempotent: true })
  }
  private async analyze(a: ApplicantPayload, terms: ProposalTerms, pre: BvPreSimulation, ctx: BankContext) {
    return bvPost<BvPreAnalysis>(ctx, '/pre-analyze-vehicles/v2/pre-analysis-vehicle-financing', preAnalysisPayload(a, terms, pre, ctx.credentials), { idempotent: true })
  }

  /** Recusa antecipada pela pré-análise (impedido/negado/restrição). */
  private analysisRefusal(an: BvPreAnalysis): string | null {
    const code = an.personCreditsituation?.code
    if (code === 1 || code === 2) return `Pré-análise do BV: ${BV_CREDIT_SITUATION[code]}${an.descriptionReasonCreditRestriction ? ` (${an.descriptionReasonCreditRestriction})` : ''}.`
    if (an.creditRestrictionIndicator && code !== 3) return `Pré-análise do BV: cliente com restrição de crédito${an.descriptionReasonCreditRestriction ? ` (${an.descriptionReasonCreditRestriction})` : ''}.`
    return null
  }

  async preAnalyze(a: ApplicantPayload, terms: ProposalTerms, ctx: BankContext): Promise<BankDecision> {
    const pre = await this.preSimulate(terms, ctx)
    const an = await this.analyze(a, terms, pre, ctx)
    const refusal = this.analysisRefusal(an)
    if (refusal) return { status: 'RECUSADA', reason: refusal }
    const p = an.preApproveddata ?? {}
    return {
      requestId: an.codeSimulation ?? null,
      status: an.personCreditsituation?.code === 3 ? 'PRE_APROVADA' : 'EM_ANALISE',
      reason: `Situação no BV: ${BV_CREDIT_SITUATION[an.personCreditsituation?.code ?? 0] ?? 'Neutro'}.`,
      offer: { approvedAmount: p.maximumFinancingValue ?? null, installments: p.maximumFinancingTerm ?? null, installmentValue: p.maximumPayment ?? null },
    }
  }

  async submitProposal(a: ApplicantPayload, terms: ProposalTerms, ctx: BankContext): Promise<BankDecision> {
    // Valida tudo o que dá ANTES de qualquer chamada (erro aqui = nada saiu daqui).
    vehicleOf(terms)
    if (a.personType === 'PJ') throw reject('Ficha de empresa (PJ) ainda vai ao BV pelo portal do banco. A integração envia pessoa física.')

    const pre = await this.preSimulate(terms, ctx)
    const an = await this.analyze(a, terms, pre, ctx)
    const refusal = this.analysisRefusal(an)
    if (refusal) return { status: 'RECUSADA', reason: refusal }

    const pricing = await bvPost<BvPricing>(ctx, '/pricing-online/v1/pricing-online-fandis', pricingPayload(a, terms, pre, an, ctx.credentials), { idempotent: true })
    const { option, blocked } = pickPricingOption(pricing, terms.installments)
    if (!option) {
      if (blocked && blocked.minimumEntryValueByTerm) {
        return { status: 'RECUSADA', reason: `O BV pede entrada mínima de R$ ${blocked.minimumEntryValueByTerm.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para ${blocked.term} parcelas (${blocked.statusApproved}). Ajuste a entrada e envie de novo.` }
      }
      return { status: 'RECUSADA', reason: blocked?.statusApproved ? `Precificação do BV: ${blocked.statusApproved}.` : 'O BV não devolveu condição para o prazo pedido.' }
    }

    const agents = await bvPost<{ certifiedAgentList?: { code?: number; primary?: boolean; personBasicData?: { proponentTaxIdNumber?: string } }[] }>(
      ctx, '/certified-agent/v1/agents',
      { codeCommercialPartner: digits(ctx.credentials.codigoParceiro), loginUser: ctx.credentials.loginUsuario, productCodeCertificateList: [12] },
      { idempotent: true },
    )
    const list = (agents.certifiedAgentList ?? []).filter((x) => x.code != null)
    const agent = list.find((x) => x.primary) ?? list[0]
    if (!agent) throw new BankGatewayError('Nenhum agente certificado ativo para a loja no BV. Peça a habilitação ao BV.', 'CREDENCIAL')

    const body = originationPayload(a, terms, option, { code: agent.code!, doc: agent.personBasicData?.proponentTaxIdNumber ?? null }, ctx.credentials)
    // Originação NÃO é idempotente: falha de rede após o envio vira "verificar".
    const res = await bvPost<{ protocolNumber?: string; returnMessageList?: { description?: string }[] }>(ctx, '/origination-proposal/v3/origination-proposals', body)
    const protocol = digits(res?.protocolNumber)
    if (!protocol) throw new BankGatewayError('O BV não devolveu o protocolo da proposta.', 'INDISPONIVEL', 'TALVEZ')
    const notes = (res.returnMessageList ?? []).map((m) => m.description).filter(Boolean).join(' · ')
    return {
      externalId: protocol,
      requestId: protocol,
      status: 'EM_ANALISE',
      reason: notes || `Protocolo BV ${protocol}. Aguardando análise do banco.`,
      offer: offerFromPricing(option),
    }
  }

  async testConnection(ctx: BankContext): Promise<void> { await bvPing(ctx) }

  /** O BV autentica o webhook com a chave cadastrada no header SOAP <assinatura>. */
  verifyWebhook(rawBody: string, _headers: Record<string, string>, secret: string): boolean {
    return verifyBvSignature(rawBody, secret)
  }
  parseWebhook(payload: unknown): WebhookEvent[] {
    return typeof payload === 'string' ? parseBvWebhook(payload) : []
  }
}
