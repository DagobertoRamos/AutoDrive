// =============================================================================
// Banco PAN — conector OFICIAL da OpenAPI Veículos (developers.bancopan.com.br,
// "Financiamento de Veículos", versão 2.0 / março de 2023). Credenciais DA LOJA
// (BYOC): ApiKey + SecretKey + usuário/senha de integração (NPV) + código da loja.
//
// Jornada:
//   pré-análise (farol do Crivo, por CPF) → simulação (identificadorSimulacao +
//   condições por prazo) → gravarSimulacao (gera o número da proposta) →
//   complemento do cliente → complemento do bem. O andamento é CONSULTADO em
//   GET /propostas/{n} (o PAN não publica webhook nem cancelamento por API).
//
// A documentação do PAN é HTML com exemplos e sem schema de resposta para a
// simulação e o gravarSimulacao. O que ela não diz está marcado como TODO e é
// lido de forma tolerante (pelos nomes que o próprio PAN usa no pedido seguinte).
//
// Os montadores de payload são puros e exportados (testados em pan.test.ts).
// =============================================================================

import { NotIntegratedBank } from './base'
import { splitPhone } from './bv'
import { panPing, panRequest } from './pan-http'
import {
  panCategory, panFarol, panMaritalStatus, panMatchProfession, panNationalityCode, panNorm, panOccupationNature,
  panParsePreApproved, panProposalStatus, panSex, panUpper,
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

const reject = (msg: string) => new BankGatewayError(msg, 'REJEITADO', 'NAO')
const credError = (msg: string) => new BankGatewayError(msg, 'CREDENCIAL')

/** "12345678909" → "123.456.789-09" (formato dos exemplos do PAN). */
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
  // TODO homologação: a documentação não diz se codigoVeiculo aceita o código FIPE
  // ou só o código do PAN (consulta de marcas/modelos/versões). Enviamos o FIPE.
  if (!v.fipeCode) throw reject('Vincule à ficha um veículo do estoque com código FIPE para enviar ao PAN.')
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

/**
 * GET /openapi/veiculos/v0/lojas/{idLoja}/preanalise
 * TODO homologação: a documentação traz o caminho com e sem "/openapi" e o
 * parâmetro como "cpf" (URL) e "cpfCliente" (tabela). Seguimos o título e a URL.
 */
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
export function simulationPayload(a: ApplicantPayload, terms: ProposalTerms, creds: Record<string, string>, codigoProduto: string) {
  const v = vehicleOf(terms)
  const d = a.data
  const cpf = cpfOf(a)
  const birth = str(d.dataNascimento).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) throw reject('Falta a data de nascimento do cliente.')
  const cel = splitPhone(d.celular)
  if (!cel) throw reject('Informe um celular válido do cliente (com DDD).')
  const natureza = panOccupationNature(d.occupation)
  const renda = num(d.renda)
  return {
    dadosBasicos: {
      // TODO homologação: domínio de tipoIdLoja não documentado — vai só se a loja informar.
      ...(str(creds.tipoIdLoja) ? { tipoIdLoja: str(creds.tipoIdLoja) } : {}),
      idLoja: idLojaOf(creds),
      codigoProduto,
    },
    dadosCliente: {
      cpf,
      dataNascimento: birth,
      ddd: cel.ddd,
      celular: cel.number,
      ...(natureza ? { codigoNaturezaOcupacao: natureza } : {}),
      renda: renda && renda > 0 ? renda : 0,
      rendaComplementar: sumValues(d.outrasRendas),
      taxistaPne: false,
    },
    dadosVeiculos: [{
      // TODO homologação: o exemplo não diz o domínio de "categoria"; usamos o da pré-análise (LEVES/MOTOS).
      categoria: v.categoria,
      codigoVeiculo: str(v.fipeCode),
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
      // TODO homologação: "tipoCalculo" existe no exemplo, mas o domínio não é publicado.
      valorEntrada: terms.downPayment ?? 0,
      prazos: [{}],
    },
  }
}

export interface PanSimOption {
  prazo: number
  valorParcela: number | null
  valorEntrada: number | null
  valorFinanciado: number | null
  taxaMensal: number | null
  cetMensal: number | null
  cetAnual: number | null
  tabela: { codigo: string; carencia: number | null; condicao: string; plusComissao: unknown } | null
  despesas: unknown[]
  idPacoteSeguros: unknown
}
export interface PanSimulation { identificadorSimulacao: string | null; options: PanSimOption[] }

function tableFrom(o: Record<string, unknown>): PanSimOption['tabela'] {
  if (o.codigo == null || (o.condicao == null && o.carencia == null)) return null
  return { codigo: str(o.codigo), carencia: num(o.carencia), condicao: str(o.condicao), plusComissao: o.plusComissao ?? null }
}

/**
 * Lê a resposta da simulação. TODO homologação: o PAN não publica o schema de
 * resposta. Procuramos, em qualquer nível, "identificadorSimulacao" e os objetos
 * com "prazo" + "valorParcela" (os mesmos nomes que o gravarSimulacao pede), com a
 * tabela ("codigo"/"carencia"/"condicao") e as despesas do próprio item ou do pai.
 */
export function parseSimulation(body: unknown): PanSimulation {
  let ident: string | null = null
  const options: PanSimOption[] = []
  const walk = (node: unknown, table: PanSimOption['tabela'], despesas: unknown[] | null, pacote: unknown) => {
    if (Array.isArray(node)) { for (const x of node) walk(x, table, despesas, pacote); return }
    if (!isObj(node)) return
    if (!ident && (typeof node.identificadorSimulacao === 'string' || typeof node.identificadorSimulacao === 'number')) ident = String(node.identificadorSimulacao)
    const ownTable = (isObj(node.tabelaCalculada) ? tableFrom(node.tabelaCalculada) : null) ?? (isObj(node.tabela) ? tableFrom(node.tabela) : null) ?? tableFrom(node)
    const ownDespesas = Array.isArray(node.despesasSelecionadas) ? node.despesasSelecionadas : Array.isArray(node.despesas) ? node.despesas : null
    const t = ownTable ?? table
    const ds = ownDespesas ?? despesas
    const pk = node.idPacoteSeguros !== undefined ? node.idPacoteSeguros : pacote
    const prazo = num(node.prazo)
    if (prazo && prazo > 0 && node.valorParcela !== undefined) {
      options.push({
        prazo, valorParcela: num(node.valorParcela), valorEntrada: num(node.valorEntrada), valorFinanciado: num(node.valorFinanciado),
        taxaMensal: num(node.taxaMensal), cetMensal: num(node.cetMensal), cetAnual: num(node.cetAnual),
        tabela: t, despesas: ds ?? [], idPacoteSeguros: pk ?? null,
      })
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'tabelaCalculada' || k === 'despesas' || k === 'despesasSelecionadas') continue
      if (v && typeof v === 'object') walk(v, t, ds, pk)
    }
  }
  walk(body, null, null, undefined)
  return { identificadorSimulacao: ident, options }
}

/** Condição do prazo pedido. Não troca o prazo do cliente sozinho. */
export function pickSimOption(sim: PanSimulation, requested: number | null | undefined): PanSimOption | null {
  const valid = sim.options.filter((o) => o.valorParcela && o.valorParcela > 0)
  if (requested) return valid.find((o) => o.prazo === requested) ?? null
  return valid.sort((x, y) => y.prazo - x.prazo)[0] ?? null
}

export function offerFromSimOption(o: PanSimOption, terms: ProposalTerms): BankOffer {
  return {
    approvedAmount: o.valorFinanciado ?? (terms.vehicleValue != null ? round2(terms.vehicleValue - (o.valorEntrada ?? terms.downPayment ?? 0)) : null),
    downPayment: o.valorEntrada ?? terms.downPayment ?? null,
    installments: o.prazo,
    installmentValue: o.valorParcela,
    rateMonthly: o.taxaMensal, cetMonthly: o.cetMensal, cetYearly: o.cetAnual,
    totalAmount: o.valorParcela ? round2(o.valorParcela * o.prazo) : null,
  }
}

// ── Gravar simulação (gera a proposta) ──────────────────────────────────────
export function recordSimulationPayload(sim: PanSimulation, option: PanSimOption, opts: { codigoProduto: string; codigoOperador: string; cpfCertificado: string }, terms: ProposalTerms) {
  if (!sim.identificadorSimulacao) throw reject('O PAN não devolveu o identificador da simulação.')
  if (!option.tabela?.codigo) throw reject('O PAN não devolveu a tabela calculada para o prazo escolhido.')
  const cpfCert = digits(opts.cpfCertificado)
  if (cpfCert.length !== 11) throw credError('Falta o CPF do agente certificado da loja na credencial do PAN.')
  return {
    dadosBasicos: {
      codigoOperador: opts.codigoOperador,
      cpfCertificado: cpfCert,
      codigoProduto: opts.codigoProduto,
      identificadorSimulacao: sim.identificadorSimulacao,
    },
    dadosSimulacao: {
      prazo: option.prazo,
      valorParcela: option.valorParcela,
      valorEntrada: option.valorEntrada ?? terms.downPayment ?? 0,
      idPacoteSeguros: option.idPacoteSeguros ?? null,
      tabelaCalculada: {
        codigo: option.tabela.codigo,
        carencia: option.tabela.carencia,
        condicao: option.tabela.condicao,
        plusComissao: isObj(option.tabela.plusComissao) ? option.tabela.plusComissao : { taxa: null, descricao: null },
      },
      despesasSelecionadas: option.despesas,
      // TODO homologação: "codigoAutorizacaoTC" aparece no exemplo sem descrição — não enviamos.
    },
  }
}

/** TODO homologação: o schema de resposta do gravarSimulacao não é publicado; buscamos "numeroProposta". */
export function parseProposalNumber(body: unknown): string | null {
  if (typeof body === 'number' || (typeof body === 'string' && /^\d+$/.test(body.trim()))) return String(body).trim()
  let found: string | null = null
  const walk = (n: unknown) => {
    if (found) return
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (!isObj(n)) return
    const v = n.numeroProposta
    if ((typeof v === 'string' && v.trim()) || typeof v === 'number') { found = String(v).trim(); return }
    Object.values(n).forEach(walk)
  }
  walk(body)
  return found
}

// ── Complementos da proposta ─────────────────────────────────────────────────
export interface PanOperator { codigo: string; nome: string }
const baseInfo = (creds: Record<string, string>, op: PanOperator) => ({
  cpfAgenteCertificado: digits(creds.cpfAgenteCertificado),
  operador: { codigo: op.codigo, nome: op.nome },
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
    usuario: str(creds.usuarioIntegracao),
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
        // TODO homologação: "renda.extra" (tipo/natureza/remuneração) exige domínios não publicados — não enviamos.
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

export function vehicleComplementPayload(terms: ProposalTerms, creds: Record<string, string>, op: PanOperator) {
  const v = vehicleOf(terms)
  const plate = str(v.plate).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return {
    informacoesBase: baseInfo(creds, op),
    observacao: 'Dados do veículo enviados pelo AutoDrive',
    usuario: str(creds.usuarioIntegracao),
    veiculo: {
      anoFabricacao: Number(v.year ?? v.modelYear),
      ...(str(v.chassi) ? { chassi: str(v.chassi).toUpperCase() } : {}),
      ...(str(v.color) ? { cor: panUpper(v.color) } : {}),
      // Documentado só "NAO_DEFINIDO" (exemplo).
      motivoAgendamento: 'NAO_DEFINIDO',
      ...(plate && !v.zeroKm ? { placa: plate, ufplaca: v.ufLic } : {}),
      ...(digits(v.renavam) ? { renavam: digits(v.renavam) } : {}),
    },
  }
}

// ── Consulta da proposta ─────────────────────────────────────────────────────
export interface PanProposal {
  dadosFinanciamento?: {
    valorFinanciado?: number; valorParcela?: number; valorEntrada?: number; quantidadeParcela?: number
    atividades?: { codigo?: number; descricao?: string; data?: string; situacao?: string }[]
  }
  dadosCadastrais?: { cpfCnpj?: string }
  descricaoStatusFormalizacao?: string
  status?: string
  indicadorBloqueado?: boolean
}

export function decisionFromProposal(externalId: string, p: PanProposal): BankDecision {
  let status = panProposalStatus(p.status)
  const fin = p.dadosFinanciamento ?? {}
  const last = [...(fin.atividades ?? [])].filter((x) => str(x.descricao)).sort((x, y) => str(y.data).localeCompare(str(x.data)))[0]
  const parts = [
    str(p.status) ? `Situação no PAN: ${str(p.status)}` : null,
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

/** Primeiro link https da resposta de formalização. TODO homologação: schema não publicado. */
export function firstLink(body: unknown): string | null {
  if (typeof body === 'string') return /^https:\/\//.test(body.trim()) ? body.trim() : null
  if (Array.isArray(body)) { for (const x of body) { const l = firstLink(x); if (l) return l } return null }
  if (isObj(body)) { for (const v of Object.values(body)) { const l = firstLink(v); if (l) return l } }
  return null
}

// ── Conector ─────────────────────────────────────────────────────────────────
interface PanStore { codigoLoja?: string; cnpjLoja?: string; produtos?: { codigoProduto?: string; descricaoProduto?: string; categoriaProduto?: string }[] }
interface PanOperators { operadores?: { codigoOperador?: string; nomeOperador?: string; cpfOperador?: string }[] }

/** Produto da loja: o da credencial ou o único/compatível devolvido pelo PAN para o CNPJ. */
export function pickProduct(stores: PanStore[], idLoja: string, categoria: 'LEVES' | 'MOTOS'): string | null {
  const list = Array.isArray(stores) ? stores : []
  const store = list.find((s) => str(s.codigoLoja) === idLoja) ?? (list.length === 1 ? list[0] : undefined)
  const prods = (store?.produtos ?? []).filter((p) => str(p.codigoProduto))
  if (prods.length === 1) return str(prods[0].codigoProduto)
  const wantMoto = categoria === 'MOTOS'
  const match = prods.filter((p) => panNorm(`${p.categoriaProduto} ${p.descricaoProduto}`).includes('MOTO') === wantMoto)
  return match.length === 1 ? str(match[0].codigoProduto) : null
}

/** Operador: o da credencial, o que tem o CPF do agente certificado, ou o primeiro habilitado. */
export function pickOperator(list: PanOperators, creds: Record<string, string>): PanOperator | null {
  const ops = (list.operadores ?? []).filter((o) => str(o.codigoOperador))
  const want = str(creds.codigoOperador)
  const cpf = digits(creds.cpfAgenteCertificado)
  const o = (want ? ops.find((x) => str(x.codigoOperador) === want) : undefined)
    ?? (cpf ? ops.find((x) => digits(x.cpfOperador) === cpf) : undefined)
    ?? (want ? undefined : ops[0])
  if (o) return { codigo: str(o.codigoOperador), nome: panUpper(o.nomeOperador) }
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
    if (!p) throw credError('O PAN devolveu mais de um produto para a loja. Informe o código do produto na credencial do PAN.')
    return p
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
    return decisionFromPreAnalysis(await panRequest<PanPreAnalysis>(ctx, { method: 'GET', path, query }) ?? {})
  }

  async submitProposal(a: ApplicantPayload, terms: ProposalTerms, ctx: BankContext): Promise<BankDecision> {
    // Valida tudo o que dá ANTES de qualquer chamada (erro aqui = nada saiu daqui).
    // A simulação já consulta o Crivo; a pré-análise fica como etapa separada.
    const v = vehicleOf(terms)
    cpfOf(a)
    if (digits(ctx.credentials.cpfAgenteCertificado).length !== 11) throw credError('Falta o CPF do agente certificado da loja na credencial do PAN.')
    clientComplementPayload(a, ctx.credentials, { codigo: '0', nome: '' }, null)

    const codigoProduto = await this.product(ctx, v.categoria)
    const sim = parseSimulation(await panRequest(ctx, { method: 'POST', path: '/openapi/veiculos/v1/simulacao', body: simulationPayload(a, terms, ctx.credentials, codigoProduto), idempotent: true }))
    const option = pickSimOption(sim, terms.installments)
    if (!option) {
      const prazos = [...new Set(sim.options.map((o) => o.prazo))].sort((x, y) => x - y)
      return { status: 'RECUSADA', reason: prazos.length ? `O PAN não ofereceu condição para ${terms.installments} parcelas. Prazos disponíveis: ${prazos.join(', ')}. Ajuste e envie de novo.` : 'O PAN não devolveu condição de financiamento para esta simulação.' }
    }
    const op = await this.operator(ctx)
    const profissao = await this.profession(a, ctx)

    // gravarSimulacao CRIA a proposta: falha de rede após o envio vira "verificar".
    const rec = recordSimulationPayload(sim, option, { codigoProduto, codigoOperador: op.codigo, cpfCertificado: ctx.credentials.cpfAgenteCertificado }, terms)
    const created = await panRequest(ctx, { method: 'POST', path: '/openapi/veiculos/v0/gravarSimulacao', body: rec, idempotent: false })
    const n = parseProposalNumber(created)
    if (!n) throw new BankGatewayError('O PAN não devolveu o número da proposta.', 'INDISPONIVEL', 'TALVEZ')
    const offer = offerFromSimOption(option, terms)

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
          reason: `Proposta ${n} criada no PAN, mas o envio dos ${label} falhou: ${msg} Complete no NPV/go!PAN.`,
          pendingItems: [{ key: 'PAN_COMPLEMENTO', label: `Completar ${label} no PAN`, kind: 'OUTRO' }],
        }
      }
    }
    return { externalId: n, requestId: n, status: 'EM_ANALISE', reason: `Proposta PAN ${n}. Aguardando análise do banco.`, offer }
  }

  async getStatus(externalId: string, ctx: BankContext): Promise<BankDecision> {
    const p = await panRequest<PanProposal>(ctx, { method: 'GET', path: `/openapi/veiculos/v1/propostas/${enc(externalId)}` })
    return decisionFromProposal(externalId, p ?? {})
  }

  /** O PAN não busca proposta por chave nossa: sem número, só conferindo no NPV/go!PAN. */
  async findByIdempotencyKey(): Promise<BankDecision | null> {
    throw new BankGatewayError('O PAN não permite localizar a proposta sem o número. Confira no NPV/go!PAN e registre a resposta.', 'NAO_SUPORTADO')
  }

  /** Links de formalização digital (documentos + assinatura). */
  async formalize(externalId: string, ctx: BankContext): Promise<ContractInfo> {
    const p = await panRequest<PanProposal>(ctx, { method: 'GET', path: `/openapi/veiculos/v1/propostas/${enc(externalId)}` })
    const cpf = digits(p?.dadosCadastrais?.cpfCnpj)
    if (cpf.length !== 11) throw reject('O PAN não devolveu o CPF do cliente desta proposta.')
    const links = await panRequest(ctx, { method: 'GET', path: `/veiculos/v0/formalizador/${enc(idLojaOf(ctx.credentials))}/${cpf}/${enc(externalId)}/links` })
    const url = firstLink(links)
    if (!url) throw reject('O PAN ainda não liberou os links de formalização desta proposta.')
    return { contractNumber: externalId, documentUrl: url, signed: false }
  }

  /** Login da integração + leitura dos operadores da loja (valida o idLoja, sem dado de cliente). */
  async testConnection(ctx: BankContext): Promise<void> {
    await panPing(ctx)
    await this.operator(ctx)
  }
}
