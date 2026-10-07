// =============================================================================
// F&I — normalização/validação de UM campo da ficha universal (PURO).
// Usado no preenchimento progressivo ("Precisamos de mais 2 informações…").
// =============================================================================

import { isValidCPF } from '@/lib/br-docs/cpf'
import { FIELD_BY_KEY } from './fields-core'

export type FieldResult = { ok: true; value: unknown } | { ok: false; error: string }

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const text = (v: unknown, max = 160) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)

function cnpjOk(c: string): boolean {
  if (!/^\d{14}$/.test(c) || /^(\d)\1+$/.test(c)) return false
  const calc = (base: string, w: number[]) => { const s = base.split('').reduce((a, d, i) => a + Number(d) * w[i], 0) % 11; return s < 2 ? 0 : 11 - s }
  const d1 = calc(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = calc(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return c.endsWith(`${d1}${d2}`)
}

function date(v: unknown, min: number, max: number, label: string): FieldResult {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? ''))
  if (!m) return { ok: false, error: `${label}: data inválida.` }
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`)
  const years = (Date.now() - d.getTime()) / (365.25 * 86_400_000)
  if (Number.isNaN(d.getTime()) || years < min || years > max) return { ok: false, error: `${label}: data fora do esperado.` }
  return { ok: true, value: d }
}

function money(v: unknown, label: string): FieldResult {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) return { ok: false, error: `${label}: valor inválido.` }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

const ESTADO_CIVIL = ['SOLTEIRO', 'CASADO', 'UNIAO_ESTAVEL', 'DIVORCIADO', 'VIUVO', 'SEPARADO']
const RESIDENCIA = ['PROPRIA', 'ALUGADA', 'FAMILIAR', 'FINANCIADA', 'OUTRA']
const OCUPACAO = ['AUTONOMO', 'CLT', 'EMPRESARIO', 'APOSENTADO_PENSIONISTA']

export const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  estadoCivil: [
    { value: 'SOLTEIRO', label: 'Solteiro(a)' }, { value: 'CASADO', label: 'Casado(a)' }, { value: 'UNIAO_ESTAVEL', label: 'União estável' },
    { value: 'DIVORCIADO', label: 'Divorciado(a)' }, { value: 'VIUVO', label: 'Viúvo(a)' }, { value: 'SEPARADO', label: 'Separado(a)' },
  ],
  tipoResidencia: [
    { value: 'PROPRIA', label: 'Própria' }, { value: 'ALUGADA', label: 'Alugada' }, { value: 'FAMILIAR', label: 'Com a família' },
    { value: 'FINANCIADA', label: 'Financiada' }, { value: 'OUTRA', label: 'Outra' },
  ],
  occupation: [
    { value: 'CLT', label: 'Assalariado (CLT)' }, { value: 'AUTONOMO', label: 'Autônomo' },
    { value: 'EMPRESARIO', label: 'Empresário' }, { value: 'APOSENTADO_PENSIONISTA', label: 'Aposentado / pensionista' },
  ],
}

/** Tipo de entrada para a tela montar o campo certo. */
export const FIELD_INPUT: Record<string, 'text' | 'cpf' | 'cnpj' | 'date' | 'money' | 'phone' | 'email' | 'cep' | 'uf' | 'months' | 'select' | 'list'> = {
  cpf: 'cpf', representanteCpf: 'cpf', cnpj: 'cnpj', dataNascimento: 'date', dataFundacao: 'date', renda: 'money', faturamentoMensal: 'money',
  celular: 'phone', email: 'email', cep: 'cep', estado: 'uf', tempoResidenciaMeses: 'months', tempoEmpregoMeses: 'months',
  estadoCivil: 'select', tipoResidencia: 'select', occupation: 'select', socios: 'list', referencias: 'list', outrasRendas: 'list',
}

export function normalizeField(key: string, raw: unknown): FieldResult {
  const def = FIELD_BY_KEY[key]
  if (!def) return { ok: false, error: 'Campo desconhecido.' }
  const label = def.label
  if (raw == null || raw === '') return { ok: true, value: null }
  switch (key) {
    case 'cpf': case 'representanteCpf': { const c = digits(raw); return isValidCPF(c) ? { ok: true, value: c } : { ok: false, error: `${label} inválido.` } }
    case 'cnpj': { const c = digits(raw); return cnpjOk(c) ? { ok: true, value: c } : { ok: false, error: 'CNPJ inválido.' } }
    case 'dataNascimento': return date(raw, 16, 110, label)
    case 'dataFundacao': return date(raw, 0, 200, label)
    case 'renda': case 'faturamentoMensal': return money(raw, label)
    case 'celular': { const p = digits(raw); return p.length >= 10 && p.length <= 13 ? { ok: true, value: p } : { ok: false, error: 'Celular inválido (com DDD).' } }
    case 'email': { const e = text(raw).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? { ok: true, value: e } : { ok: false, error: 'E-mail inválido.' } }
    case 'cep': { const c = digits(raw); return c.length === 8 ? { ok: true, value: c } : { ok: false, error: 'CEP inválido.' } }
    case 'estado': { const u = text(raw, 2).toUpperCase(); return /^[A-Z]{2}$/.test(u) ? { ok: true, value: u } : { ok: false, error: 'UF inválida.' } }
    case 'tempoResidenciaMeses': case 'tempoEmpregoMeses': { const n = Math.trunc(Number(raw)); return n >= 0 && n < 1200 ? { ok: true, value: n } : { ok: false, error: `${label}: informe em meses.` } }
    case 'estadoCivil': return ESTADO_CIVIL.includes(String(raw)) ? { ok: true, value: raw } : { ok: false, error: `${label}: opção inválida.` }
    case 'tipoResidencia': return RESIDENCIA.includes(String(raw)) ? { ok: true, value: raw } : { ok: false, error: `${label}: opção inválida.` }
    case 'occupation': return OCUPACAO.includes(String(raw)) ? { ok: true, value: raw } : { ok: false, error: `${label}: opção inválida.` }
    case 'socios': case 'referencias': case 'outrasRendas': {
      if (!Array.isArray(raw)) return { ok: false, error: `${label}: lista inválida.` }
      const list = raw.slice(0, 10).map((x) => (x && typeof x === 'object' ? Object.fromEntries(Object.entries(x as Record<string, unknown>).slice(0, 6).map(([k, v]) => [k.slice(0, 30), text(v, 120)])) : null)).filter(Boolean)
      return { ok: true, value: list }
    }
    default: {
      const t = text(raw)
      return t.length >= 2 ? { ok: true, value: t } : { ok: false, error: `${label}: muito curto.` }
    }
  }
}
