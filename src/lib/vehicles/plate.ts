// =============================================================================
// Utilitários de placa veicular brasileira
//
// Formatos suportados:
//   Antiga    — ABC-1234  (exibição) / ABC1234  (normalizado)
//   Mercosul  — ABC-1D23  (exibição) / ABC1D23  (normalizado)
//
// Regras:
//   • Sempre maiúsculo
//   • Sempre hífen após os 3 primeiros caracteres na exibição
//   • Normalizado: sem hífen, sem espaços, somente A-Z e 0-9
//   • Todas as funções aceitam `unknown` com segurança
// =============================================================================

/**
 * Remove todo caractere que não seja letra ou dígito, converte para
 * maiúsculas e limita a 7 caracteres (tamanho sem hífen).
 *
 * @example
 * normalizePlate("abc-1234") → "ABC1234"
 * normalizePlate("ABC1D23")  → "ABC1D23"
 * normalizePlate(null)        → ""
 */
export function normalizePlate(value: unknown): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 7)
}

/**
 * Verifica se é placa antiga: 3 letras + 4 dígitos
 * @example isOldPlate("ABC1234") → true
 */
export function isOldPlate(value: unknown): boolean {
  return /^[A-Z]{3}[0-9]{4}$/.test(normalizePlate(value))
}

/**
 * Verifica se é placa Mercosul: 3 letras + 1 dígito + 1 letra + 2 dígitos
 * @example isMercosulPlate("ABC1D23") → true
 */
export function isMercosulPlate(value: unknown): boolean {
  return /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(normalizePlate(value))
}

/**
 * Retorna true se a placa for válida (antiga ou Mercosul).
 */
export function isValidPlate(value: unknown): boolean {
  return isOldPlate(value) || isMercosulPlate(value)
}

/**
 * Formata para exibição: insere hífen após os 3 primeiros caracteres.
 * Funciona para placa antiga E Mercosul.
 *
 * @example
 * formatPlate("ABC1234") → "ABC-1234"
 * formatPlate("ABC1D23") → "ABC-1D23"
 * formatPlate("AB")      → "AB"
 */
export function formatPlate(value: unknown): string {
  const n = normalizePlate(value)
  if (n.length <= 3) return n
  return `${n.slice(0, 3)}-${n.slice(3)}`
}

/**
 * Aplica máscara em tempo real enquanto o usuário digita.
 * Remove o hífen digitado manualmente, normaliza e re-insere no lugar certo.
 * maxLength no input deve ser 8 (7 chars + 1 hífen).
 *
 * @example
 * maskPlateInput("abc1234")  → "ABC-1234"
 * maskPlateInput("ABC-1234") → "ABC-1234"
 * maskPlateInput("abc1d23")  → "ABC-1D23"
 * maskPlateInput("abc-1d23") → "ABC-1D23"
 * maskPlateInput("AB")       → "AB"
 */
export function maskPlateInput(raw: unknown): string {
  const normalized = normalizePlate(raw)   // strip hífen, uppercase, max 7
  if (normalized.length <= 3) return normalized
  return `${normalized.slice(0, 3)}-${normalized.slice(3)}`
}

/**
 * Retorna o tipo da placa.
 */
export function getPlateType(value: unknown): 'old' | 'mercosul' | 'invalid' {
  if (isOldPlate(value))      return 'old'
  if (isMercosulPlate(value)) return 'mercosul'
  return 'invalid'
}
