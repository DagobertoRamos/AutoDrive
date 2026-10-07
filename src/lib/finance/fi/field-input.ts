// =============================================================================
// F&I — normalização/validação de UM campo da ficha universal (PURO).
// Usado no cadastro completo e no preenchimento progressivo.
// =============================================================================

import { isValidCPF } from '@/lib/br-docs/cpf'
import { FIELD_BY_KEY, socioTotal } from './fields-core'

export type FieldResult = { ok: true; value: unknown } | { ok: false; error: string }

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const text = (v: unknown, max = 160) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)

export function cnpjOk(c: string): boolean {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false
  const calc = (base: string, w: number[]) => { const s = base.split('').reduce((a, d, i) => a + Number(d) * w[i], 0) % 11; return s < 2 ? 0 : 11 - s }
  const d1 = calc(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = calc(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return c.endsWith(`${d1}${d2}`)
}

function parseDate(v: unknown): Date | null {
  const s = String(v ?? '')
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
  const ymd = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : br ? `${br[3]}-${br[2]}-${br[1]}` : null
  if (!ymd) return null
  const d = new Date(`${ymd}T12:00:00.000Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== ymd ? null : d
}

function date(v: unknown, min: number, max: number, label: string): FieldResult {
  const d = parseDate(v)
  if (!d) return { ok: false, error: `${label}: data inválida.` }
  const years = (Date.now() - d.getTime()) / (365.25 * 86_400_000)
  if (years < min || years > max) return { ok: false, error: `${label}: data fora do esperado.` }
  return { ok: true, value: d }
}

export function parseMoney(v: unknown): number {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/[^\d,.-]/g, '')
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
}

function money(v: unknown, label: string, max = 100_000_000): FieldResult {
  const n = parseMoney(v)
  if (!Number.isFinite(n) || n <= 0 || n > max) return { ok: false, error: `${label}: valor inválido.` }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

function phone(v: unknown, label: string): FieldResult {
  const p = digits(v)
  return p.length >= 10 && p.length <= 13 ? { ok: true, value: p } : { ok: false, error: `${label} inválido (com DDD).` }
}

function int(v: unknown, label: string, max: number): FieldResult {
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= max ? { ok: true, value: n } : { ok: false, error: `${label}: número inválido.` }
}

function percent(v: unknown, label: string): FieldResult {
  const n = parseMoney(v)
  return Number.isFinite(n) && n > 0 && n <= 100 ? { ok: true, value: Math.round(n * 100) / 100 } : { ok: false, error: `${label}: informe de 0,01 a 100.` }
}

const opts = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }))

export const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  sexo: opts([['M', 'Masculino'], ['F', 'Feminino']]),
  estadoCivil: opts([['SOLTEIRO', 'Solteiro(a)'], ['CASADO', 'Casado(a)'], ['UNIAO_ESTAVEL', 'União estável'], ['DIVORCIADO', 'Divorciado(a)'], ['VIUVO', 'Viúvo(a)'], ['SEPARADO', 'Separado(a)']]),
  escolaridade: opts([['FUNDAMENTAL', 'Ensino fundamental'], ['MEDIO', 'Ensino médio'], ['SUPERIOR_INCOMPLETO', 'Superior incompleto'], ['SUPERIOR', 'Superior completo'], ['POS', 'Pós-graduação']]),
  pep: opts([['NAO', 'Não'], ['SIM', 'Sim']]),
  tipoResidencia: opts([['PROPRIA', 'Própria quitada'], ['FINANCIADA', 'Própria financiada'], ['ALUGADA', 'Alugada'], ['FAMILIAR', 'Com a família'], ['FUNCIONAL', 'Funcional / cedida'], ['OUTRA', 'Outra']]),
  occupation: opts([['CLT', 'Assalariado (CLT / servidor)'], ['AUTONOMO', 'Autônomo / profissional liberal'], ['EMPRESARIO', 'Empresário / sócio'], ['APOSENTADO_PENSIONISTA', 'Aposentado / pensionista']]),
  conjugeOcupacao: opts([['CLT', 'Assalariado (CLT)'], ['FUNCIONARIO_PUBLICO', 'Funcionário público'], ['AUTONOMO', 'Autônomo'], ['EMPRESARIO', 'Empresário'], ['APOSENTADO_PENSIONISTA', 'Aposentado / pensionista'], ['DO_LAR', 'Do lar'], ['SEM_RENDA', 'Sem renda']]),
  comprovanteRenda: opts([['HOLERITE', 'Holerite'], ['EXTRATO', 'Extrato bancário'], ['IRPF', 'Declaração de IR'], ['DECORE', 'DECORE'], ['PRO_LABORE', 'Pró-labore'], ['BENEFICIO', 'Extrato do benefício'], ['SEM_COMPROVACAO', 'Sem comprovação']]),
  naturezaJuridica: opts([['MEI', 'MEI'], ['EI', 'Empresário individual'], ['SLU', 'Sociedade limitada unipessoal'], ['LTDA', 'Sociedade limitada (LTDA)'], ['SA', 'Sociedade anônima (S/A)'], ['EIRELI', 'EIRELI'], ['OUTRA', 'Outra']]),
}

/** occupation é enum no banco: só os valores que ele aceita. */
const OCUPACAO_DB = ['AUTONOMO', 'CLT', 'EMPRESARIO', 'APOSENTADO_PENSIONISTA']

/** Tipo de entrada para a tela montar o campo certo (máscara/teclado). */
export type InputKind = 'text' | 'cpf' | 'cnpj' | 'date' | 'money' | 'phone' | 'email' | 'cep' | 'uf' | 'months' | 'int' | 'percent' | 'select' | 'list'
export const FIELD_INPUT: Record<string, InputKind> = {
  cpf: 'cpf', representanteCpf: 'cpf', conjugeCpf: 'cpf', cnpj: 'cnpj', empresaCnpj: 'cnpj',
  dataNascimento: 'date', dataFundacao: 'date', rgDataEmissao: 'date', dataAdmissao: 'date', conjugeDataNascimento: 'date',
  renda: 'money', faturamentoMensal: 'money', faturamentoAnual: 'money', capitalSocial: 'money', conjugeRenda: 'money', valorAluguel: 'money',
  celular: 'phone', telefoneFixo: 'phone', empresaTelefone: 'phone', conjugeCelular: 'phone',
  email: 'email', cep: 'cep', empresaCep: 'cep', estado: 'uf', empresaEstado: 'uf', rgUf: 'uf', naturalidadeUf: 'uf',
  tempoResidenciaMeses: 'months', tempoEmpregoMeses: 'months', dependentes: 'int', numeroFuncionarios: 'int', participacaoEmpresa: 'percent',
  ...Object.fromEntries(Object.keys(SELECT_OPTIONS).map((k) => [k, 'select' as const])),
  socios: 'list', referencias: 'list', outrasRendas: 'list', patrimonio: 'list', referenciasBancarias: 'list', referenciasComerciais: 'list',
}

/** Colunas das listas (sócios, referências…). */
export const LIST_SHAPE: Record<string, { key: string; label: string; kind?: 'text' | 'doc' | 'percent' | 'money' | 'phone' | 'date' | 'email' | 'yesno' | 'select'; options?: { value: string; label: string }[]; wide?: boolean }[]> = {
  socios: [
    { key: 'nome', label: 'Nome / razão social', wide: true }, { key: 'documento', label: 'CPF / CNPJ', kind: 'doc' },
    { key: 'participacao', label: 'Participação %', kind: 'percent' }, { key: 'cargo', label: 'Cargo' },
    { key: 'dataNascimento', label: 'Nascimento', kind: 'date' }, { key: 'celular', label: 'Celular', kind: 'phone' },
    { key: 'email', label: 'E-mail', kind: 'email' }, { key: 'assina', label: 'Assina pela empresa', kind: 'yesno' },
    { key: 'avalista', label: 'Avalista', kind: 'yesno' },
  ],
  referencias: [{ key: 'nome', label: 'Nome', wide: true }, { key: 'telefone', label: 'Telefone', kind: 'phone' }, { key: 'relacao', label: 'Relação' }],
  outrasRendas: [{ key: 'descricao', label: 'Fonte', wide: true }, { key: 'valor', label: 'Valor mensal', kind: 'money' }],
  patrimonio: [
    { key: 'tipo', label: 'Tipo', kind: 'select', options: opts([['IMOVEL', 'Imóvel'], ['VEICULO', 'Veículo'], ['APLICACAO', 'Aplicação'], ['OUTRO', 'Outro']]) },
    { key: 'descricao', label: 'Descrição', wide: true }, { key: 'valor', label: 'Valor', kind: 'money' },
  ],
  referenciasBancarias: [{ key: 'banco', label: 'Banco', wide: true }, { key: 'agencia', label: 'Agência' }, { key: 'conta', label: 'Conta' }, { key: 'desde', label: 'Cliente desde (ano)' }],
  referenciasComerciais: [{ key: 'nome', label: 'Empresa', wide: true }, { key: 'cnpj', label: 'CNPJ', kind: 'doc' }, { key: 'telefone', label: 'Telefone', kind: 'phone' }],
}

const SHORT_OK = new Set(['numero', 'empresaNumero', 'complemento', 'empresaComplemento', 'rgOrgao', 'nomeFantasia', 'inscricaoEstadual', 'cargo'])
const isBlankRow = (r: Record<string, unknown>) => Object.values(r).every((v) => v == null || String(v).trim() === '' || v === 'NAO')

function normalizeList(key: string, raw: unknown, label: string): FieldResult {
  if (!Array.isArray(raw)) return { ok: false, error: `${label}: lista inválida.` }
  const shape = LIST_SHAPE[key] ?? [{ key: 'descricao', label: 'Descrição' }]
  const rows: Record<string, unknown>[] = []
  for (const x of raw.slice(0, 15)) {
    if (!x || typeof x !== 'object') continue
    const src = x as Record<string, unknown>
    if (key === 'socios' && src.documento == null && src.cpf != null) src.documento = src.cpf // formato antigo
    if (isBlankRow(src)) continue
    const row: Record<string, unknown> = {}
    for (const col of shape) {
      const v = src[col.key]
      if (v == null || String(v).trim() === '') continue
      switch (col.kind) {
        case 'doc': {
          const d = digits(v)
          if (!(d.length === 11 ? isValidCPF(d) : cnpjOk(d))) return { ok: false, error: `${label}: ${col.label} inválido (${text(src.nome ?? src.banco ?? '', 40) || 'linha ' + (rows.length + 1)}).` }
          row[col.key] = d; break
        }
        case 'percent': { const r = percent(v, `${label}: ${col.label}`); if (!r.ok) return r; row[col.key] = r.value; break }
        case 'money': { const r = money(v, `${label}: ${col.label}`, 1_000_000_000); if (!r.ok) return r; row[col.key] = r.value; break }
        case 'phone': { const r = phone(v, `${label}: ${col.label}`); if (!r.ok) return r; row[col.key] = r.value; break }
        case 'date': { const r = date(v, 0, 120, `${label}: ${col.label}`); if (!r.ok) return r; row[col.key] = (r.value as Date).toISOString().slice(0, 10); break }
        case 'email': { const e = text(v).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: `${label}: e-mail inválido.` }; row[col.key] = e; break }
        case 'yesno': row[col.key] = v === true || v === 'SIM' ? 'SIM' : 'NAO'; break
        case 'select': if (col.options?.some((o) => o.value === v)) row[col.key] = v; break
        default: row[col.key] = text(v, 120)
      }
    }
    rows.push(row)
  }
  if (key === 'socios' && rows.length) {
    if (rows.some((r) => !r.nome || !r.documento || r.participacao == null)) return { ok: false, error: 'Sócios: informe nome, CPF/CNPJ e participação de cada um.' }
    const docs = rows.map((r) => r.documento)
    if (new Set(docs).size !== docs.length) return { ok: false, error: 'Sócios: CPF/CNPJ repetido.' }
    const total = socioTotal(rows)
    if (Math.abs(total - 100) > 0.01) return { ok: false, error: `Sócios: a soma das participações deve ser 100% (está ${total.toLocaleString('pt-BR')}%).` }
  }
  return { ok: true, value: rows }
}

export function normalizeField(key: string, raw: unknown): FieldResult {
  const def = FIELD_BY_KEY[key]
  if (!def) return { ok: false, error: 'Campo desconhecido.' }
  const label = def.label
  if (raw == null || raw === '') return { ok: true, value: null }
  const kind = FIELD_INPUT[key]
  if (kind === 'list') return normalizeList(key, raw, label)
  switch (key) {
    case 'cnpj': case 'empresaCnpj': { const c = digits(raw); return cnpjOk(c) ? { ok: true, value: c } : { ok: false, error: `${label} inválido.` } }
    case 'dataNascimento': case 'conjugeDataNascimento': return date(raw, 16, 110, label)
    case 'dataFundacao': return date(raw, 0, 200, label)
    case 'rgDataEmissao': return date(raw, 0, 100, label)
    case 'dataAdmissao': return date(raw, 0, 70, label)
    case 'occupation': return OCUPACAO_DB.includes(String(raw)) ? { ok: true, value: raw } : { ok: false, error: `${label}: opção inválida.` }
    case 'email': { const e = text(raw).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? { ok: true, value: e } : { ok: false, error: 'E-mail inválido.' } }
    case 'tempoResidenciaMeses': case 'tempoEmpregoMeses': { const n = Math.trunc(Number(raw)); return n >= 0 && n < 1200 ? { ok: true, value: n } : { ok: false, error: `${label}: informe em meses.` } }
  }
  switch (kind) {
    case 'cpf': { const c = digits(raw); return isValidCPF(c) ? { ok: true, value: c } : { ok: false, error: `${label} inválido.` } }
    case 'money': return money(raw, label, ['capitalSocial', 'faturamentoAnual'].includes(key) ? 99_999_999_999_999 : 999_999_999_999)
    case 'phone': return phone(raw, label)
    case 'cep': { const c = digits(raw); return c.length === 8 ? { ok: true, value: c } : { ok: false, error: `${label} inválido.` } }
    case 'uf': { const u = text(raw, 2).toUpperCase(); return /^[A-Z]{2}$/.test(u) ? { ok: true, value: u } : { ok: false, error: `${label} inválida.` } }
    case 'int': return int(raw, label, key === 'dependentes' ? 30 : 1_000_000)
    case 'percent': return percent(raw, label)
    case 'select': return (SELECT_OPTIONS[key] ?? []).some((o) => o.value === raw) ? { ok: true, value: raw } : { ok: false, error: `${label}: opção inválida.` }
  }
  const t = text(raw)
  return t.length >= (SHORT_OK.has(key) ? 1 : 2) ? { ok: true, value: t } : { ok: false, error: `${label}: muito curto.` }
}

/** Meses entre uma data e hoje (para derivar "tempo no emprego" da admissão). */
export function monthsSince(d: Date): number {
  const now = new Date()
  return Math.max(0, (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + now.getUTCMonth() - d.getUTCMonth())
}
