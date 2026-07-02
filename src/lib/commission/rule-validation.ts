import type { CommissionRuleType, UserRole } from '@prisma/client'

export const COMMISSION_RULE_TYPES = [
  'VENDA',
  'TROCA',
  'COMPRA',
  'GARANTIA',
  'RETORNO',
  'SERVICO',
  'DOCUMENTO',
  'BONUS_META',
  'BONUS_DEZENA',
  'EXCECAO',
] as const

export const COMMISSION_TYPES = [
  'PERCENTUAL',
  'FIXO',
  'ESCALONADA',
  'BONUS_QTD',
] as const

export const COMMISSION_ROLE_VALUES = [
  'MASTER',
  'ADM',
  'GERENTE_GERAL',
  'GERENTE_ADMINISTRATIVO',
  'GERENTE',
  'VENDEDOR_LIDER',
  'VENDEDOR',
  'FINANCEIRO',
  'USUARIO_LIDER',
  'USUARIO',
] as const

export type CommissionTypeValue = typeof COMMISSION_TYPES[number]

export interface NormalizedCommissionRuleData {
  name:           string
  description:    string | null
  ruleType:       CommissionRuleType
  commissionType: CommissionTypeValue
  role:           UserRole | null
  positionId:     string | null
  sellerId:       string | null
  managerId:      string | null
  unitId:         string | null
  serviceId:      string | null
  warrantyId:     string | null
  bank:           string | null
  fromQuantity:   number | null
  toQuantity:     number | null
  fromValue:      number | null
  toValue:        number | null
  fixedValue:     number | null
  percentage:     number | null
  priority:       number
  active:         boolean
  validFrom:      Date | null
  validUntil:     Date | null
  notes:          string | null
}

export class CommissionRuleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommissionRuleValidationError'
  }
}

function cleanText(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text : null
}

function cleanId(value: unknown): string | null {
  return cleanText(value)
}

function parseDecimal(value: unknown, field: string): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CommissionRuleValidationError(`${field} inválido.`)
    return value
  }

  const raw = String(value).trim()
  if (!raw) return null
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) throw new CommissionRuleValidationError(`${field} inválido.`)
  return parsed
}

function parseInteger(value: unknown, field: string): number | null {
  const parsed = parseDecimal(value, field)
  if (parsed == null) return null
  if (!Number.isInteger(parsed)) throw new CommissionRuleValidationError(`${field} deve ser um número inteiro.`)
  return parsed
}

function parseDate(value: unknown, field: string): Date | null {
  const text = cleanText(value)
  if (!text) return null
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) throw new CommissionRuleValidationError(`${field} inválida.`)
  return date
}

function normalizeCommissionType(value: unknown): CommissionTypeValue {
  const type = (cleanText(value) ?? 'PERCENTUAL').toUpperCase()
  const mapped = type === 'FIXED' || type === 'VALOR_FIXO' ? 'FIXO' : type
  if (!COMMISSION_TYPES.includes(mapped as CommissionTypeValue)) {
    throw new CommissionRuleValidationError('Tipo de comissão inválido.')
  }
  return mapped as CommissionTypeValue
}

function normalizeRuleType(value: unknown): CommissionRuleType {
  const type = cleanText(value)?.toUpperCase()
  if (!type || !COMMISSION_RULE_TYPES.includes(type as typeof COMMISSION_RULE_TYPES[number])) {
    throw new CommissionRuleValidationError('Tipo da regra é obrigatório.')
  }
  return type as CommissionRuleType
}

function normalizeRole(value: unknown): UserRole | null {
  const role = cleanText(value)?.toUpperCase()
  if (!role) return null
  if (!COMMISSION_ROLE_VALUES.includes(role as typeof COMMISSION_ROLE_VALUES[number])) {
    throw new CommissionRuleValidationError('Perfil/cargo base inválido.')
  }
  return role as UserRole
}

function requirePositive(value: number | null, field: string): number {
  if (value == null || value <= 0) throw new CommissionRuleValidationError(`${field} deve ser maior que zero.`)
  return value
}

function validateNonNegative(value: number | null, field: string) {
  if (value != null && value < 0) throw new CommissionRuleValidationError(`${field} não pode ser negativo.`)
}

export function validateCommissionRulePayload(payload: Record<string, unknown>): NormalizedCommissionRuleData {
  const name = cleanText(payload.name)
  if (!name) throw new CommissionRuleValidationError('Nome é obrigatório.')

  const ruleType = normalizeRuleType(payload.ruleType)
  const commissionType = normalizeCommissionType(payload.commissionType)

  const data: NormalizedCommissionRuleData = {
    name,
    description:    cleanText(payload.description),
    ruleType,
    commissionType,
    role:           normalizeRole(payload.role),
    positionId:     cleanId(payload.positionId),
    sellerId:       cleanId(payload.sellerId),
    managerId:      cleanId(payload.managerId),
    unitId:         cleanId(payload.unitId),
    serviceId:      cleanId(payload.serviceId),
    warrantyId:     cleanId(payload.warrantyId),
    bank:           cleanText(payload.bank),
    fromQuantity:   parseInteger(payload.fromQuantity, 'Quantidade mínima'),
    toQuantity:     parseInteger(payload.toQuantity, 'Quantidade máxima'),
    fromValue:      parseDecimal(payload.fromValue, 'Valor mínimo'),
    toValue:        parseDecimal(payload.toValue, 'Valor máximo'),
    fixedValue:     parseDecimal(payload.fixedValue, 'Valor fixo'),
    percentage:     parseDecimal(payload.percentage, 'Percentual'),
    priority:       parseInteger(payload.priority ?? 0, 'Prioridade') ?? 0,
    active:         payload.active !== false,
    validFrom:      parseDate(payload.validFrom, 'Data inicial'),
    validUntil:     parseDate(payload.validUntil, 'Data final'),
    notes:          cleanText(payload.notes),
  }

  if (data.sellerId && data.managerId) {
    throw new CommissionRuleValidationError('Escolha vendedor ou gerente, não os dois na mesma regra.')
  }

  validateNonNegative(data.fromQuantity, 'Quantidade mínima')
  validateNonNegative(data.toQuantity, 'Quantidade máxima')
  validateNonNegative(data.fromValue, 'Valor mínimo')
  validateNonNegative(data.toValue, 'Valor máximo')
  validateNonNegative(data.fixedValue, 'Valor fixo')
  validateNonNegative(data.percentage, 'Percentual')

  if (data.fromQuantity != null && data.toQuantity != null && data.fromQuantity > data.toQuantity) {
    throw new CommissionRuleValidationError('Quantidade mínima não pode ser maior que a máxima.')
  }
  if (data.fromValue != null && data.toValue != null && data.fromValue > data.toValue) {
    throw new CommissionRuleValidationError('Valor mínimo não pode ser maior que o máximo.')
  }
  if (data.validFrom && data.validUntil && data.validFrom > data.validUntil) {
    throw new CommissionRuleValidationError('Data inicial não pode ser maior que a data final.')
  }

  if (data.percentage != null && data.percentage > 100) {
    throw new CommissionRuleValidationError('Percentual não pode passar de 100%.')
  }

  if (commissionType === 'PERCENTUAL') {
    requirePositive(data.percentage, 'Percentual')
    data.fixedValue = null
  }

  if (commissionType === 'FIXO') {
    requirePositive(data.fixedValue, 'Valor fixo')
    data.percentage = null
  }

  if (commissionType === 'ESCALONADA') {
    const hasPercentage = data.percentage != null && data.percentage > 0
    const hasFixedValue = data.fixedValue != null && data.fixedValue > 0
    if (hasPercentage === hasFixedValue) {
      throw new CommissionRuleValidationError('Regra escalonada precisa de percentual ou valor fixo, apenas um deles.')
    }
    if (
      data.fromQuantity == null &&
      data.toQuantity == null &&
      data.fromValue == null &&
      data.toValue == null
    ) {
      throw new CommissionRuleValidationError('Regra escalonada precisa de uma faixa de quantidade ou valor.')
    }
  }

  if (commissionType === 'BONUS_QTD') {
    requirePositive(data.fixedValue, 'Valor do bônus')
    if (data.fromQuantity == null || data.fromQuantity <= 0) {
      throw new CommissionRuleValidationError('Bônus por quantidade precisa de uma quantidade mínima.')
    }
    data.percentage = null
  }

  return data
}
