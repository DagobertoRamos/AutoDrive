// =============================================================================
// Banco PAN — códigos da OpenAPI Veículos e o de-para a partir da ficha
// universal. Fonte: portal developers.bancopan.com.br + pacote "Documentação v4"
// (PDFs de campos e JSONs de exemplo). PURO (sem I/O) — testado em pan.test.ts.
// O que o PAN não publica está marcado como TODO (validar na homologação).
// =============================================================================

import type { AttemptStatus } from '../status-core'

export const panNorm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Texto em maiúsculas, sem acento (o PAN usa assim nos exemplos). */
export const panUpper = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

/** Categoria da pré-análise e da simulação (enum documentado: "LEVES" | "MOTOS"). */
export function panCategory(cat: 'AUTOMOVEL' | 'MOTO' | 'PESADO' | null | undefined): 'LEVES' | 'MOTOS' | null {
  if (!cat || cat === 'AUTOMOVEL') return 'LEVES'
  if (cat === 'MOTO') return 'MOTOS'
  return null
}

/** Categoria das tabelas de marcas/modelos/versões e dos produtos (enum: "Automoveis" | "Motocicletas"). */
export const panCatalogCategory = (c: 'LEVES' | 'MOTOS') => (c === 'MOTOS' ? 'Motocicletas' : 'Automoveis')

/** Sexo (cliente.sexo). Documentado: "FEMININO"; "MASCULINO" por simetria — TODO confirmar. */
export function panSex(v: unknown): 'MASCULINO' | 'FEMININO' | null {
  const s = panNorm(v)
  if (s === 'M' || s.startsWith('MASC')) return 'MASCULINO'
  if (s === 'F' || s.startsWith('FEM')) return 'FEMININO'
  return null
}

/**
 * Estado civil (cliente.estadoCivil). Documentado só "CASADO".
 * TODO homologação: confirmar o domínio (SOLTEIRO, DIVORCIADO, VIUVO, SEPARADO, UNIAO_ESTAVEL?).
 */
export function panMaritalStatus(v: unknown): string | null {
  const s = panNorm(v)
  if (!s) return null
  if (s.includes('UNIAO ESTAVEL') || s.includes('AMASIAD') || s.includes('CONVIVENTE') || s.startsWith('CASAD')) return 'CASADO'
  if (s.startsWith('SOLTEIR')) return 'SOLTEIRO'
  if (s.startsWith('DIVORCIAD')) return 'DIVORCIADO'
  if (s.startsWith('SEPARAD') || s.startsWith('DESQUITAD')) return 'SEPARADO'
  if (s.startsWith('VIUV')) return 'VIUVO'
  return null
}

/**
 * Nacionalidade (cliente.codigoNacionalidade). Os exemplos trazem "01" (envio) e "02"
 * (consulta), sem legenda. TODO homologação: confirmar que 01 = brasileira.
 */
export function panNationalityCode(v: unknown): string | null {
  const s = panNorm(v)
  if (!s || s.startsWith('BRASIL')) return '01'
  return null
}

/**
 * Natureza da ocupação (dadosCliente.codigoNaturezaOcupacao), tabela publicada em
 * GET /veiculos/v0/naturezas-ocupacao: 01 aposentado/pensionista, 02 autônomo,
 * 04 empregado setor privado, 06 funcionário público, 07 militar, 08 profissional
 * liberal, 09 proprietário de empresa, 10 rendimentos de capital, 11 sem rendimento,
 * 12 setor rural, 13 geral (não utilizar). A ficha une CLT e servidor: vai 04.
 */
export const PAN_OCCUPATION_NATURE: Record<string, string> = { CLT: '04', AUTONOMO: '02', EMPRESARIO: '09', APOSENTADO_PENSIONISTA: '01' }
export const panOccupationNature = (occupation: unknown): string | null => PAN_OCCUPATION_NATURE[String(occupation ?? '')] ?? null

/** Profissão: casa o nome da ficha com a lista do PAN (GET /propostas/profissoes). */
export function panMatchProfession(list: { codigoDaProfissao?: string; descricao?: string }[], name: unknown): { codigo: string; nome: string } | null {
  const want = panNorm(name)
  const items = list.filter((p) => p.codigoDaProfissao && p.descricao)
  const hit = (want && (items.find((p) => panNorm(p.descricao) === want) ?? items.find((p) => panNorm(p.descricao).startsWith(want) || want.startsWith(panNorm(p.descricao)))))
    || items.find((p) => panNorm(p.descricao) === 'OUTRAS')
  return hit ? { codigo: String(hit.codigoDaProfissao), nome: String(hit.descricao) } : null
}

/** Farol do Crivo. Exemplos: codigo 2 = Pré-Aprovado, 3 = Elegivel, 4 = Não Elegivel; farol não localizado vem como erro. */
export type PanFarol = 'PRE_APROVADO' | 'ELEGIVEL' | 'NAO_ELEGIVEL' | 'INDISPONIVEL' | 'DESCONHECIDO'
export function panFarol(codigo: unknown, descricao: unknown): PanFarol {
  const d = panNorm(descricao)
  if (d.includes('PRE APROVAD') || d === 'PA OK' || d.includes('AZUL')) return 'PRE_APROVADO'
  if (d.includes('NAO ELEGIVEL') || d.includes('NEGADO') || d.includes('VERMELHO')) return 'NAO_ELEGIVEL'
  if (d.includes('INDISPONIVEL') || d === 'ERRO' || d.includes('PRETO')) return 'INDISPONIVEL'
  if (d.includes('ELEGIVEL') || d === 'OK' || d.includes('VERDE')) return 'ELEGIVEL'
  const c = Number(codigo)
  if (c === 2) return 'PRE_APROVADO'
  if (c === 3) return 'ELEGIVEL'
  if (c === 4) return 'NAO_ELEGIVEL'
  return 'DESCONHECIDO'
}

/**
 * Situação da proposta (GET /propostas/{n} → "status", formato "N.Descrição", ex.:
 * "2.Formalização Digital"). O PAN não publica a lista: de-para por palavra-chave e,
 * na dúvida, "Em análise" — status desconhecido nunca vira sucesso.
 * Formalização = crédito aprovado (no exemplo, atividade "Formalização Digital: Aprovada").
 * TODO homologação: confirmar a lista real de status.
 */
export function panProposalStatus(status: unknown): AttemptStatus {
  const s = panNorm(status)
  if (!s) return 'EM_ANALISE'
  if (s.includes('CANCEL')) return 'CANCELADA'
  if (s.includes('EXPIR') || s.includes('VENCID')) return 'EXPIRADA'
  if (s.includes('RECUS') || s.includes('REPROV') || s.includes('NEGAD') || s.includes('NAO APROV')) return 'RECUSADA'
  if (s.includes('PENDEN')) return 'PENDENTE'
  if (s.includes('PRE APROV')) return 'PRE_APROVADA'
  if (s.includes('APROVAD') || s.includes('FORMALIZ') || s.includes('PAGO') || s.includes('PAGA') || s.includes('LIBERAD') || s.includes('EFETIVAD')) return 'APROVADA'
  return 'EM_ANALISE'
}

/** Decisão do Crivo na simulação ("decisaoCredito"; exemplos: "Aprovada" ou null). */
export function panCreditRefused(decisao: unknown): boolean {
  const s = panNorm(decisao)
  return s.includes('RECUS') || s.includes('REPROV') || s.includes('NEGAD') || s.includes('NAO APROV')
}

// ── Código Molicar (codigoVeiculo da simulação) ─────────────────────────────
// O PAN não aceita FIPE: o veículo vai pelo código Molicar, achado nas tabelas
// marcas → modelos → versões. O de-para abaixo casa o cadastro do estoque com elas.
const BRAND_ALIASES: Record<string, string> = { VW: 'VOLKSWAGEN', GM: 'CHEVROLET', 'MERCEDES BENZ': 'MERCEDES-BENZ', CAOA: 'CAOA CHERY' }
const tokens = (s: unknown) => panNorm(s).split(' ').filter((t) => t.length > 0)

/** Marca do PAN (lista vem com espaços à direita). */
export function panMatchBrand(list: string[], brand: unknown): string | null {
  const raw = panNorm(brand)
  if (!raw) return null
  const first = raw.split(' ')[0]
  const want = BRAND_ALIASES[raw] ?? BRAND_ALIASES[first] ?? raw
  const items = list.map((b) => ({ orig: b.trim(), n: panNorm(b) })).filter((b) => b.n)
  return (items.find((b) => b.n === panNorm(want)) ?? items.find((b) => panNorm(want).startsWith(`${b.n} `) || b.n.startsWith(`${panNorm(want)} `))
    ?? items.find((b) => b.n === first))?.orig ?? null
}

/** Modelos do PAN que correspondem ao modelo do estoque (exatos primeiro). */
export function panMatchModels(list: string[], model: unknown): string[] {
  const want = panNorm(model)
  if (!want) return []
  const head = want.split(' ')[0]
  const items = list.map((m) => ({ orig: m.trim(), n: panNorm(m) })).filter((m) => m.n)
  const exact = items.filter((m) => m.n === want)
  const prefix = items.filter((m) => m.n !== want && (want.startsWith(`${m.n} `) || m.n.startsWith(`${want} `) || m.n.startsWith(`${want}`)))
  const loose = items.filter((m) => !exact.includes(m) && !prefix.includes(m) && m.n.split(' ')[0] === head)
  return [...exact, ...prefix, ...loose].map((m) => m.orig).slice(0, 3)
}

export interface PanMolicarVersion { codigoMolicar?: string; valorMolicar?: number; descricaoVersao?: string }

/**
 * Versão Molicar mais parecida com o veículo: palavras em comum com versão/motor/
 * câmbio/combustível; empate decide pelo valor Molicar mais perto da FIPE/venda.
 */
export function panPickVersion(list: PanMolicarVersion[], v: { version?: string | null; engine?: string | null; transmission?: string | null; fuel?: string | null; model?: string | null }, refValue: number | null): PanMolicarVersion | null {
  const items = list.filter((x) => x.codigoMolicar)
  if (!items.length) return null
  const TRANS: Record<string, string[]> = { AUTOMATICO: ['AUTOMATICO', 'AUT'], CVT: ['CVT', 'AUTOMATICO'], MANUAL: ['MECANICO', 'MANUAL'], SEMI_AUTOMATICO: ['AUTOMATIZADO'] }
  const want = new Set([...tokens(v.version), ...tokens(v.engine), ...tokens(v.fuel), ...(TRANS[panNorm(v.transmission).replace(/ /g, '_')] ?? [])].filter((t) => t.length > 1 || /\d/.test(t)))
  const score = (x: PanMolicarVersion) => tokens(x.descricaoVersao).filter((t) => want.has(t)).length
  const dist = (x: PanMolicarVersion) => (refValue && x.valorMolicar ? Math.abs(x.valorMolicar - refValue) : Number.MAX_SAFE_INTEGER)
  return [...items].sort((a, b) => score(b) - score(a) || dist(a) - dist(b))[0]
}

/** "R$ 14.000,00" → 14000 */
export function panBrl(v: string | null | undefined): number | null {
  if (!v) return null
  const x = Number(v.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(x) ? x : null
}

/** Texto do pré-aprovado: "Até R$ 14.000,00. Parcela até R$ 500,00. Prazo até 48x e zero de entrada." */
export function panParsePreApproved(text: unknown): { approvedAmount: number | null; installmentValue: number | null; installments: number | null } | null {
  const t = String(text ?? '')
  const amount = panBrl(t.match(/^\s*at[eé]\s*R\$\s*([\d.]+(?:,\d{2})?)/i)?.[1])
  const parcela = panBrl(t.match(/parcela\s+at[eé]\s*R\$\s*([\d.]+(?:,\d{2})?)/i)?.[1])
  const prazo = Number(t.match(/prazo\s+at[eé]\s*(\d{1,3})\s*x/i)?.[1]) || null
  if (amount == null && parcela == null && prazo == null) return null
  return { approvedAmount: amount, installmentValue: parcela, installments: prazo }
}
