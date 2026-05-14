// =============================================================================
// Parser de valores monetários.
// Aceita formatos:
// - "1.500,00"  → 1500
// - "R$ 1.500,00" → 1500
// - "1500.00"  → 1500
// - "1,500.00" → 1500
// - 1500       → 1500
// =============================================================================

export function parseCurrency(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  let raw = String(value).trim()

  if (!raw) return null

  const isNegative = raw.includes('-')

  // Mantém apenas números, ponto e vírgula.
  raw = raw.replace(/[^\d.,]/g, '')

  if (!raw) return null

  const lastComma = raw.lastIndexOf(',')
  const lastDot = raw.lastIndexOf('.')

  let decimalSeparator: ',' | '.' | null = null

  if (lastComma >= 0 && lastDot >= 0) {
    // O separador decimal normalmente é o último entre vírgula e ponto.
    decimalSeparator = lastComma > lastDot ? ',' : '.'
  } else if (lastComma >= 0) {
    decimalSeparator = ','
  } else if (lastDot >= 0) {
    const digitsAfterDot = raw.length - lastDot - 1
    // Se tiver 1 ou 2 dígitos após o ponto, trata como decimal.
    // Se tiver 3, provavelmente é separador de milhar em pt-BR.
    decimalSeparator = digitsAfterDot <= 2 ? '.' : null
  }

  let normalized: string

  if (decimalSeparator) {
    const sepIndex = raw.lastIndexOf(decimalSeparator)
    const integerPart = raw.slice(0, sepIndex).replace(/[^\d]/g, '')
    const decimalPart = raw.slice(sepIndex + 1).replace(/[^\d]/g, '')
    normalized = `${integerPart || '0'}.${decimalPart || '0'}`
  } else {
    normalized = raw.replace(/[^\d]/g, '')
  }

  const n = Number.parseFloat(normalized)

  if (!Number.isFinite(n)) return null

  return isNegative ? -n : n
}

export function requireCurrency(value: unknown, fieldName: string): number {
  const parsed = parseCurrency(value)

  if (parsed === null) {
    throw new Error(
      `[validation] Campo '${fieldName}' inválido. Valor recebido: ${JSON.stringify(value)}`,
    )
  }

  return parsed
}
