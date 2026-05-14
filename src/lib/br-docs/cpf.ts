// =============================================================================
// Utilitários de CPF brasileiro
//
// Formato visual: XXX.XXX.XXX-XX
// Formato normalizado: 11 dígitos sem pontuação
//
// Todas as funções aceitam `unknown` com segurança.
// =============================================================================

/**
 * Remove tudo que não for dígito e limita a 11 caracteres.
 *
 * @example
 * normalizeCPF("123.456.789-09") → "12345678909"
 * normalizeCPF(null)              → ""
 */
export function normalizeCPF(value: unknown): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 11)
}

/**
 * Aplica máscara de exibição: XXX.XXX.XXX-XX
 * Aceita entrada parcial durante a digitação.
 *
 * @example
 * formatCPF("12345678909") → "123.456.789-09"
 * formatCPF("123")         → "123"
 */
export function formatCPF(value: unknown): string {
  const d = normalizeCPF(value)
  if (d.length <= 3)  return d
  if (d.length <= 6)  return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9)  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/**
 * Aplica máscara em tempo real (alias semântico de formatCPF).
 */
export function maskCPFInput(value: unknown): string {
  return formatCPF(value)
}

/**
 * Verifica se o CPF é matematicamente válido.
 *
 * Regras:
 * 1. Exatamente 11 dígitos.
 * 2. Não pode ser sequência de dígitos iguais.
 * 3. Dígitos verificadores calculados corretamente.
 *
 * @example
 * isValidCPF("12345678909") → true
 * isValidCPF("00000000000") → false
 * isValidCPF("12345678900") → false
 */
export function isValidCPF(value: unknown): boolean {
  const digits = normalizeCPF(value)

  if (digits.length !== 11) return false

  // Rejeita sequências repetidas
  if (/^(\d)\1{10}$/.test(digits)) return false

  const calc = (d: string, len: number): number => {
    let sum = 0
    for (let i = 0; i < len; i++) {
      sum += Number(d[i]) * (len + 1 - i)
    }
    const rem = (sum * 10) % 11
    return rem === 10 || rem === 11 ? 0 : rem
  }

  if (Number(digits[9])  !== calc(digits, 9))  return false
  if (Number(digits[10]) !== calc(digits, 10)) return false

  return true
}

/**
 * Retorna true se o CPF tiver os 11 dígitos (pode ser inválido matematicamente).
 */
export function isCPFComplete(value: unknown): boolean {
  return normalizeCPF(value).length === 11
}
