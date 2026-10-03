// =============================================================================
// Cadastro rápido de cliente (Avaliação) — máscaras e validação PURAS,
// compartilhadas entre o formulário (StepCliente) e a rota
// POST /api/customers/quick-create. PF/PJ é decidido pelo nº de dígitos.
// =============================================================================

import { isValidCPF } from '@/lib/br-docs/cpf'
import { isValidCNPJ } from '@/lib/br-docs/cnpj'

export interface QuickCustomerInput {
  name?:        string | null
  doc?:         string | null
  /** dd/mm/aaaa — nascimento (PF) ou fundação (PJ) */
  birthDate?:   string | null
  /** RG (PF) ou Inscrição estadual (PJ; aceita "ISENTO") */
  regDoc?:      string | null
  email?:       string | null
  phone?:       string | null
  cep?:         string | null
  logradouro?:  string | null
  numero?:      string | null
  complemento?: string | null
  bairro?:      string | null
  cidade?:      string | null
  estado?:      string | null
}

export const onlyDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

export function docKind(doc: unknown): 'PF' | 'PJ' {
  return onlyDigits(doc).length > 11 ? 'PJ' : 'PF'
}

/** CPF enquanto ≤ 11 dígitos; CNPJ acima disso. */
export function maskDoc(v: unknown): string {
  const d = onlyDigits(v).slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
  }
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5')
}

/** Celular (xx)x.xxxx-xxxx · fixo (xx)xxxx-xxxx */
export function maskPhoneQuick(v: unknown): string {
  const d = onlyDigits(v).slice(0, 11)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  const ddd = `(${d.slice(0, 2)})`
  const r = d.slice(2)
  if (d.length === 11) return `${ddd}${r[0]}.${r.slice(1, 5)}-${r.slice(5)}`
  if (r.length <= 4) return `${ddd}${r}`
  return `${ddd}${r.slice(0, 4)}-${r.slice(4)}`
}

/** dd/mm/aaaa */
export function maskDateBR(v: unknown): string {
  const d = onlyDigits(v).slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

export function maskCepQuick(v: unknown): string {
  const d = onlyDigits(v).slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/** "aaaa-mm-dd" → "dd/mm/aaaa" (ex.: data de abertura da BrasilAPI). */
export function isoToBR(iso: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''))
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/**
 * dd/mm/aaaa → "aaaa-mm-dd" se for data real, não futura e ≥ 1800.
 * `today` injetável para teste.
 */
export function parseDateBR(v: unknown, today: Date = new Date()): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v ?? '').trim())
  if (!m) return null
  const dd = Number(m[1]), mm = Number(m[2]), yy = Number(m[3])
  if (yy < 1800 || mm < 1 || mm > 12 || dd < 1) return null
  const dt = new Date(Date.UTC(yy, mm - 1, dd))
  if (dt.getUTCFullYear() !== yy || dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) return null
  const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  if (dt.getTime() > todayUTC) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const UFS = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])

export const isValidEmail = (v: unknown) => EMAIL_RE.test(String(v ?? '').trim())

function isValidQuickPhone(v: unknown): boolean {
  const d = onlyDigits(v)
  if (d.length === 11) return d[2] === '9'
  return d.length === 10
}

/** Retorna a 1ª mensagem de erro (curta) ou null se tudo certo. */
export function validateQuickCustomer(i: QuickCustomerInput, today: Date = new Date()): string | null {
  const doc = onlyDigits(i.doc)
  const pj = docKind(doc) === 'PJ'
  const t = (v: unknown) => String(v ?? '').trim()

  if (t(i.name).length < 3) return pj ? 'Informe a razão social.' : 'Informe o nome completo.'
  if (!pj && t(i.name).split(/\s+/).length < 2) return 'Informe o nome completo.'
  if (!doc) return 'Informe o CPF ou CNPJ.'
  if (doc.length === 11) { if (!isValidCPF(doc)) return 'CPF inválido.' }
  else if (doc.length === 14) { if (!isValidCNPJ(doc)) return 'CNPJ inválido.' }
  else return 'CPF/CNPJ incompleto.'
  if (!t(i.birthDate)) return pj ? 'Informe a data de fundação.' : 'Informe a data de nascimento.'
  if (!parseDateBR(i.birthDate, today)) return pj ? 'Data de fundação inválida.' : 'Data de nascimento inválida.'
  const reg = t(i.regDoc)
  if (pj) {
    if (!reg) return 'Informe a inscrição estadual.'
    if (reg.toUpperCase() !== 'ISENTO' && !/^[0-9A-Za-z.\-/ ]{2,20}$/.test(reg)) return 'Inscrição estadual inválida.'
  } else {
    if (!reg) return 'Informe o RG.'
    if (!/^[0-9A-Za-z.\-/ ]{3,20}$/.test(reg)) return 'RG inválido.'
  }
  if (!t(i.email)) return 'Informe o e-mail.'
  if (!isValidEmail(i.email)) return 'E-mail inválido.'
  if (!onlyDigits(i.phone)) return 'Informe o telefone.'
  if (!isValidQuickPhone(i.phone)) return 'Telefone inválido.'
  if (!onlyDigits(i.cep)) return 'Informe o CEP.'
  if (onlyDigits(i.cep).length !== 8) return 'CEP inválido.'
  if (!t(i.logradouro)) return 'Informe o logradouro.'
  if (!t(i.numero)) return 'Informe o número.'
  if (!t(i.bairro)) return 'Informe o bairro.'
  if (!t(i.cidade)) return 'Informe a cidade.'
  if (!UFS.has(t(i.estado).toUpperCase())) return 'Informe a UF.'
  return null
}
