// =============================================================================
// Utilitários de CEP brasileiro
//
// Formato visual: XXXXX-XXX
// Formato normalizado: 8 dígitos sem pontuação
// =============================================================================

/**
 * Remove tudo que não for dígito e limita a 8 caracteres.
 *
 * @example
 * normalizeCEP("06000-000") → "06000000"
 * normalizeCEP(null)         → ""
 */
export function normalizeCEP(value: unknown): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 8)
}

/**
 * Aplica máscara de exibição: XXXXX-XXX
 *
 * @example
 * formatCEP("06000000") → "06000-000"
 * formatCEP("060")      → "060"
 */
export function formatCEP(value: unknown): string {
  const d = normalizeCEP(value)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

/**
 * Aplica máscara em tempo real (alias semântico de formatCEP).
 */
export function maskCEPInput(value: unknown): string {
  return formatCEP(value)
}

/**
 * Valida se o CEP tem 8 dígitos e começa com número válido.
 * Validação básica — para validação completa, consultar a API de CEP.
 *
 * @example
 * isValidCEP("06000000") → true
 * isValidCEP("00000000") → false (CEP reservado)
 * isValidCEP("1234")     → false (incompleto)
 */
export function isValidCEP(value: unknown): boolean {
  const d = normalizeCEP(value)
  if (d.length !== 8) return false
  if (/^0+$/.test(d)) return false // 00000000 é inválido
  return true
}

/**
 * Retorna true se o CEP tiver os 8 dígitos.
 */
export function isCEPComplete(value: unknown): boolean {
  return normalizeCEP(value).length === 8
}
