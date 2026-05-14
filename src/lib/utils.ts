import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, isValid } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// =============================================================================
// TAILWIND — Merge de classes condicionais
// =============================================================================

/**
 * Combina classes Tailwind de forma segura, resolvendo conflitos automaticamente.
 * @example cn('px-2 py-1', condition && 'bg-blue-500', 'text-sm')
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// =============================================================================
// FORMATAÇÃO MONETÁRIA
// =============================================================================

/**
 * Formata um número como moeda brasileira (BRL).
 * @example formatMoney(1234.56) => "R$ 1.234,56"
 * @example formatMoney(0) => "R$ 0,00"
 */
export function formatMoney(
  value: number | string | null | undefined,
  options?: { symbol?: boolean; decimals?: number }
): string {
  const { symbol = true, decimals = 2 } = options ?? {}

  const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : (value ?? 0)

  if (isNaN(num)) return symbol ? 'R$ 0,00' : '0,00'

  const formatted = new Intl.NumberFormat('pt-BR', {
    style: symbol ? 'currency' : 'decimal',
    currency: 'BRL',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)

  return formatted
}

/**
 * Converte uma string de moeda BRL de volta para número.
 * @example parseMoney("R$ 1.234,56") => 1234.56
 */
export function parseMoney(value: string): number {
  const cleaned = value.replace(/[R$\s.]/g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

// =============================================================================
// FORMATAÇÃO DE DATA E HORA
// =============================================================================

type DateInput = string | Date | number | null | undefined

/**
 * Formata uma data para exibição no padrão brasileiro.
 * @example formatDate(new Date()) => "09/05/2026"
 * @example formatDate('2026-05-09', 'long') => "9 de maio de 2026"
 * @example formatDate('2026-05-09T10:30:00', 'datetime') => "09/05/2026 10:30"
 */
export function formatDate(
  date: DateInput,
  style: 'short' | 'long' | 'datetime' | 'time' | 'relative' | string = 'short'
): string {
  if (!date) return '—'

  let dateObj: Date

  if (typeof date === 'string') {
    dateObj = date.includes('T') ? parseISO(date) : parseISO(date + 'T00:00:00')
  } else if (typeof date === 'number') {
    dateObj = new Date(date)
  } else {
    dateObj = date
  }

  if (!isValid(dateObj)) return '—'

  const formatMap: Record<string, string> = {
    short: 'dd/MM/yyyy',
    long: "d 'de' MMMM 'de' yyyy",
    datetime: 'dd/MM/yyyy HH:mm',
    datetimeFull: "dd/MM/yyyy 'às' HH:mm:ss",
    time: 'HH:mm',
    timeFull: 'HH:mm:ss',
    monthYear: 'MMMM yyyy',
    dayMonth: "d 'de' MMMM",
  }

  const formatStr = formatMap[style] ?? style

  return format(dateObj, formatStr, { locale: ptBR })
}

/**
 * Retorna uma string de tempo relativo humanizado.
 * @example formatRelativeTime(new Date(Date.now() - 60000)) => "há 1 minuto"
 */
export function formatRelativeTime(date: DateInput): string {
  if (!date) return '—'

  const dateObj =
    typeof date === 'string'
      ? parseISO(date)
      : typeof date === 'number'
      ? new Date(date)
      : date

  if (!isValid(dateObj)) return '—'

  const now = new Date()
  const diffMs = now.getTime() - dateObj.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHrs = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHrs / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)
  const diffYears = Math.floor(diffDays / 365)

  if (diffSec < 60) return 'agora mesmo'
  if (diffMin < 60) return `há ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`
  if (diffHrs < 24) return `há ${diffHrs} ${diffHrs === 1 ? 'hora' : 'horas'}`
  if (diffDays < 7) return `há ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}`
  if (diffWeeks < 4) return `há ${diffWeeks} ${diffWeeks === 1 ? 'semana' : 'semanas'}`
  if (diffMonths < 12) return `há ${diffMonths} ${diffMonths === 1 ? 'mês' : 'meses'}`
  return `há ${diffYears} ${diffYears === 1 ? 'ano' : 'anos'}`
}

// =============================================================================
// FORMATAÇÃO DE DOCUMENTOS E CONTATOS
// =============================================================================

/**
 * Formata um número de telefone brasileiro.
 * Aceita 10 ou 11 dígitos (com ou sem DDD).
 * @example formatPhone('11987654321') => "(11) 98765-4321"
 * @example formatPhone('1134567890') => "(11) 3456-7890"
 * @example formatPhone('+5511987654321') => "(11) 98765-4321"
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'

  // Remove tudo que não for dígito
  const digits = phone.replace(/\D/g, '')

  // Remove DDI 55 se presente
  const normalized = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits

  if (normalized.length === 11) {
    // Celular: (XX) XXXXX-XXXX
    return normalized.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
  }

  if (normalized.length === 10) {
    // Fixo: (XX) XXXX-XXXX
    return normalized.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3')
  }

  if (normalized.length === 9) {
    // Celular sem DDD: XXXXX-XXXX
    return normalized.replace(/^(\d{5})(\d{4})$/, '$1-$2')
  }

  if (normalized.length === 8) {
    // Fixo sem DDD: XXXX-XXXX
    return normalized.replace(/^(\d{4})(\d{4})$/, '$1-$2')
  }

  return phone
}

/**
 * Remove a formatação de um telefone, retornando apenas dígitos.
 * @example cleanPhone("(11) 98765-4321") => "11987654321"
 */
export function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Formata um CPF.
 * @example formatCPF('12345678901') => "123.456.789-01"
 */
export function formatCPF(cpf: string | null | undefined): string {
  if (!cpf) return '—'

  const digits = cpf.replace(/\D/g, '')

  if (digits.length !== 11) return cpf

  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
}

/**
 * Formata um CNPJ.
 * @example formatCNPJ('12345678000190') => "12.345.678/0001-90"
 */
export function formatCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return '—'

  const digits = cnpj.replace(/\D/g, '')

  if (digits.length !== 14) return cnpj

  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

/**
 * Formata CPF ou CNPJ automaticamente com base no tamanho.
 * @example formatDocument('12345678901') => "123.456.789-01"
 * @example formatDocument('12345678000190') => "12.345.678/0001-90"
 */
export function formatDocument(doc: string | null | undefined): string {
  if (!doc) return '—'

  const digits = doc.replace(/\D/g, '')

  if (digits.length === 11) return formatCPF(digits)
  if (digits.length === 14) return formatCNPJ(digits)

  return doc
}

// =============================================================================
// VALIDAÇÕES
// =============================================================================

/**
 * Valida um CPF brasileiro.
 */
export function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '')

  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i)
  }
  let remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0
  if (remainder !== parseInt(digits[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i)
  }
  remainder = (sum * 10) % 11
  if (remainder === 10 || remainder === 11) remainder = 0

  return remainder === parseInt(digits[10])
}

/**
 * Valida um CNPJ brasileiro.
 */
export function isValidCNPJ(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '')

  if (digits.length !== 14) return false
  if (/^(\d)\1{13}$/.test(digits)) return false

  const calcDigit = (digits: string, length: number): number => {
    let sum = 0
    let pos = length - 7
    for (let i = length; i >= 1; i--) {
      sum += parseInt(digits[length - i]) * pos--
      if (pos < 2) pos = 9
    }
    const result = sum % 11
    return result < 2 ? 0 : 11 - result
  }

  const firstDigit = calcDigit(digits, 12)
  if (firstDigit !== parseInt(digits[12])) return false

  const secondDigit = calcDigit(digits, 13)
  return secondDigit === parseInt(digits[13])
}

// =============================================================================
// UTILITÁRIOS GERAIS
// =============================================================================

/**
 * Trunca um texto no tamanho especificado, adicionando reticências.
 * @example truncate('Texto muito longo', 10) => "Texto muit..."
 */
export function truncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd() + '...'
}

/**
 * Capitaliza a primeira letra de cada palavra.
 * @example titleCase('JOÃO DA SILVA') => "João Da Silva"
 */
export function titleCase(str: string): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Gera um ID único simples (não criptográfico).
 */
export function generateId(prefix?: string): string {
  const id = Math.random().toString(36).slice(2, 11) + Date.now().toString(36)
  return prefix ? `${prefix}_${id}` : id
}

/**
 * Remove acentos de uma string (útil para buscas e slugs).
 * @example removeAccents('Ação') => "Acao"
 */
export function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Gera um slug a partir de uma string.
 * @example slugify('EasyCar Sistema') => "easycar-sistema"
 */
export function slugify(str: string): string {
  return removeAccents(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/**
 * Verifica se uma string é uma URL válida.
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Retorna as iniciais de um nome (máximo 2 letras).
 * @example getInitials('João da Silva') => "JS"
 * @example getInitials('Maria') => "MA"
 */
export function getInitials(name: string): string {
  if (!name) return '?'

  const parts = name.trim().split(/\s+/)

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Formata bytes para tamanho legível.
 * @example formatBytes(1024) => "1 KB"
 * @example formatBytes(1048576) => "1 MB"
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

/**
 * Aguarda N milissegundos (útil para animações e debounce manual).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Agrupa um array por uma chave.
 * @example groupBy(users, 'role') => { admin: [...], user: [...] }
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce(
    (groups, item) => {
      const groupKey = String(item[key])
      if (!groups[groupKey]) {
        groups[groupKey] = []
      }
      groups[groupKey].push(item)
      return groups
    },
    {} as Record<string, T[]>
  )
}

/**
 * Remove duplicatas de um array com base em uma chave.
 */
export function uniqueBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set()
  return array.filter((item) => {
    const val = item[key]
    if (seen.has(val)) return false
    seen.add(val)
    return true
  })
}
