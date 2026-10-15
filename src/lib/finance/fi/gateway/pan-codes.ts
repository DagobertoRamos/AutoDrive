// =============================================================================
// Banco PAN — códigos da OpenAPI Veículos (developers.bancopan.com.br,
// "Financiamento de Veículos", atualização de março/2023) e o de-para a partir
// da ficha universal. PURO (sem I/O) — testado em pan.test.ts.
//
// A documentação do PAN é HTML com exemplos, sem tabela de domínios. Só entra
// aqui o que aparece nela; o resto está marcado como TODO (validar na homologação).
// =============================================================================

import type { AttemptStatus } from '../status-core'

export const panNorm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Texto em maiúsculas, sem acento (o PAN usa assim nos exemplos). */
export const panUpper = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

/** Categoria da pré-análise (enum documentado: "LEVES" | "MOTOS"). */
export function panCategory(cat: 'AUTOMOVEL' | 'MOTO' | 'PESADO' | null | undefined): 'LEVES' | 'MOTOS' | null {
  if (!cat || cat === 'AUTOMOVEL') return 'LEVES'
  if (cat === 'MOTO') return 'MOTOS'
  return null
}

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
 * Natureza da ocupação (dadosCliente.codigoNaturezaOcupacao). A documentação não
 * publica a tabela (exemplos: "04", "13"). TODO homologação: pedir a tabela ao PAN
 * e preencher o de-para. Sem código, o campo não vai (a pré-análise o marca como
 * não obrigatório) e a profissão não é consultada.
 */
export const PAN_OCCUPATION_NATURE: Record<string, string> = {}
export const panOccupationNature = (occupation: unknown): string | null => PAN_OCCUPATION_NATURE[String(occupation ?? '')] ?? null

/** Profissão: casa o nome da ficha com a lista do PAN (GET /propostas/profissoes). */
export function panMatchProfession(list: { codigoDaProfissao?: string; descricao?: string }[], name: unknown): { codigo: string; nome: string } | null {
  const want = panNorm(name)
  const items = list.filter((p) => p.codigoDaProfissao && p.descricao)
  const hit = (want && (items.find((p) => panNorm(p.descricao) === want) ?? items.find((p) => panNorm(p.descricao).startsWith(want) || want.startsWith(panNorm(p.descricao)))))
    || items.find((p) => panNorm(p.descricao) === 'OUTRAS')
  return hit ? { codigo: String(hit.codigoDaProfissao), nome: String(hit.descricao) } : null
}

/** Farol da pré-análise ("Farol do Crivo"). Documentado: codigo 2 = Pré-Aprovado, 4 = Não Elegível. */
export type PanFarol = 'PRE_APROVADO' | 'ELEGIVEL' | 'NAO_ELEGIVEL' | 'INDISPONIVEL' | 'DESCONHECIDO'
export function panFarol(codigo: unknown, descricao: unknown): PanFarol {
  const d = panNorm(descricao)
  if (d.includes('PRE APROVAD') || d === 'PA OK' || d.includes('AZUL')) return 'PRE_APROVADO'
  if (d.includes('NAO ELEGIVEL') || d.includes('NEGADO') || d.includes('VERMELHO')) return 'NAO_ELEGIVEL'
  if (d.includes('INDISPONIVEL') || d === 'ERRO' || d.includes('PRETO')) return 'INDISPONIVEL'
  if (d.includes('ELEGIVEL') || d === 'OK' || d.includes('VERDE')) return 'ELEGIVEL'
  const c = Number(codigo)
  if (c === 2) return 'PRE_APROVADO'
  if (c === 4) return 'NAO_ELEGIVEL'
  return 'DESCONHECIDO'
}

/**
 * Situação da proposta (GET /propostas/{n} → "status"). O PAN não publica o domínio;
 * de-para por palavra-chave e, na dúvida, "Em análise" — status desconhecido nunca
 * vira sucesso. TODO homologação: trocar pelos valores reais.
 */
export function panProposalStatus(status: unknown): AttemptStatus {
  const s = panNorm(status)
  if (!s) return 'EM_ANALISE'
  if (s.includes('CANCEL')) return 'CANCELADA'
  if (s.includes('EXPIR') || s.includes('VENCID')) return 'EXPIRADA'
  if (s.includes('RECUS') || s.includes('REPROV') || s.includes('NEGAD') || s.includes('NAO APROV')) return 'RECUSADA'
  if (s.includes('PENDEN')) return 'PENDENTE'
  if (s.includes('PRE APROV')) return 'PRE_APROVADA'
  if (s.includes('APROVAD') || s.includes('PAGO') || s.includes('PAGA') || s.includes('LIBERAD') || s.includes('EFETIVAD')) return 'APROVADA'
  return 'EM_ANALISE'
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
