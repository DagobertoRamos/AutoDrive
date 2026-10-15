// =============================================================================
// Banco PAN — conector OFICIAL da OpenAPI Veículos. Fonte: portal
// developers.bancopan.com.br ("Financiamento de Veículos") + pacote
// "Documentação v4" do próprio portal (PDFs de campos e JSONs de exemplo).
// Credenciais DA LOJA (BYOC): ApiKey + SecretKey + usuário/senha de integração
// (NPV) + código da loja + CPF do agente certificado.
//
// Jornada:
//   pré-análise (farol do Crivo, por CPF) → código Molicar do veículo (marcas →
//   modelos → versões) → simulação (identificadorSimulacao + condições por prazo)
//   → gravarSimulacao (gera o número da proposta) → complemento do cliente →
//   complemento do bem. O andamento é CONSULTADO em GET /propostas/{n}
//   (o PAN não publica webhook nem cancelamento por API).
//
// Os montadores de payload são puros e exportados (testados em pan.test.ts).
// =============================================================================

import { NotIntegratedBank } from './base'
import { splitPhone } from './bv'
import { panPing, panRequest } from './pan-http'
import {
  panCatalogCategory, panCategory, panCreditRefused, panFarol, panMaritalStatus, panMatchBrand, panMatchModels, panMatchProfession,
  panNationalityCode, panNorm, panOccupationNature, panParsePreApproved, panPickVersion, panProposalStatus, panSex, panUpper,
  type PanMolicarVersion,
} from './pan-codes'
import {
  BankGatewayError,
  type ApplicantPayload, type BankCapabilities, type BankContext, type BankDecision, type BankOffer, type ContractInfo, type ProposalTerms,
} from './types'

// ── utilitários ──────────────────────────────────────────────────────────────
const digits = (v: unknown) => String(v ?? '').replace(/\D+/g, '')
const str = (v: unknown) => (v == null ? '' : String(v).trim())
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const x = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(x) ? x : null
}
const round2 = (x: number) => Math.round(x * 100) / 100
const uf = (v: unknown) => str(v).toUpperCase().slice(0, 2)
const enc = encodeURIComponent
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const brl = (x: number) => `R$ ${x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const reject = (msg: string) => new BankGatewayError(msg, 'REJEITADO', 'NAO')
const credError = (msg: string) => new BankGatewayError(msg, 'CREDENCIAL')

/** "12345678909" → "123.456.789-09" (máscara obrigatória no CPF do agente). */
export const fmtCpf = (v: unknown) => { const d = digits(v); return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d }
export const fmtCnpj = (v: unknown) => { const d = digits(v); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d }
export const fmtCep = (v: unknown) => { const d = digits(v); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d }
/** "1985-04-10" → "10/04/1985 00:00:00" (formato do exemplo de cônjuge). */
export const fmtDateTimeBr = (v: unknown) => { const m = str(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]} 00:00:00` : '' }

function sumValues(v: unknown): number {
  if (!Array.isArray(v)) return 0
  return round2(v.reduce((s, x) => s + (num((x as { valor?: unknown })?.valor) ?? 0), 0))
}

function cpfOf(a: ApplicantPayload): string {
  if (a.personType === 'PJ') throw reject('Ficha de empresa (PJ) ainda vai ao PAN pelo portal do banco. A integração envia pessoa física.')
  const d = digits(a.data.cpf)
  if (d.length !== 11) throw reject('Falta o CPF do cliente.')
  return d
}

function idLojaOf(creds: Record<string, string>): string {
  const id = str(creds.idLoja)
  if (!id) throw credError('Falta o código da loja no PAN (idLoja) na credencial.')
  return id
}

// ── Veículo ──────────────────────────────────────────────────────────────────
export function vehicleOf(terms: ProposalTerms) {
  const v = terms.vehicle ?? {}
  const vehicleValue = terms.vehicleValue ?? null
  if (!vehicleValue || vehicleValue <= 0) throw reject('Informe o valor do veículo na ficha para enviar ao PAN.')
  const categoria = panCategory(v.category)
  if (!categoria) throw reject('O PAN financia pela integração só automóveis (leves) e motos.')
  if (!str(v.brand) || !str(v.model)) throw reject('Vincule à ficha um veículo do estoque com marca e modelo para enviar ao PAN.')
  const modelYear = v.modelYear ?? v.year
  if (!modelYear) throw reject('O veículo vinculado está sem ano modelo.')
  const ufLic = uf(v.uf || terms.storeUf)
  if (!ufLic) throw reject('Falta a UF de licenciamento do veículo (UF da loja no cadastro).')
  return { ...v, vehicleValue, modelYear, categoria, ufLic }
}

// ── Pré-análise ──────────────────────────────────────────────────────────────
export interface PanPreAnalysis {
  camposRequeridos?: { campo?: string; requerido?: boolean }[]
  codigo?: number | string
  descricao?: string
  descricaoPA?: string
}

/** GET /openapi/veiculos/v0/lojas/{idLoja}/preanalise?cpf=…&categoriaVeiculo=LEVES|MOTOS */
export function preAnalysisRequest(a: ApplicantPayload, terms: ProposalTerms, creds: Record<string, string>) {
  const categoria = panCategory(terms.vehicle?.category)
  if (!categoria) throw reject('O PAN financia pela integração só automóveis (leves) e motos.')
  return {
    path: `/openapi/veiculos/v0/lojas/${enc(idLojaOf(creds))}/preanalise`,
    query: { cpf: cpfOf(a), categoriaVeiculo: categoria },
  }
}

export function decisionFromPreAnalysis(r: PanPreAnalysis): BankDecision {
  const farol = panFarol(r.codigo, r.descricao)
  const text = str(r.descricaoPA)
  if (farol === 'INDISPONIVEL') throw new BankGatewayError('A pré-análise do PAN está indisponível agora. Tente de novo em alguns minutos.', 'INDISPONIVEL')
  if (farol === 'NAO_ELEGIVEL') return { status: 'RECUSADA', reason: `Pré-análise do PAN: não elegível${text ? ` (${text})` : ''}.` }
  const pa = panParsePreApproved(text)
  return {
    status: farol === 'PRE_APROVADO' ? 'PRE_APROVADA' : 'EM_ANALISE',
    reason: `Pré-análise do PAN: ${str(r.descricao) || 'sem farol'}${text ? `. ${text}` : '.'}`,
    offer: farol === 'PRE_APROVADO' && pa ? { approvedAmount: pa.approvedAmount, installments: pa.installments, installmentValue: pa.installmentValue } : null,
  }
}

// ── Simulação ────────────────────────────────────────────────────────────────
export function simulationPayload(a: ApplicantPayload, terms: ProposalTerms, creds: Record<string, string>, codigoProduto: string, codigoMolicar: string) {
  const v = vehicleOf(terms)
  const d = a.data
  const cpf = cpfOf(a)
  const birth = str(d.dataNascimento).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) throw reject('Falta a data de nascimento do cliente.')
  const cel = splitPhone(d.celular)
  if (!cel) throw reject('Informe um celular válido do cliente (com DDD).')
  const cep = digits(d.cep)
  // CEP é obrigatório na simulação de MOTOS (política CLUSTER).
  if (v.categoria === 'MOTOS' && cep.length !== 8) throw reject('Para financiar moto no PAN, informe o CEP do cliente.')
  const natureza = panOccupationNature(d.occupation)
  const renda = num(d.renda)
  return {
    dadosBasicos: {
      // Enum documentado: "CODIGO_LOJA" (código origem 4) ou "CNPJ".
      tipoIdLoja: 'CODIGO_LOJA',
      idLoja: idLojaOf(creds),
      codigoProduto,
    },
    dadosCliente: {
      cpf,
      dataNascimento: birth,
      ddd: cel.ddd,
      celular: cel.number,
      ...(cep.length === 8 ? { cep } : {}),
      ...(natureza ? { codigoNaturezaOcupacao: natureza } : {}),
      renda: renda && renda > 0 ? renda : 0,
      rendaComplementar: sumValues(d.outrasRendas),
      taxistaPne: false,
    },
    dadosVeiculos: [{
      categoria: v.categoria,
      codigoVeiculo: codigoMolicar,
      zeroKm: !!v.zeroKm,
      anoModelo: Number(v.modelYear),
      ufLicenciamento: v.ufLic,
      valorVenda: v.vehicleValue,
    }],
    condicoesPreferenciais: {
      condicaoRetornoPreferencial: '',
      plusPreferencial: '',
      carenciaPreferencial: null,
      pacoteSegurosPreferencial: null,
      tabelaPrecoPreferencial: '',
      prazoSelecionadoPreferencial: terms.installments && terms.installments > 0 ? terms.installments : null,
    },
    simulacao: {
      // "Multiplos" = todos os prazos (o PAN indica como o usual); prazos [{}] = todos os disponíveis.
      tipoCalculo: 'Multiplos',
      valorEntrada: terms.downPayment ?? 0,
      prazos: [{}],
    },
  }
}

/** Item de "simulacoes" (schema do PDF "Simulação – Response"). */
export interface PanSimOption {
  prazo?: number
  decisaoCredito?: string | null
  mensagemCredito?: string | null
  valorParcela?: number
  valorPrincipal?: number
  entradaSolicitada?: number
  entradaAnalisada?: number
  entradaMinimaAnalisada?: number
  entradaSugerida?: number
  idPacoteSegurosServicos?: number | null
  tabelaCalculada?: { codigoTabela?: string; carencia?: number; retorno?: { taxa?: number; condicao?: string }; plusCalculado?: { descricao?: string | null; taxa?: number | null } }
  despesasCalculada?: Record<string, unknown>[]
  codigoAutorizacaoTC?: number | null
  dadosOperacao?: { taxaJurosAoMes?: number; taxaCETAoMes?: number; taxaCETAoAno?: number; valorTotalFinanciado?: number }
  status?: { sucesso?: boolean; mensagem?: string | null }
}
export interface PanSimulation {
  identificadorSimulacao?: string
  simulacoes?: PanSimOption[]
  veiculosFinanciado?: { marca?: string; modelo?: string }[] | { marca?: string; modelo?: string }
}

const validOption = (o: PanSimOption) => !!o.prazo && !!o.valorParcela && o.valorParcela > 0 && o.status?.sucesso !== false

/** Condição do prazo pedido. Não troca o prazo do cliente sozinho. */
export function pickSimOption(sim: PanSimulation, requested: number | null | undefined): PanSimOption | null {
  const list = (sim.simulacoes ?? []).filter(validOption)
  if (requested) return list.find((o) => o.prazo === requested) ?? null
  return list.find((o) => !panCreditRefused(o.decisaoCredito)) ?? null
}

/** Motivo para não seguir com a condição escolhida (Crivo recusou ou entrada abaixo do mínimo). */
export function simOptionRefusal(o: PanSimOption, downPayment: number | null | undefined): string | null {
  if (panCreditRefused(o.decisaoCredito)) return `Crivo do PAN: ${str(o.mensagemCredito) || str(o.decisaoCredito)}.`
  const min = o.entradaMinimaAnalisada ?? 0
  if (min > 0 && (downPayment ?? 0) + 0.01 < min) return `O PAN pede entrada mínima de ${brl(min)} para ${o.prazo} parcelas. Ajuste a entrada e envie de novo.`
  return null
}

export function offerFromSimOption(o: PanSimOption, terms: ProposalTerms): BankOffer {
  const op = o.dadosOperacao ?? {}
  return {
    approvedAmount: op.valorTotalFinanciado ?? o.valorPrincipal ?? null,
    downPayment: o.entradaAnalisada ?? o.entradaSolicitada ?? terms.downPayment ?? null,
    installments: o.prazo ?? null,
    installmentValue: o.valorParcela ?? null,
    rateMonthly: op.taxaJurosAoMes ?? null,
    cetMonthly: op.taxaCETAoMes ?? null,
    cetYearly: op.taxaCETAoAno ?? null,
    totalAmount: o.valorParcela && o.prazo ? round2(o.valorParcela * o.prazo) : null,
  }
}

function financedVehicle(sim: PanSimulation): string {
  const v = Array.isArray(sim.veiculosFinanciado) ? sim.veiculosFinanciado[0] : sim.veiculosFinanciado
  return [str(v?.marca), str(v?.modelo)].filter(Boolean).join(' ')
}

// ── Gravar simulação (gera a proposta) ──────────────────────────────────────
export function recordSimulationPayload(sim: PanSimulation, option: PanSimOption, opts: { codigoProduto: string; codigoOperador: string; cpfCertificado: string }, terms: ProposalTerms) {
  if (!sim.identificadorSimulacao) throw reject('O PAN não devolveu o identificador da simulação.')
  const t = option.tabelaCalculada
  if (!t?.codigoTabela) throw reject('O PAN não devolveu a tabela calculada para o prazo escolhido.')
  if (digits(opts.cpfCertificado).length !== 11) throw credError('Falta o CPF do agente certificado da loja na credencial do PAN.')
  return {
    dadosBasicos: {
      codigoOperador: opts.codigoOperador,
      cpfCertificado: fmtCpf(opts.cpfCertificado),
      codigoProduto: opts.codigoProduto,
      identificadorSimulacao: sim.identificadorSimulacao,
    },
    dadosSimulacao: {
      prazo: option.prazo,
      valorParcela: option.valorParcela,
      valorEntrada: option.entradaAnalisada ?? option.entradaSolicitada ?? terms.downPayment ?? 0,
      idPacoteSeguros: option.idPacoteSegurosServicos ?? null,
      tabelaCalculada: {
        codigo: t.codigoTabela,
        carencia: t.carencia ?? null,
        condicao: t.retorno?.condicao ?? '',
        plusComissao: { taxa: t.plusCalculado?.taxa ?? null, descricao: t.plusCalculado?.descricao ?? null },
      },
      despesasSelecionadas: option.despesasCalculada ?? [],
      ...(option.codigoAutorizacaoTC != null ? { codigoAutorizacaoTC: option.codigoAutorizacaoTC } : {}),
    },
  }
}

/** Resposta do gravarSimulacao: { numeroProposta, status: { codigo: "Sucesso"|"Erro"|"NaoDefinido", erros: { erro: [{ Mensagem, codigo }] } } }. */
export interface PanRecordResult { numeroProposta?: string; status?: { codigo?: string; erros?: { erro?: { Mensagem?: string; mensagem?: string; codigo?: number }[] } } }
export function parseRecordResult(r: PanRecordResult | null): { numero: string | null; erro: string | null } {
  const errs = (r?.status?.erros?.erro ?? []).map((e) => str(e.Mensagem ?? e.mensagem)).filter(Boolean)
  const failed = panNorm(r?.status?.codigo) === 'ERRO' || errs.length > 0
  return { numero: str(r?.numeroProposta) || null, erro: failed ? (errs.join(' · ').slice(0, 280) || 'O PAN recusou gravar a simulação.') : null }
}

// ── Complementos da proposta ─────────────────────────────────────────────────
export interface PanOperator { codigo: string; nome: string }
const baseInfo = (creds: Record<string, string>, op: PanOperator) => ({
  cpfAgenteCertificado: fmtCpf(creds.cpfAgenteCertificado),
  operador: { codigo: op.codigo, nome: op.nome.slice(0, 30) },
})

export function clientComplementPayload(a: ApplicantPayload, creds: Record<string, string>, op: PanOperator, profissao: { codigo: string; nome: string } | null) {
  cpfOf(a)
  const d = a.data
  const need = (cond: unknown, label: string) => { if (!cond) throw reject(`Para enviar ao PAN, preencha: ${label}.`) }
  const sexo = panSex(d.sexo); need(sexo, 'sexo')
  const estadoCivil = panMaritalStatus(d.estadoCivil); need(estadoCivil, 'estado civil')
  const nacionalidade = panNationalityCode(d.nacionalidade)
  if (!nacionalidade) throw reject('Cliente estrangeiro ainda vai ao PAN pelo portal do banco.')
  need(str(d.nomeCompleto), 'nome completo'); need(str(d.nomeMae), 'nome da mãe')
  need(str(d.rg) && str(d.rgOrgao) && uf(d.rgUf), 'RG, órgão emissor e UF do RG')
  need(str(d.naturalidade) && uf(d.naturalidadeUf), 'naturalidade e UF de naturalidade')
  need(str(d.cep) && str(d.logradouro) && str(d.bairro) && str(d.cidade) && uf(d.estado), 'endereço completo')
  const cel = splitPhone(d.celular); need(cel, 'celular com DDD')

  const telefones: { tipo: string; ddd: string; numero: string }[] = [{ tipo: 'CELULAR', ddd: cel!.ddd, numero: cel!.number }]
  const fixo = splitPhone(d.telefoneFixo)
  if (fixo) telefones.unshift({ tipo: 'FONE_RESIDENCIAL', ddd: fixo.ddd, numero: fixo.number })
  const com = splitPhone(d.empresaTelefone)
  if (com) telefones.push({ tipo: 'FONE_COMERCIAL1', ddd: com.ddd, numero: com.number })

  const home = {
    cep: fmtCep(d.cep), uf: uf(d.estado), cidade: panUpper(d.cidade), bairro: panUpper(d.bairro), logradouro: panUpper(d.logradouro),
    numero: str(d.numero) || 'SN', ...(str(d.complemento) ? { complemento: panUpper(d.complemento) } : {}),
  }
  const dadosPostais: Record<string, unknown>[] = [{ tipo: 'RESIDENCIAL', ...home }]
  if (str(d.empresaCep) && str(d.empresaLogradouro) && str(d.empresaCidade) && uf(d.empresaEstado)) {
    dadosPostais.push({
      tipo: 'COMERCIAL', cep: fmtCep(d.empresaCep), uf: uf(d.empresaEstado), cidade: panUpper(d.empresaCidade), bairro: panUpper(d.empresaBairro) || 'CENTRO',
      logradouro: panUpper(d.empresaLogradouro), numero: str(d.empresaNumero) || 'SN', ...(str(d.empresaComplemento) ? { complemento: panUpper(d.empresaComplemento) } : {}),
    })
  }
  dadosPostais.push({ tipo: 'CORRESPONDENCIA', ...home })

  const empresaNome = d.occupation === 'APOSENTADO_PENSIONISTA' ? 'INSS' : panUpper(d.empresaNome)
  const conjugeOk = estadoCivil === 'CASADO' && str(d.conjugeNome) && digits(d.conjugeCpf).length === 11

  return {
    usuario: str(creds.usuarioIntegracao).slice(0, 25),
    observacao: 'Proposta enviada pelo AutoDrive',
    informacoesBase: baseInfo(creds, op),
    cliente: {
      nome: panUpper(d.nomeCompleto).slice(0, 120),
      sexo,
      estadoCivil,
      codigoNacionalidade: nacionalidade,
      filiacao: { mae: panUpper(d.nomeMae), ...(str(d.nomePai) ? { pai: panUpper(d.nomePai) } : {}) },
      documentos: { rgIe: { numero: str(d.rg).toUpperCase().replace(/[^0-9X]/g, ''), uf: uf(d.rgUf), emissor: panUpper(d.rgOrgao), tipo: 'RG' } },
      naturalidade: { descricao: panUpper(d.naturalidade), uf: uf(d.naturalidadeUf) },
      ...(str(d.email) ? { contato: { email: str(d.email) } } : {}),
      telefones,
      dadosPostais,
      renda: {
        principal: {
          ...(profissao ? { profissao } : {}),
          ...(empresaNome ? { empresa: { nome: empresaNome.slice(0, 100), ...(digits(d.empresaCnpj).length === 14 ? { cnpj: fmtCnpj(d.empresaCnpj) } : {}) } } : {}),
        },
        // TODO homologação: "renda.extra" (tipo SALARIO_COMISSAO…) não tem domínio publicado — não enviamos.
      },
      ...(conjugeOk ? {
        conjuge: {
          nome: panUpper(d.conjugeNome), cpf: fmtCpf(d.conjugeCpf),
          ...(fmtDateTimeBr(d.conjugeDataNascimento) ? { dataNascimento: fmtDateTimeBr(d.conjugeDataNascimento) } : {}),
        },
      } : {}),
    },
  }
}

/** Placa, chassi, renavam e cor são obrigatórios no complemento do bem (PDF "Alterar dados do bem"). */
export function vehicleComplementPayload(terms: ProposalTerms, creds: Record<string, string>, op: PanOperator) {
  const v = vehicleOf(terms)
  const plate = str(v.plate).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return {
    informacoesBase: baseInfo(creds, op),
    observacao: 'Dados do veículo enviados pelo AutoDrive',
    usuario: str(creds.usuarioIntegracao).slice(0, 25),
    veiculo: {
      anoFabricacao: Number(v.year ?? v.modelYear),
      ...(str(v.chassi) ? { chassi: str(v.chassi).toUpperCase().replace(/\s+/g, '') } : {}),
      ...(str(v.color) ? { cor: panUpper(v.color).slice(0, 15) } : {}),
      motivoAgendamento: 'NAO_DEFINIDO',
      ...(plate.length === 7 ? { placa: plate, ufplaca: v.ufLic } : {}),
      ...(digits(v.renavam) ? { renavam: digits(v.renavam).padStart(11, '0') } : {}),
    },
  }
}

/** O que falta no estoque para o complemento do bem (0 km sem placa/renavam é normal). */
export function missingVehicleData(terms: ProposalTerms): string[] {
  const v = terms.vehicle ?? {}
  const miss: string[] = []
  if (!str(v.chassi)) miss.push('chassi')
  if (!str(v.color)) miss.push('cor')
  if (!v.zeroKm) {
    if (str(v.plate).replace(/[^A-Za-z0-9]/g, '').length !== 7) miss.push('placa')
    if (!digits(v.renavam)) miss.push('renavam')
  }
  return miss
}

// ── Consulta da proposta ─────────────────────────────────────────────────────
export interface PanProposal {
  dadosFinanciamento?: {
    valorFinanciado?: number; valorParcela?: number; valorEntrada?: number; quantidadeParcela?: number
    atividades?: { codigo?: number; descricao?: string; data?: string; situacao?: string }[]
  }
  dadosCadastrais?: { cpfCnpj?: string }
  dadosLiberacoes?: { dataLiberacao?: string; valor?: number }[]
  descricaoStatusFormalizacao?: string
  status?: string
  indicadorBloqueado?: boolean
}

export function decisionFromProposal(externalId: string, p: PanProposal): BankDecision {
  let status = panProposalStatus(p.status)
  const fin = p.dadosFinanciamento ?? {}
  const last = [...(fin.atividades ?? [])].filter((x) => str(x.descricao)).sort((x, y) => str(y.data).localeCompare(str(x.data)))[0]
  const parts = [
    str(p.status) ? `Situação no PAN: ${str(p.status).replace(/^\d+\s*\.\s*/, '')}` : null,
    last ? `${str(last.descricao)}${str(last.situacao) ? ` (${str(last.situacao)})` : ''}` : null,
    str(p.descricaoStatusFormalizacao) ? `Formalização: ${str(p.descricaoStatusFormalizacao)}` : null,
  ].filter(Boolean)
  if (p.indicadorBloqueado && !['RECUSADA', 'CANCELADA', 'EXPIRADA'].includes(status)) {
    status = 'PENDENTE'
    parts.unshift('Proposta bloqueada no PAN')
  }
  const reason = parts.join(' · ').slice(0, 280) || null
  const showOffer = status === 'APROVADA' || status === 'PRE_APROVADA' || status === 'EM_ANALISE' || status === 'PENDENTE'
  const offer: BankOffer | null = showOffer && (fin.valorParcela || fin.valorFinanciado) ? {
    approvedAmount: fin.valorFinanciado || null, downPayment: fin.valorEntrada ?? null, installments: fin.quantidadeParcela || null,
    installmentValue: fin.valorParcela || null,
    totalAmount: fin.valorParcela && fin.quantidadeParcela ? round2(fin.valorParcela * fin.quantidadeParcela) : null,
  } : null
  return {
    externalId, requestId: externalId, status,
    reason: status === 'RECUSADA' ? (reason ?? 'Recusada pela análise de crédito do PAN.') : reason,
    offer,
    ...(status === 'PENDENTE' ? { pendingItems: [{ key: 'PAN_PENDENCIA', label: reason ?? 'Pendência na proposta do PAN', kind: 'OUTRO' as const }] } : {}),
  }
}

/** Links da formalização digital: { linkOperador, linkCliente }. O do cliente é o que vai para assinatura. */
export function formalizationLink(r: unknown): string | null {
  if (!isObj(r)) return null
  const l = str(r.linkCliente) || str(r.linkOperador)
  return /^https:\/\//.test(l) ? l : null
}

// ── Conector ─────────────────────────────────────────────────────────────────
interface PanStore { codigoLoja?: string; cnpjLoja?: string; produtos?: { codigoProduto?: string; descricaoProduto?: string; categoriaProduto?: string }[] }
interface PanOperators { operadores?: { codigoOperador?: string; nomeOperador?: string; cpfOperador?: string }[] }

/**
 * Produto da loja para pessoa física na categoria. Produtos publicados: 100001 LEVES PF
 * MULTIMARCA, 100002 LEVES PJ MULTIMARCA, 112001 LEVES PF REVENDAS, 112002 LEVES PJ
 * REVENDAS, 200001 MOTOS PF, 200002 MOTOS PJ. Havendo multimarca e revendas, fica o
 * multimarca (o do exemplo do PAN); a loja pode fixar outro na credencial.
 */
export function pickProduct(stores: PanStore[], idLoja: string, categoria: 'LEVES' | 'MOTOS'): string | null {
  const list = Array.isArray(stores) ? stores : []
  const store = list.find((s) => str(s.codigoLoja) === idLoja) ?? (list.length === 1 ? list[0] : undefined)
  const cat = panNorm(panCatalogCategory(categoria))
  const prods = (store?.produtos ?? []).filter((p) => str(p.codigoProduto) && panNorm(p.categoriaProduto) === cat && !/\bPJ\b/.test(panNorm(p.descricaoProduto)))
  if (prods.length <= 1) return prods[0] ? str(prods[0].codigoProduto) : null
  const multi = prods.filter((p) => panNorm(p.descricaoProduto).includes('MULTIMARCA'))
  return multi.length === 1 ? str(multi[0].codigoProduto) : null
}

/** Operador: o da credencial, o que tem o CPF do agente certificado, ou o primeiro habilitado. */
export function pickOperator(list: PanOperators, creds: Record<string, string>): PanOperator | null {
  const ops = (list.operadores ?? []).filter((o) => str(o.codigoOperador))
  const want = str(creds.codigoOperador)
  const cpf = digits(creds.cpfAgenteCertificado)
  const o = (want ? ops.find((x) => str(x.codigoOperador) === want) : undefined)
    ?? (cpf ? ops.find((x) => digits(x.cpfOperador) === cpf) : undefined)
    ?? (want ? undefined : ops[0])
  if (o) return { codigo: str(o.codigoOperador), nome: str(o.nomeOperador) }
  return want ? { codigo: want, nome: '' } : null
}

export class PanAdapter extends NotIntegratedBank {
  readonly key = 'pan'
  readonly name = 'Banco PAN'
  readonly official = true
  readonly capabilities: BankCapabilities = {
    simulate: false, preAnalyze: true, submit: true, update: false, status: true, documents: false,
    formalize: true, contract: false, funding: false, cancel: false, webhook: false,
  }
  protected readonly credentialFields = ['apiKey', 'secretKey', 'usuarioIntegracao', 'senhaIntegracao', 'idLoja', 'cnpjLoja', 'cpfAgenteCertificado']

  /** Campos da ficha que a simulação + complemento do PAN usam (pessoa física). */
  getRequiredFields(): string[] {
    return ['cpf', 'nomeCompleto', 'dataNascimento', 'sexo', 'estadoCivil', 'nacionalidade', 'naturalidade', 'naturalidadeUf', 'nomeMae', 'rg', 'rgOrgao', 'rgUf',
      'celular', 'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado', 'occupation', 'profissao', 'renda']
  }

  private async product(ctx: BankContext, categoria: 'LEVES' | 'MOTOS'): Promise<string> {
    if (str(ctx.credentials.codigoProduto)) return str(ctx.credentials.codigoProduto)
    const cnpj = digits(ctx.credentials.cnpjLoja)
    if (cnpj.length !== 14) throw credError('Informe o CNPJ da loja (ou o código do produto) na credencial do PAN.')
    const stores = await panRequest<PanStore[]>(ctx, { method: 'GET', path: '/veiculos/v0/lojas', query: { cnpj: fmtCnpj(cnpj) } })
    const p = pickProduct(stores, idLojaOf(ctx.credentials), categoria)
    if (!p) throw credError(`O PAN não devolveu um produto de ${categoria === 'MOTOS' ? 'motos' : 'leves'} PF para a loja. Informe o código do produto na credencial do PAN.`)
    return p
  }

  /** Código Molicar: marcas → modelos → versões (por ano modelo e UF). */
  private async molicar(ctx: BankContext, terms: ProposalTerms): Promise<PanMolicarVersion> {
    const v = vehicleOf(terms)
    const cat = panCatalogCategory(v.categoria)
    const brands = await panRequest<string[]>(ctx, { method: 'GET', path: '/veiculos/v0/veiculos/marcas', query: { categoriaVeiculo: cat } })
    const brand = panMatchBrand(Array.isArray(brands) ? brands : [], v.brand)
    if (!brand) throw reject(`A marca "${str(v.brand)}" não existe na tabela do PAN. Confira a marca do veículo no estoque.`)
    const models = await panRequest<string[]>(ctx, { method: 'GET', path: '/veiculos/v0/veiculos/modelos', query: { descricaoCategoria: cat, nomeMarca: brand } })
    const candidates = panMatchModels(Array.isArray(models) ? models : [], v.model)
    if (!candidates.length) throw reject(`O modelo "${str(v.model)}" não existe na tabela do PAN para ${brand}. Confira o modelo do veículo no estoque.`)
    const versions: PanMolicarVersion[] = []
    for (const m of candidates) {
      try {
        const list = await panRequest<PanMolicarVersion[]>(ctx, {
          method: 'GET', path: '/veiculos/v0/veiculos/versoes',
          query: { descricaoCategoria: cat, nomeMarca: brand, descricaoModelo: m, anoModelo: String(v.modelYear), ufLicenciamento: v.ufLic },
        })
        if (Array.isArray(list)) versions.push(...list)
      } catch (e) {
        if (!(e instanceof BankGatewayError && e.code === 'REJEITADO')) throw e
      }
      if (versions.length) break
    }
    const pick = panPickVersion(versions, v, v.fipeValue ?? v.vehicleValue)
    if (!pick?.codigoMolicar) throw reject(`O PAN não tem versão de ${brand} ${str(v.model)} ${v.modelYear} na tabela Molicar.`)
    return pick
  }

  private async operator(ctx: BankContext): Promise<PanOperator> {
    const list = await panRequest<PanOperators>(ctx, { method: 'GET', path: `/openapi/veiculos/v1/lojas/${enc(idLojaOf(ctx.credentials))}/operadores` })
    const op = pickOperator(list ?? {}, ctx.credentials)
    if (!op) throw credError('Nenhum operador habilitado para a loja no PAN.')
    return op
  }

  private async profession(a: ApplicantPayload, ctx: BankContext): Promise<{ codigo: string; nome: string } | null> {
    const natureza = panOccupationNature(a.data.occupation)
    if (!natureza) return null
    const list = await panRequest<{ codigoDaProfissao?: string; descricao?: string }[]>(ctx, { method: 'GET', path: '/openapi/veiculos/v1/propostas/profissoes', query: { codigo: natureza } })
    return panMatchProfession(Array.isArray(list) ? list : [], a.data.profissao)
  }

  async preAnalyze(a: ApplicantPayload, terms: ProposalTerms, ctx: BankContext): Promise<BankDecision> {
    const { path, query } = preAnalysisRequest(a, terms, ctx.credentials)
    try {
      return decisionFromPreAnalysis(await panRequest<PanPreAnalysis>(ctx, { method: 'GET', path, query }) ?? {})
    } catch (e) {
      // "Farol não localizado" vem como erro (Farol Preto = sistema indisponível).
      if (e instanceof BankGatewayError && e.code === 'REJEITADO' && /farol/i.test(e.message)) {
        throw new BankGatewayError('A pré-análise do PAN não encontrou o farol do cliente agora. Tente de novo em alguns minutos.', 'INDISPONIVEL')
      }
      throw e
    }
  }

  async submitProposal(a: ApplicantPayload, terms: ProposalTerms, ctx: BankContext): Promise<BankDecision> {
    // Valida tudo o que dá ANTES de qualquer chamada (erro aqui = nada saiu daqui).
    // A simulação já consulta o Crivo; a pré-análise fica como etapa separada.
    const v = vehicleOf(terms)
    cpfOf(a)
    if (digits(ctx.credentials.cpfAgenteCertificado).length !== 11) throw credError('Falta o CPF do agente certificado da loja na credencial do PAN.')
    clientComplementPayload(a, ctx.credentials, { codigo: '0', nome: '' }, null)
    const missingBem = missingVehicleData(terms)
    if (missingBem.length) throw reject(`Para enviar ao PAN, complete no estoque o veículo: ${missingBem.join(', ')}.`)

    const codigoProduto = await this.product(ctx, v.categoria)
    const version = await this.molicar(ctx, terms)
    const sim = await panRequest<PanSimulation>(ctx, {
      method: 'POST', path: '/openapi/veiculos/v1/simulacao', idempotent: true,
      body: simulationPayload(a, terms, ctx.credentials, codigoProduto, String(version.codigoMolicar)),
    }) ?? {}
    const option = pickSimOption(sim, terms.installments)
    if (!option) {
      const prazos = [...new Set((sim.simulacoes ?? []).filter(validOption).map((o) => o.prazo!))].sort((x, y) => x - y)
      return { status: 'RECUSADA', reason: prazos.length ? `O PAN não ofereceu condição para ${terms.installments} parcelas. Prazos disponíveis: ${prazos.join(', ')}. Ajuste e envie de novo.` : 'O PAN não devolveu condição de financiamento para esta simulação.' }
    }
    const refusal = simOptionRefusal(option, terms.downPayment)
    if (refusal) return { status: 'RECUSADA', reason: refusal, offer: offerFromSimOption(option, terms) }

    const op = await this.operator(ctx)
    const profissao = await this.profession(a, ctx)

    // gravarSimulacao CRIA a proposta: falha de rede após o envio vira "verificar".
    const rec = recordSimulationPayload(sim, option, { codigoProduto, codigoOperador: op.codigo, cpfCertificado: ctx.credentials.cpfAgenteCertificado }, terms)
    const created = parseRecordResult(await panRequest<PanRecordResult>(ctx, { method: 'POST', path: '/openapi/veiculos/v0/gravarSimulacao', body: rec, idempotent: false }))
    if (created.erro && !created.numero) throw reject(`O PAN não gravou a proposta: ${created.erro}`)
    const n = created.numero
    if (!n) throw new BankGatewayError('O PAN não devolveu o número da proposta.', 'INDISPONIVEL', 'TALVEZ')
    const offer = offerFromSimOption(option, terms)
    const vehicleNote = `Veículo no PAN: ${financedVehicle(sim) || str(version.descricaoVersao)} (Molicar ${version.codigoMolicar}).`

    // Daqui em diante a proposta EXISTE no PAN: nunca perder o número.
    const path = `/openapi/veiculos/v0/propostas/${enc(n)}`
    const steps: [string, unknown][] = [
      ['dados do cliente', clientComplementPayload(a, ctx.credentials, op, profissao)],
      ['dados do veículo', vehicleComplementPayload(terms, ctx.credentials, op)],
    ]
    for (const [label, body] of steps) {
      try {
        await panRequest(ctx, { method: 'POST', path, body, idempotent: true })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'erro'
        return {
          externalId: n, requestId: n, status: 'PENDENTE', offer,
          reason: `Proposta ${n} criada no PAN, mas o envio dos ${label} falhou: ${msg} Complete no NPV/go!PAN. ${vehicleNote}`.slice(0, 500),
          pendingItems: [{ key: 'PAN_COMPLEMENTO', label: `Completar ${label} no PAN`, kind: 'OUTRO' }],
        }
      }
    }
    return { externalId: n, requestId: n, status: 'EM_ANALISE', reason: `Proposta PAN ${n}. Aguardando análise do banco. ${vehicleNote}`, offer }
  }

  async getStatus(externalId: string, ctx: BankContext): Promise<BankDecision> {
    const p = await panRequest<PanProposal>(ctx, { method: 'GET', path: `/openapi/veiculos/v1/propostas/${enc(externalId)}` })
    return decisionFromProposal(externalId, p ?? {})
  }

  /** O PAN não busca proposta por chave nossa: sem número, só conferindo no NPV/go!PAN. */
  async findByIdempotencyKey(): Promise<BankDecision | null> {
    throw new BankGatewayError('O PAN não permite localizar a proposta sem o número. Confira no NPV/go!PAN e registre a resposta.', 'NAO_SUPORTADO')
  }

  /** Links de formalização digital (documentos + assinatura do cliente). */
  async formalize(externalId: string, ctx: BankContext): Promise<ContractInfo> {
    const p = await panRequest<PanProposal>(ctx, { method: 'GET', path: `/openapi/veiculos/v1/propostas/${enc(externalId)}` })
    const cpf = digits(p?.dadosCadastrais?.cpfCnpj)
    if (cpf.length !== 11) throw reject('O PAN não devolveu o CPF do cliente desta proposta.')
    const links = await panRequest(ctx, { method: 'GET', path: `/veiculos/v0/formalizador/${enc(idLojaOf(ctx.credentials))}/${cpf}/${enc(externalId)}/links` })
    const url = formalizationLink(links)
    if (!url) throw reject('O PAN ainda não liberou os links de formalização desta proposta.')
    return { contractNumber: externalId, documentUrl: url, signed: false }
  }

  /** Login da integração + leitura dos operadores da loja (valida o idLoja, sem dado de cliente). */
  async testConnection(ctx: BankContext): Promise<void> {
    await panPing(ctx)
    await this.operator(ctx)
  }
}
