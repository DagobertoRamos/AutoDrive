// =============================================================================
// Utilitários de telefone/celular brasileiro
//
// Celular: (XX) XXXXX-XXXX  — 11 dígitos
// Fixo:    (XX) XXXX-XXXX   — 10 dígitos
// =============================================================================

/**
 * Remove tudo que não for dígito e limita a 11 caracteres.
 *
 * @example
 * normalizePhone("(11) 99999-9999") → "11999999999"
 * normalizePhone(null)               → ""
 */
export function normalizePhone(value: unknown): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 11)
}

/**
 * Aplica máscara dinâmica:
 * - 10 dígitos → (XX) XXXX-XXXX  (fixo)
 * - 11 dígitos → (XX) XXXXX-XXXX (celular)
 *
 * @example
 * formatPhone("11999999999")  → "(11) 99999-9999"
 * formatPhone("1133334444")   → "(11) 3333-4444"
 * formatPhone("119")          → "(11) 9"
 */
export function formatPhone(value: unknown): string {
  const d = normalizePhone(value)
  if (d.length === 0)  return ''
  if (d.length <= 2)   return `(${d}`
  if (d.length <= 6)   return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10)  return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/**
 * Aplica máscara em tempo real (alias semântico de formatPhone).
 */
export function maskPhoneInput(value: unknown): string {
  return formatPhone(value)
}

/**
 * Verifica se é um celular válido (começa com 9 após o DDD, 11 dígitos).
 */
export function isValidMobile(value: unknown): boolean {
  const d = normalizePhone(value)
  if (d.length !== 11) return false
  return d[2] === '9'
}

/**
 * Verifica se é um telefone válido (fixo ou celular, 10 ou 11 dígitos).
 */
export function isValidPhone(value: unknown): boolean {
  const d = normalizePhone(value)
  return d.length === 10 || d.length === 11
}
