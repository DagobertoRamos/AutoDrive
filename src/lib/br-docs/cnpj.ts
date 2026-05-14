// =============================================================================
// Utilitários de CNPJ brasileiro
//
// Formato visual: XX.XXX.XXX/XXXX-XX
// Formato normalizado: 14 dígitos sem pontuação
//
// Todas as funções aceitam `unknown` com segurança.
// =============================================================================

/**
 * Remove tudo que não for dígito e limita a 14 caracteres.
 *
 * @example
 * normalizeCNPJ("12.345.678/0001-90") → "12345678000190"
 * normalizeCNPJ(null)                  → ""
 */
export function normalizeCNPJ(value: unknown): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 14)
}

/**
 * Aplica máscara de exibição: XX.XXX.XXX/XXXX-XX
 * Aceita entrada parcial durante a digitação.
 *
 * @example
 * formatCNPJ("12345678000190") → "12.345.678/0001-90"
 * formatCNPJ("1234")           → "12.34"
 */
export function formatCNPJ(value: unknown): string {
  const d = normalizeCNPJ(value)
  if (d.length <= 2)  return d
  if (d.length <= 5)  return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8)  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/**
 * Aplica máscara em tempo real (para campos de input).
 * Alias semântico de formatCNPJ.
 */
export function maskCNPJInput(value: unknown): string {
  return formatCNPJ(value)
}

/**
 * Verifica se o CNPJ é matematicamente válido.
 *
 * Regras:
 * 1. Exatamente 14 dígitos.
 * 2. Não pode ser sequência de dígitos iguais (ex: 00000000000000).
 * 3. Dígitos verificadores calculados corretamente.
 *
 * @example
 * isValidCNPJ("11222333000181") → true
 * isValidCNPJ("00000000000000") → false
 * isValidCNPJ("12345678000199") → false (dígitos inválidos)
 */
export function isValidCNPJ(value: unknown): boolean {
  const digits = normalizeCNPJ(value)

  if (digits.length !== 14) return false

  // Rejeita sequências repetidas
  if (/^(\d)\1{13}$/.test(digits)) return false

  // Calcula e verifica o primeiro dígito verificador
  const calc = (d: string, weights: number[]): number => {
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0)
    const rem = sum % 11
    return rem < 2 ? 0 : 11 - rem
  }

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  const d1 = calc(digits, w1)
  if (Number(digits[12]) !== d1) return false

  const d2 = calc(digits, w2)
  if (Number(digits[13]) !== d2) return false

  return true
}

/**
 * Retorna true se o CNPJ tiver os 14 dígitos (pode ser inválido matematicamente).
 * Útil para verificar se o campo está "completo" antes de disparar validação.
 */
export function isCNPJComplete(value: unknown): boolean {
  return normalizeCNPJ(value).length === 14
}
