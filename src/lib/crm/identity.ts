// =============================================================================
// CRM F2 — Identidade: normalização (CPF/telefone/e-mail) + similaridade de nome.
// Funções PURAS (sem I/O) para ficarem 100% testadas. A resolução de identidade
// contra o banco fica em dedup.ts. Reusa o validador de CPF de br-docs.
// =============================================================================

import { normalizeCPF, isValidCPF } from '@/lib/br-docs/cpf'

/** CPF só dígitos (11) ou '' — sem validar DV. */
export function normCpf(value: string | null | undefined): string {
  return normalizeCPF(value ?? '')
}

/** CPF válido (11 dígitos + DV corretos)? */
export function isValidCpf(value: string | null | undefined): boolean {
  return isValidCPF(value ?? '')
}

/**
 * Telefone normalizado (Brasil): só dígitos, sem o 55 do país e sem o 0 de DDD.
 * Retorna o número nacional (10 ou 11 dígitos) ou null se inválido.
 */
export function normPhone(value: string | null | undefined): string | null {
  let d = String(value ?? '').replace(/\D/g, '')
  if (!d) return null
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2) // tira DDI 55
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length < 10) return null
  return d.slice(-11) // no máx. DDD(2)+9 dígitos
}

/** Últimos 8 dígitos do telefone (chave de comparação robusta a DDI/0). */
export function phoneKey(value: string | null | undefined): string | null {
  const d = String(value ?? '').replace(/\D/g, '')
  return d.length >= 8 ? d.slice(-8) : null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** E-mail normalizado (trim + minúsculo) ou null se formato inválido. */
export function normEmail(value: string | null | undefined): string | null {
  const e = String(value ?? '').trim().toLowerCase()
  return EMAIL_RE.test(e) ? e : null
}

/** Nome normalizado p/ comparação: minúsculo, sem acento, tokens ordenados. */
export function normName(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean).sort().join(' ')
}

/** Similaridade de nome 0..1 (Jaccard de tokens). Só p/ SOFT match. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ta = new Set(normName(a).split(' ').filter(Boolean))
  const tb = new Set(normName(b).split(' ').filter(Boolean))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / (ta.size + tb.size - inter)
}

/** Chave de idempotência de integração: source + externalLeadId (canônica). */
export function externalKey(source: string | null | undefined, externalLeadId: string | null | undefined): string | null {
  const s = String(source ?? '').trim().toUpperCase()
  const e = String(externalLeadId ?? '').trim()
  return s && e ? `${s}:${e}` : null
}
