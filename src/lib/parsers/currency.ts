// =============================================================================
// currency.ts — Parser seguro para valores monetários
// Aceita formatos pt-BR (1.500,00), en-US (1500.00), com ou sem símbolo R$.
// Nunca retorna NaN — retorna null para valores inválidos.
// =============================================================================

/**
 * Converte qualquer representação de valor monetário para number.
 *
 * Exemplos aceitos:
 *   "1500"         → 1500
 *   "1500.00"      → 1500
 *   "1.500,00"     → 1500  (pt-BR)
 *   "R$ 1.500,00"  → 1500  (pt-BR com símbolo)
 *   "R$1.500,00"   → 1500
 *   77980.00       → 77980  (number passthrough)
 *   ""             → null
 *   null/undefined → null
 *   "abc"          → null
 *   "NaN"          → null
 */
export function parseCurrency(value: unknown): number | null {
  if (value == null || value === '') return null

  // Se já for um número válido, retornar diretamente
  if (typeof value === 'number') {
    return isNaN(value) ? null : value
  }

  const str = String(value)
    .trim()
    // Remove símbolo de moeda e espaços
    .replace(/R\$\s*/gi, '')
    .trim()

  if (!str) return null

  // Detecta se está no formato pt-BR: tem ponto como milhar E vírgula como decimal
  // Ex: "1.500,00" — ponto antes de vírgula
  const hasPtBrFormat = /^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(str)

  let normalized: string

  if (hasPtBrFormat) {
    // Remove pontos de milhar, troca vírgula por ponto
    normalized = str.replace(/\./g, '').replace(',', '.')
  } else if (str.includes(',') && !str.includes('.')) {
    // Apenas vírgula (sem ponto): trata como decimal pt-BR simples
    // Ex: "1500,00"
    normalized = str.replace(',', '.')
  } else {
    // Assume formato en-US ou número simples
    // Remove possível ponto de milhar mal-formatado se necessário
    normalized = str
  }

  const n = parseFloat(normalized)
  return isNaN(n) ? null : n
}

/**
 * Converte valor monetário — lança erro descritivo se inválido.
 * Use quando o campo é obrigatório e precisa de um valor numérico válido.
 *
 * @throws Error com mensagem amigável incluindo o nome do campo
 */
export function requireCurrency(value: unknown, fieldName: string): number {
  const n = parseCurrency(value)
  if (n === null) {
    throw new Error(
      `Campo '${fieldName}' com valor monetário inválido: "${String(value)}". Use o formato 1500.00 ou 1.500,00.`,
    )
  }
  return n
}

/**
 * Formata um number como moeda pt-BR.
 * Útil para logs e mensagens de erro.
 */
export function formatCurrencyBR(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style:    'currency',
    currency: 'BRL',
  }).format(value)
}
