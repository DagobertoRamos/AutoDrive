// =============================================================================
// masks.ts — Máscaras de input reutilizáveis em todo o sistema
//
// Princípio: o usuário digita apenas dígitos; a máscara monta a formatação
// crescendo da direita para a esquerda. Isso resolve naturalmente todos os
// "níveis" sem `if` específico:
//   "1"       → R$ 0,01
//   "100"     → R$ 1,00
//   "1234"    → R$ 12,34
//   "123456"  → R$ 1.234,56
//   "12345678"→ R$ 123.456,78
//   ...        (cresce indefinidamente com separadores de milhar)
//
// Convenções:
//   maskBRL / parseBRL  → valores monetários (centavos como menor unidade)
//   maskKM  / parseKM   → quilometragem (inteiro com separador de milhar)
//   maskCPF, maskCNPJ, maskPhone, maskCEP, maskPlate → documentos brasileiros
// =============================================================================

// ── Moeda BRL ────────────────────────────────────────────────────────────────

/**
 * Máscara monetária "inteligente" — formata sempre o input em centavos
 * como moeda brasileira, sem o prefixo R$ (use `R$ {maskBRL(v)}` no JSX).
 * Funciona da direita pra esquerda — não precisa saber a "ordem" do valor.
 */
export function maskBRL(value: string | number | null | undefined): string {
  if (value == null || value === '') return ''
  const digits = String(value).replace(/\D/g, '')
  if (!digits) return ''
  const cents = parseInt(digits, 10)
  if (!Number.isFinite(cents)) return ''
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Parser inverso da máscara BRL — retorna número (em reais) ou null.
 */
export function parseBRL(value: string | null | undefined): number | null {
  if (!value) return null
  const cleaned = String(value).replace(/[^\d,.-]/g, '')
  if (!cleaned) return null
  // Remove separadores de milhar (.) e troca vírgula decimal por ponto
  const normalized = cleaned.replace(/\./g, '').replace(',', '.')
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : null
}

/**
 * Formata um número como BRL (R$ 1.234,56) — usado para exibição (read-only).
 */
export function formatBRL(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// ── Quilometragem (KM) ───────────────────────────────────────────────────────

/**
 * Máscara de quilometragem — inteiro com separador de milhar.
 *   "1"        → "1"
 *   "12"       → "12"
 *   "123"      → "123"
 *   "1234"     → "1.234"
 *   "12345"    → "12.345"
 *   "123456"   → "123.456"
 *   "1234567"  → "1.234.567"
 */
export function maskKM(value: string | number | null | undefined): string {
  if (value == null || value === '') return ''
  const digits = String(value).replace(/\D/g, '')
  if (!digits) return ''
  const n = parseInt(digits, 10)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('pt-BR')
}

/**
 * Parser de KM mascarada — retorna inteiro ou null.
 */
export function parseKM(value: string | null | undefined): number | null {
  if (!value) return null
  const digits = String(value).replace(/\D/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : null
}

// ── Documentos brasileiros ───────────────────────────────────────────────────

export function maskCPF(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

export function maskCNPJ(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5')
}

export function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) {
    return d
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return d
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
}

export function maskCEP(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8)
  return d.replace(/(\d{5})(\d)/, '$1-$2')
}

/**
 * Placa Mercosul ou padrão antigo. Aceita ambos. Não força hífen quando o
 * usuário ainda está digitando para não atrapalhar.
 */
export function maskPlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
}

// ── Inteiros genéricos (parcelas, anos, doors, etc.) ─────────────────────────

export function maskInt(value: string | number | null | undefined, maxDigits = 10): string {
  if (value == null || value === '') return ''
  return String(value).replace(/\D/g, '').slice(0, maxDigits)
}

export function parseInt10(value: string | null | undefined): number | null {
  if (!value) return null
  const digits = String(value).replace(/\D/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : null
}
