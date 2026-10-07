// =============================================================================
// F&I — simulação do site (PURO). Etapa 1: valores (sem dado pessoal).
// Etapa 2: identificação mínima. A estimativa usa a taxa de REFERÊNCIA que a
// loja configurou e é sempre rotulada como estimativa — nunca como aprovação.
// =============================================================================

import { isValidCPF } from '@/lib/br-docs/cpf'

export interface SiteSimConfig { enabled: boolean; referenceRate: number | null; installmentsList: number[]; minDownPaymentPct: number }

export interface ValuesInput { vehicleValue: number; downPayment: number; installments: number }
export type Check<T> = { ok: true; value: T } | { ok: false; error: string }

const money = (v: unknown) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN }

export function parseValues(b: Record<string, unknown>, cfg: SiteSimConfig): Check<ValuesInput> {
  const vehicleValue = money(b.vehicleValue)
  const downPayment = money(b.downPayment ?? 0)
  const installments = Math.trunc(Number(b.installments))
  if (!(vehicleValue >= 5000 && vehicleValue <= 5_000_000)) return { ok: false, error: 'Informe o valor do veículo.' }
  if (!(downPayment >= 0) || downPayment >= vehicleValue) return { ok: false, error: 'A entrada precisa ser menor que o valor do veículo.' }
  if (cfg.minDownPaymentPct > 0 && downPayment < vehicleValue * (cfg.minDownPaymentPct / 100)) return { ok: false, error: `A entrada mínima é de ${cfg.minDownPaymentPct}% do valor do veículo.` }
  if (!(installments >= 6 && installments <= 84)) return { ok: false, error: 'Escolha a quantidade de parcelas.' }
  return { ok: true, value: { vehicleValue, downPayment, installments } }
}

export function priceInstallment(pv: number, ratePct: number, n: number): number {
  const i = ratePct / 100
  if (n <= 0) return 0
  if (i === 0) return Math.round((pv / n) * 100) / 100
  return Math.round(((pv * i) / (1 - Math.pow(1 + i, -n))) * 100) / 100
}

export interface Estimate { installments: number; installmentValue: number }

/** Estimativas por prazo (só quando a loja ligou e informou a taxa de referência). */
export function estimate(v: ValuesInput, cfg: SiteSimConfig): Estimate[] | null {
  if (!cfg.enabled || !cfg.referenceRate) return null
  const financed = v.vehicleValue - v.downPayment
  const terms = [...new Set([v.installments, ...cfg.installmentsList])].filter((n) => n >= 6 && n <= 84).sort((a, b) => a - b)
  return terms.map((n) => ({ installments: n, installmentValue: priceInstallment(financed, cfg.referenceRate!, n) }))
}

export interface IdentityInput { name: string; cpf: string; birthDate: Date; phone: string; email: string | null }

export function parseIdentity(b: Record<string, unknown>): Check<IdentityInput> {
  const name = String(b.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 120)
  const cpf = String(b.cpf ?? '').replace(/\D/g, '')
  const phone = String(b.phone ?? '').replace(/\D/g, '')
  const email = String(b.email ?? '').trim().toLowerCase().slice(0, 160)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b.birthDate ?? ''))
  if (name.split(' ').length < 2) return { ok: false, error: 'Informe o nome completo.' }
  if (!isValidCPF(cpf)) return { ok: false, error: 'CPF inválido.' }
  if (!m) return { ok: false, error: 'Informe a data de nascimento.' }
  const birthDate = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00.000Z`)
  const age = (Date.now() - birthDate.getTime()) / (365.25 * 86_400_000)
  if (!(age >= 18 && age <= 100)) return { ok: false, error: 'O financiamento exige maior de 18 anos.' }
  if (phone.length < 10 || phone.length > 13) return { ok: false, error: 'Informe um celular com DDD.' }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'E-mail inválido.' }
  if (b.consent !== true) return { ok: false, error: 'Para continuar, autorize o uso dos dados para a análise de crédito.' }
  return { ok: true, value: { name, cpf, birthDate, phone, email: email || null } }
}

export const SITE_ORIGIN_LABEL = 'SITE — SIMULAÇÃO DE FINANCIAMENTO'
