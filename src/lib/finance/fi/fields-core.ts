// =============================================================================
// F&I Core — ficha universal: catálogo de campos e "o que falta" (PURO).
//
// O cliente informa os dados UMA vez. Cada banco pode exigir campos a mais:
//   • conector oficial integrado → getRequiredFields() do próprio conector;
//   • sem integração → lista configurada pela loja (Configurações › F&I).
// Nada de inventar exigência de banco: o padrão é só o conjunto comum.
// =============================================================================

export type PersonType = 'PF' | 'PJ'
export type FieldGroup = 'IDENTIFICACAO' | 'CONTATO' | 'ENDERECO' | 'RENDA' | 'EMPRESA' | 'COMPLEMENTO'

export interface FieldDef {
  key: string
  label: string
  group: FieldGroup
  for: PersonType | 'AMBOS'
  /** Dado sensível que só deve ser pedido quando exigido (minimização LGPD). */
  sensitive?: boolean
}

export const FIELD_GROUP_LABEL: Record<FieldGroup, string> = {
  IDENTIFICACAO: 'Identificação', CONTATO: 'Contato', ENDERECO: 'Endereço',
  RENDA: 'Trabalho e renda', EMPRESA: 'Empresa', COMPLEMENTO: 'Informações adicionais',
}

export const FIELDS: FieldDef[] = [
  // PF — identificação
  { key: 'nomeCompleto', label: 'Nome completo', group: 'IDENTIFICACAO', for: 'AMBOS' },
  { key: 'cpf', label: 'CPF', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'dataNascimento', label: 'Data de nascimento', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'rg', label: 'RG', group: 'IDENTIFICACAO', for: 'PF', sensitive: true },
  { key: 'rgOrgao', label: 'Órgão emissor do RG', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'cnh', label: 'CNH', group: 'IDENTIFICACAO', for: 'PF', sensitive: true },
  { key: 'estadoCivil', label: 'Estado civil', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'nacionalidade', label: 'Nacionalidade', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'naturalidade', label: 'Naturalidade', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'nomeMae', label: 'Nome da mãe', group: 'IDENTIFICACAO', for: 'PF' },
  { key: 'nomePai', label: 'Nome do pai', group: 'IDENTIFICACAO', for: 'PF' },
  // PJ — identificação
  { key: 'cnpj', label: 'CNPJ', group: 'IDENTIFICACAO', for: 'PJ' },
  { key: 'razaoSocial', label: 'Razão social', group: 'IDENTIFICACAO', for: 'PJ' },
  { key: 'nomeFantasia', label: 'Nome fantasia', group: 'IDENTIFICACAO', for: 'PJ' },
  { key: 'atividade', label: 'Atividade', group: 'EMPRESA', for: 'PJ' },
  { key: 'dataFundacao', label: 'Data de fundação', group: 'EMPRESA', for: 'PJ' },
  { key: 'faturamentoMensal', label: 'Faturamento mensal', group: 'EMPRESA', for: 'PJ', sensitive: true },
  { key: 'socios', label: 'Sócios', group: 'EMPRESA', for: 'PJ' },
  { key: 'representanteNome', label: 'Representante legal', group: 'EMPRESA', for: 'PJ' },
  { key: 'representanteCpf', label: 'CPF do representante', group: 'EMPRESA', for: 'PJ' },
  // Contato
  { key: 'celular', label: 'Celular', group: 'CONTATO', for: 'AMBOS' },
  { key: 'email', label: 'E-mail', group: 'CONTATO', for: 'AMBOS' },
  // Endereço
  { key: 'cep', label: 'CEP', group: 'ENDERECO', for: 'AMBOS' },
  { key: 'logradouro', label: 'Endereço', group: 'ENDERECO', for: 'AMBOS' },
  { key: 'numero', label: 'Número', group: 'ENDERECO', for: 'AMBOS' },
  { key: 'bairro', label: 'Bairro', group: 'ENDERECO', for: 'AMBOS' },
  { key: 'cidade', label: 'Cidade', group: 'ENDERECO', for: 'AMBOS' },
  { key: 'estado', label: 'UF', group: 'ENDERECO', for: 'AMBOS' },
  { key: 'tipoResidencia', label: 'Tipo de residência', group: 'ENDERECO', for: 'PF' },
  { key: 'tempoResidenciaMeses', label: 'Tempo na residência', group: 'ENDERECO', for: 'PF' },
  // Trabalho e renda (PF)
  { key: 'occupation', label: 'Ocupação', group: 'RENDA', for: 'PF' },
  { key: 'profissao', label: 'Profissão', group: 'RENDA', for: 'PF' },
  { key: 'empresaNome', label: 'Empresa onde trabalha', group: 'RENDA', for: 'PF' },
  { key: 'cargo', label: 'Cargo', group: 'RENDA', for: 'PF' },
  { key: 'renda', label: 'Renda mensal', group: 'RENDA', for: 'PF', sensitive: true },
  { key: 'tempoEmpregoMeses', label: 'Tempo no emprego', group: 'RENDA', for: 'PF' },
  { key: 'outrasRendas', label: 'Outras rendas', group: 'RENDA', for: 'PF' },
  { key: 'referencias', label: 'Referências pessoais', group: 'COMPLEMENTO', for: 'AMBOS' },
]
export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((f) => [f.key, f]))
export const isFieldKey = (k: string) => Object.prototype.hasOwnProperty.call(FIELD_BY_KEY, k)

/** Mínimo para enviar a QUALQUER banco (pré-análise). */
export const COMMON_REQUIRED: Record<PersonType, string[]> = {
  PF: ['nomeCompleto', 'cpf', 'dataNascimento', 'celular', 'cep', 'logradouro', 'numero', 'cidade', 'estado', 'occupation', 'renda'],
  PJ: ['razaoSocial', 'cnpj', 'celular', 'cep', 'logradouro', 'numero', 'cidade', 'estado', 'faturamentoMensal', 'representanteNome', 'representanteCpf'],
}

/** Etapas do formulário progressivo do site (quanto menos no começo, melhor). */
export const SITE_STEP_FIELDS = {
  valores: [] as string[], // valor do veículo, entrada e parcelas (não são dados pessoais)
  identificacao: ['nomeCompleto', 'cpf', 'dataNascimento', 'celular'],
}

function filled(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (typeof v === 'number') return Number.isFinite(v) && v > 0
  if (Array.isArray(v)) return v.length > 0
  if (v instanceof Date) return !Number.isNaN(v.getTime())
  if (typeof v === 'object') {
    // Decimal do Prisma (toString) ou objeto preenchido
    const s = String(v)
    if (s && s !== '[object Object]') return Number(s) > 0 || s.trim().length > 0
    return Object.keys(v as object).length > 0
  }
  return Boolean(v)
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
    if (!filled(person[key])) out.push(def)
  }
  return out
}

export interface BankRequirement { bankId: string; bankName: string; extraFields: string[] }

export interface MissingByBank { bankId: string; bankName: string; missing: FieldDef[] }

/**
 * O que falta, por banco selecionado: comum + extras do banco.
 * Usado para "Precisamos de mais 2 informações para enviar ao Santander."
 */
export function missingForBanks(person: Record<string, unknown>, type: PersonType, banks: BankRequirement[]): { common: FieldDef[]; byBank: MissingByBank[] } {
  const common = missingFields(person, COMMON_REQUIRED[type], type)
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
