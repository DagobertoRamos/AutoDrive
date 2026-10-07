// =============================================================================
// F&I Core — ficha universal: catálogo de campos e "o que falta" (PURO).
//
// O cliente informa os dados UMA vez. O catálogo segue as fichas cadastrais
// de veículos dos bancos (PF e PJ). Duas etapas:
//   • simulação: o mínimo para identificar e contatar o cliente;
//   • ficha completa (envio aos bancos): o conjunto comum + condicionais
//     (cônjuge se casado, empresa se CLT/empresário, benefício se aposentado…).
// Cada banco pode exigir campos a mais:
//   • conector oficial integrado → getRequiredFields() do próprio conector;
//   • sem integração → lista configurada pela loja (Configurações › F&I).
// =============================================================================

export type PersonType = 'PF' | 'PJ'
export type FieldGroup =
  | 'IDENTIFICACAO' | 'DOCUMENTOS' | 'FILIACAO' | 'CONTATO' | 'ENDERECO' | 'RENDA' | 'EMPRESA_TRABALHO'
  | 'CONJUGE' | 'EMPRESA' | 'SOCIOS' | 'PATRIMONIO' | 'COMPLEMENTO'

export interface FieldDef {
  key: string
  label: string
  group: FieldGroup
  for: PersonType | 'AMBOS'
  /** Dado sensível que só deve ser pedido quando exigido (minimização LGPD). */
  sensitive?: boolean
}

export const FIELD_GROUP_LABEL: Record<FieldGroup, string> = {
  IDENTIFICACAO: 'Dados pessoais', DOCUMENTOS: 'Documento de identidade', FILIACAO: 'Filiação', CONTATO: 'Contato',
  ENDERECO: 'Endereço', RENDA: 'Ocupação e renda', EMPRESA_TRABALHO: 'Empresa onde trabalha', CONJUGE: 'Cônjuge',
  EMPRESA: 'Dados da empresa', SOCIOS: 'Sócios e representante', PATRIMONIO: 'Patrimônio e referências', COMPLEMENTO: 'Informações adicionais',
}

export const FIELDS: FieldDef[] = [
  // PF — dados pessoais
  { key: 'nomeCompleto', label: 'Nome completo', group: 'IDENTIFICACAO', for: 'AMBOS' },
  { key: 'cpf', label: 'CPF', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'dataNascimento', label: 'Data de nascimento', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'sexo', label: 'Sexo', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'estadoCivil', label: 'Estado civil', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'nacionalidade', label: 'Nacionalidade', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'naturalidade', label: 'Naturalidade (cidade)', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'naturalidadeUf', label: 'UF de naturalidade', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'escolaridade', label: 'Escolaridade', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'dependentes', label: 'Dependentes', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'pep', label: 'Pessoa politicamente exposta', group: 'IDENTIFICACAO', for: 'PF' },
  // PF — documento
  { key: 'rg', label: 'RG', group: 'DOCUMENTOS', for: 'PF', sensitive: true },
  { key: 'rgOrgao', label: 'Órgão emissor', group: 'DOCUMENTOS', for: 'PF' },
  { key: 'rgUf', label: 'UF do RG', group: 'DOCUMENTOS', for: 'PF' },
  { key: 'rgDataEmissao', label: 'Data de emissão do RG', group: 'DOCUMENTOS', for: 'PF' },
  { key: 'cnh', label: 'CNH', group: 'DOCUMENTOS', for: 'PF', sensitive: true },
  // PF — filiação
  { key: 'nomeMae', label: 'Nome da mãe', group: 'FILIACAO', for: 'PF' },
  { key: 'nomePai', label: 'Nome do pai', group: 'FILIACAO', for: 'PF' },
  // PJ — empresa compradora
  { key: 'cnpj', label: 'CNPJ', group: 'EMPRESA', for: 'PJ' },
  { key: 'razaoSocial', label: 'Razão social', group: 'EMPRESA', for: 'PJ' },
  { key: 'nomeFantasia', label: 'Nome fantasia', group: 'EMPRESA', for: 'PJ' },
  { key: 'dataFundacao', label: 'Data de constituição', group: 'EMPRESA', for: 'PJ' },
  { key: 'naturezaJuridica', label: 'Natureza jurídica', group: 'EMPRESA', for: 'PJ' },
  { key: 'atividade', label: 'Ramo / atividade', group: 'EMPRESA', for: 'PJ' },
  { key: 'inscricaoEstadual', label: 'Inscrição estadual', group: 'EMPRESA', for: 'PJ' },
  { key: 'capitalSocial', label: 'Capital social', group: 'EMPRESA', for: 'PJ' },
  { key: 'faturamentoMensal', label: 'Faturamento médio mensal', group: 'EMPRESA', for: 'PJ', sensitive: true },
  { key: 'faturamentoAnual', label: 'Faturamento anual', group: 'EMPRESA', for: 'PJ', sensitive: true },
  { key: 'numeroFuncionarios', label: 'Número de funcionários', group: 'EMPRESA', for: 'PJ' },
  { key: 'socios', label: 'Sócios', group: 'SOCIOS', for: 'PJ' },
  { key: 'representanteNome', label: 'Representante legal', group: 'SOCIOS', for: 'PJ' },
  { key: 'representanteCpf', label: 'CPF do representante', group: 'SOCIOS', for: 'PJ' },
  // Contato
  { key: 'celular', label: 'Celular', group: 'CONTATO', for: 'AMBOS' },
  { key: 'email', label: 'E-mail', group: 'CONTATO', for: 'AMBOS' },
  { key: 'telefoneFixo', label: 'Telefone fixo', group: 'CONTATO', for: 'AMBOS' },
  // Endereço (residencial / sede)
  { key: 'cep', label: 'CEP', group: 'ENDERECO', for: 'AMBOS' },
  { key: 'logradouro', label: 'Endereço', group: 'ENDERECO', for: 'AMBOS' },
  { key: 'numero', label: 'Número', group: 'ENDERECO', for: 'AMBOS' },
  { key: 'complemento', label: 'Complemento', group: 'ENDERECO', for: 'AMBOS' },
  { key: 'bairro', label: 'Bairro', group: 'ENDERECO', for: 'AMBOS' },
  { key: 'cidade', label: 'Cidade', group: 'ENDERECO', for: 'AMBOS' },
  { key: 'estado', label: 'UF', group: 'ENDERECO', for: 'AMBOS' },
  { key: 'tipoResidencia', label: 'Tipo de residência', group: 'ENDERECO', for: 'PF' },
  { key: 'tempoResidenciaMeses', label: 'Tempo na residência', group: 'ENDERECO', for: 'PF' },
  { key: 'valorAluguel', label: 'Valor do aluguel / prestação', group: 'ENDERECO', for: 'PF' },
  // Ocupação e renda (PF)
  { key: 'occupation', label: 'Natureza da ocupação', group: 'RENDA', for: 'PF' },
  { key: 'profissao', label: 'Profissão', group: 'RENDA', for: 'PF' },
  { key: 'renda', label: 'Renda bruta mensal', group: 'RENDA', for: 'PF', sensitive: true },
  { key: 'comprovanteRenda', label: 'Comprovação de renda', group: 'RENDA', for: 'PF' },
  { key: 'numeroBeneficio', label: 'Número do benefício', group: 'RENDA', for: 'PF' },
  { key: 'outrasRendas', label: 'Outras rendas', group: 'RENDA', for: 'PF' },
  // Empresa onde trabalha (PF)
  { key: 'empresaNome', label: 'Empresa onde trabalha', group: 'EMPRESA_TRABALHO', for: 'PF' },
  { key: 'empresaCnpj', label: 'CNPJ da empresa', group: 'EMPRESA_TRABALHO', for: 'PF' },
  { key: 'cargo', label: 'Cargo / função', group: 'EMPRESA_TRABALHO', for: 'PF' },
  { key: 'dataAdmissao', label: 'Data de admissão', group: 'EMPRESA_TRABALHO', for: 'PF' },
  { key: 'tempoEmpregoMeses', label: 'Tempo no emprego', group: 'EMPRESA_TRABALHO', for: 'PF' },
  { key: 'participacaoEmpresa', label: 'Participação na empresa (%)', group: 'EMPRESA_TRABALHO', for: 'PF' },
  { key: 'empresaTelefone', label: 'Telefone da empresa', group: 'EMPRESA_TRABALHO', for: 'PF' },
  { key: 'empresaCep', label: 'CEP da empresa', group: 'EMPRESA_TRABALHO', for: 'PF' },
  { key: 'empresaLogradouro', label: 'Endereço da empresa', group: 'EMPRESA_TRABALHO', for: 'PF' },
  { key: 'empresaNumero', label: 'Número (empresa)', group: 'EMPRESA_TRABALHO', for: 'PF' },
  { key: 'empresaComplemento', label: 'Complemento (empresa)', group: 'EMPRESA_TRABALHO', for: 'PF' },
  { key: 'empresaBairro', label: 'Bairro (empresa)', group: 'EMPRESA_TRABALHO', for: 'PF' },
  { key: 'empresaCidade', label: 'Cidade (empresa)', group: 'EMPRESA_TRABALHO', for: 'PF' },
  { key: 'empresaEstado', label: 'UF (empresa)', group: 'EMPRESA_TRABALHO', for: 'PF' },
  // Cônjuge (PF casado / união estável)
  { key: 'conjugeNome', label: 'Nome do cônjuge', group: 'CONJUGE', for: 'PF' },
  { key: 'conjugeCpf', label: 'CPF do cônjuge', group: 'CONJUGE', for: 'PF' },
  { key: 'conjugeDataNascimento', label: 'Nascimento do cônjuge', group: 'CONJUGE', for: 'PF' },
  { key: 'conjugeOcupacao', label: 'Ocupação do cônjuge', group: 'CONJUGE', for: 'PF' },
  { key: 'conjugeRenda', label: 'Renda do cônjuge', group: 'CONJUGE', for: 'PF', sensitive: true },
  { key: 'conjugeCelular', label: 'Celular do cônjuge', group: 'CONJUGE', for: 'PF' },
  // Patrimônio e referências
  { key: 'patrimonio', label: 'Bens', group: 'PATRIMONIO', for: 'AMBOS' },
  { key: 'referenciasBancarias', label: 'Referências bancárias', group: 'PATRIMONIO', for: 'AMBOS' },
  { key: 'referencias', label: 'Referências pessoais', group: 'PATRIMONIO', for: 'PF' },
  { key: 'referenciasComerciais', label: 'Referências comerciais', group: 'PATRIMONIO', for: 'PJ' },
]
export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((f) => [f.key, f]))
export const isFieldKey = (k: string) => Object.prototype.hasOwnProperty.call(FIELD_BY_KEY, k)

/** Mínimo para SIMULAR (identificar e contatar o cliente). */
export const SIMULATION_REQUIRED: Record<PersonType, string[]> = {
  PF: ['nomeCompleto', 'cpf', 'dataNascimento', 'celular', 'email'],
  PJ: ['razaoSocial', 'cnpj', 'celular', 'email'],
}

/** Base da ficha completa — exigida para enviar a QUALQUER banco. */
export const COMMON_REQUIRED: Record<PersonType, string[]> = {
  PF: [
    'nomeCompleto', 'cpf', 'dataNascimento', 'sexo', 'estadoCivil', 'nacionalidade', 'naturalidade', 'naturalidadeUf', 'pep',
    'rg', 'rgOrgao', 'rgUf', 'rgDataEmissao', 'nomeMae', 'nomePai',
    'celular', 'email',
    'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado', 'tipoResidencia', 'tempoResidenciaMeses',
    'occupation', 'profissao', 'renda',
  ],
  PJ: [
    'razaoSocial', 'cnpj', 'dataFundacao', 'naturezaJuridica', 'atividade', 'faturamentoMensal', 'faturamentoAnual',
    'celular', 'email',
    'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado',
    'socios', 'representanteNome', 'representanteCpf',
  ],
}

const EMPRESA_ENDERECO = ['empresaCep', 'empresaLogradouro', 'empresaNumero', 'empresaBairro', 'empresaCidade', 'empresaEstado']
export const COM_CONJUGE = ['CASADO', 'UNIAO_ESTAVEL']

/** Campos que passam a ser exigidos conforme o que já foi respondido. */
export function conditionalRequired(person: Record<string, unknown>, type: PersonType): string[] {
  if (type === 'PJ') return []
  const out: string[] = []
  const occ = String(person.occupation ?? '')
  if (occ === 'CLT') out.push('empresaNome', 'empresaTelefone', 'cargo', 'dataAdmissao', ...EMPRESA_ENDERECO)
  if (occ === 'EMPRESARIO') out.push('empresaNome', 'empresaCnpj', 'empresaTelefone', 'participacaoEmpresa', ...EMPRESA_ENDERECO)
  if (occ === 'AUTONOMO') out.push('cargo')
  if (occ === 'APOSENTADO_PENSIONISTA') out.push('numeroBeneficio')
  if (COM_CONJUGE.includes(String(person.estadoCivil ?? ''))) out.push('conjugeNome', 'conjugeCpf', 'conjugeDataNascimento')
  if (['ALUGADA', 'FINANCIADA'].includes(String(person.tipoResidencia ?? ''))) out.push('valorAluguel')
  return out
}

/** Ficha completa exigida para enviar aos bancos (base + condicionais). */
export function commonRequiredFor(person: Record<string, unknown>, type: PersonType): string[] {
  return [...COMMON_REQUIRED[type], ...conditionalRequired(person, type)]
}

/** Etapas do formulário progressivo do site (quanto menos no começo, melhor). */
export const SITE_STEP_FIELDS = {
  valores: [] as string[], // valor do veículo, entrada e parcelas (não são dados pessoais)
  identificacao: SIMULATION_REQUIRED.PF,
}

function filled(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (typeof v === 'number') return Number.isFinite(v)
  if (Array.isArray(v)) return v.length > 0
  if (v instanceof Date) return !Number.isNaN(v.getTime())
  if (typeof v === 'object') {
    // Decimal do Prisma (toString) ou objeto preenchido
    const s = String(v)
    if (s && s !== '[object Object]') return s.trim().length > 0
    return Object.keys(v as object).length > 0
  }
  return Boolean(v)
}

/** Valores em que zero não é resposta (renda, faturamento…). Contagens aceitam 0. */
const POSITIVE = new Set(['renda', 'faturamentoMensal', 'faturamentoAnual', 'conjugeRenda', 'valorAluguel', 'capitalSocial', 'participacaoEmpresa'])

export function isFilled(key: string, v: unknown): boolean {
  if (!filled(v)) return false
  if (POSITIVE.has(key)) return Number(String(v)) > 0
  return true
}

/** Campos (do conjunto pedido) ainda vazios na ficha, respeitando PF/PJ. */
export function missingFields(person: Record<string, unknown>, required: string[], type: PersonType): FieldDef[] {
  const seen = new Set<string>()
  const out: FieldDef[] = []
  for (const key of required) {
    if (seen.has(key)) continue
    seen.add(key)
    const def = FIELD_BY_KEY[key]
    if (!def) continue
    if (def.for !== 'AMBOS' && def.for !== type) continue
    if (!isFilled(key, person[key])) out.push(def)
  }
  return out
}

export interface BankRequirement { bankId: string; bankName: string; extraFields: string[] }

export interface MissingByBank { bankId: string; bankName: string; missing: FieldDef[] }

/**
 * O que falta, por banco selecionado: ficha completa + extras do banco.
 * Usado para "Precisamos de mais 2 informações para enviar ao Santander."
 */
export function missingForBanks(person: Record<string, unknown>, type: PersonType, banks: BankRequirement[]): { common: FieldDef[]; byBank: MissingByBank[] } {
  const common = missingFields(person, commonRequiredFor(person, type), type)
  const commonKeys = new Set(common.map((f) => f.key))
  const byBank = banks.map((b) => ({
    bankId: b.bankId,
    bankName: b.bankName,
    missing: missingFields(person, b.extraFields, type).filter((f) => !commonKeys.has(f.key)),
  }))
  return { common, byBank }
}

export function missingMessage(bankName: string, n: number): string {
  if (n <= 0) return `Tudo pronto para enviar ao ${bankName}.`
  return n === 1 ? `Precisamos de mais 1 informação para enviar ao ${bankName}.` : `Precisamos de mais ${n} informações para enviar ao ${bankName}.`
}

/** Saneia a lista configurada pela loja (só chaves conhecidas, sem repetição). */
export function sanitizeFieldList(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  return [...new Set(list.filter((k): k is string => typeof k === 'string' && isFieldKey(k)))].slice(0, FIELDS.length)
}

/** Soma das participações dos sócios (para validar 100%). */
export function socioTotal(socios: unknown): number {
  if (!Array.isArray(socios)) return 0
  return Math.round(socios.reduce((a, s) => a + (Number((s as { participacao?: unknown })?.participacao) || 0), 0) * 100) / 100
}
