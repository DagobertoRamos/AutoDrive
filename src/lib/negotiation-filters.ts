import type { Prisma } from '@prisma/client'

export const DEAL_TYPES = ['VENDA', 'COMPRA', 'TROCA', 'CONSIGNACAO'] as const
export const DEAL_STATUSES = [
  'RASCUNHO',
  'AGUARDANDO_LIBERACAO',
  'LIBERADA',
  'RECUSADA',
  'EM_ANDAMENTO',
  'FINALIZADA',
  'CANCELADA',
  'REABERTA',
  'EM_PREENCHIMENTO',
  'AGUARDANDO_APROVACAO',
  'APROVADA',
  'DESAPROVADA',
  'DEVOLVIDA_PARA_CORRECAO',
  'AGUARDANDO_SINAL',
  'SINAL_RECEBIDO',
  'RESERVADA',
  'AGUARDANDO_FINANCEIRO',
  'FINANCEIRO_APROVADO',
  'FINANCEIRO_REPROVADO',
  'AGUARDANDO_DOCUMENTACAO',
  'DOCUMENTACAO_CONCLUIDA',
  'AGUARDANDO_CONTRATO',
  'CONTRATO_GERADO',
  'AGUARDANDO_ASSINATURA',
  'ASSINADA',
  'AGUARDANDO_ENTREGA',
  'ENTREGUE',
  'BLOQUEADA',
] as const

const DEAL_TYPE_SET = new Set<string>(DEAL_TYPES)
const DEAL_STATUS_SET = new Set<string>(DEAL_STATUSES)
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const
const SOURCE_VALUES = ['MANUAL', 'PLANILHA', 'AUTOCONF', 'EXTENSAO', 'API', 'SITE', 'SDR', 'MARKETING', 'PORTAL'] as const
const SOURCE_SET = new Set<string>(SOURCE_VALUES)

type PeriodMode = 'none' | 'today' | 'yesterday' | 'week' | 'month' | 'specificMonth' | 'year' | 'custom' | 'specificDate'
type CommissionFilter = 'any' | 'with' | 'without' | 'PREVISTO' | 'APROVADO' | 'PAGO' | 'ESTORNADO'
type PendencyFilter = 'any' | 'open' | 'overdue' | 'none'
type ImportFilter = 'any' | 'manual' | 'imported' | 'autoconf' | 'provisional'
type SortBy = 'createdAt' | 'updatedAt' | 'approvedAt' | 'saleDate' | 'client' | 'seller' | 'unit' | 'status' | 'type' | 'value'
type SortDirection = 'asc' | 'desc'

export interface NegotiationFilters {
  page: number
  pageSize: number
  search: string
  unitId: string
  sellerId: string
  responsibleId: string
  statuses: string[]
  types: string[]
  source: string
  importFilter: ImportFilter
  periodMode: PeriodMode
  dateFrom: string
  dateTo: string
  month: number | null
  year: number | null
  commission: CommissionFilter
  pendency: PendencyFilter
  sortBy: SortBy
  sortDirection: SortDirection
}

export interface BuiltNegotiationFilters {
  filters: NegotiationFilters
  where: Prisma.DealWhereInput
  orderBy: Prisma.DealOrderByWithRelationInput[]
  errors: string[]
}

function getFirst(params: URLSearchParams, key: string): string {
  return params.get(key)?.trim() ?? ''
}

function getList(params: URLSearchParams, key: string): string[] {
  return params
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

function cleanId(value: string): string {
  return /^[a-zA-Z0-9_-]{8,80}$/.test(value) ? value : ''
}

function clampPage(value: string): number {
  const page = Number(value || 1)
  return Number.isInteger(page) && page > 0 ? page : 1
}

function clampPageSize(value: string): number {
  const pageSize = Number(value || 50)
  return PAGE_SIZE_OPTIONS.includes(pageSize as never) ? pageSize : 50
}

function cleanSearch(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 120)
}

function cleanYear(value: string): number | null {
  const year = Number(value)
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null
}

function cleanMonth(value: string): number | null {
  const month = Number(value)
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null
}

function cleanDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const date = new Date(`${value}T00:00:00.000-03:00`)
  return Number.isNaN(date.getTime()) ? '' : value
}

function dateAtSaoPaulo(value: string, endOfDay = false): Date {
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}-03:00`)
}

function ymd(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function addDays(value: string, days: number): string {
  const date = dateAtSaoPaulo(value)
  date.setUTCDate(date.getUTCDate() + days)
  return ymd(date)
}

function startOfWeek(value: string): string {
  const date = dateAtSaoPaulo(value)
  const day = date.getUTCDay()
  const offset = day === 0 ? -6 : 1 - day
  date.setUTCDate(date.getUTCDate() + offset)
  return ymd(date)
}

function endOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

function plateVariants(search: string): string[] {
  const raw = search.toUpperCase().replace(/\s+/g, '')
  const normalized = raw.replace(/[^A-Z0-9]/g, '')
  const variants = new Set([raw, normalized])
  if (normalized.length >= 4) variants.add(`${normalized.slice(0, 3)}-${normalized.slice(3)}`)
  return [...variants].filter((v) => v.length >= 3)
}

export function parseNegotiationFilters(params: URLSearchParams, now = new Date()): { filters: NegotiationFilters; errors: string[] } {
  const errors: string[] = []
  const statuses = getList(params, 'status').filter((value) => DEAL_STATUS_SET.has(value))
  const types = getList(params, 'type').filter((value) => DEAL_TYPE_SET.has(value))
  const periodMode = (getFirst(params, 'periodMode') || 'none') as PeriodMode
  const sortBy = (getFirst(params, 'sortBy') || 'createdAt') as SortBy
  const sortDirection = (getFirst(params, 'sortDirection') === 'asc' ? 'asc' : 'desc') as SortDirection
  const commission = (getFirst(params, 'commission') || 'any') as CommissionFilter
  const pendency = (getFirst(params, 'pendency') || 'any') as PendencyFilter
  const importFilter = (getFirst(params, 'importFilter') || 'any') as ImportFilter
  const today = ymd(now)
  const currentYear = cleanYear(today.slice(0, 4)) ?? now.getFullYear()
  const currentMonth = cleanMonth(today.slice(5, 7)) ?? now.getMonth() + 1
  let dateFrom = cleanDate(getFirst(params, 'dateFrom'))
  let dateTo = cleanDate(getFirst(params, 'dateTo'))
  let month = cleanMonth(getFirst(params, 'month'))
  let year = cleanYear(getFirst(params, 'year'))

  if (periodMode === 'today') {
    dateFrom = today
    dateTo = today
  } else if (periodMode === 'yesterday') {
    dateFrom = addDays(today, -1)
    dateTo = dateFrom
  } else if (periodMode === 'week') {
    dateFrom = startOfWeek(today)
    dateTo = addDays(dateFrom, 6)
  } else if (periodMode === 'month') {
    month = currentMonth
    year = currentYear
    dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
    dateTo = endOfMonth(year, month)
  } else if (periodMode === 'specificMonth') {
    month = month ?? currentMonth
    year = year ?? currentYear
    dateFrom = `${year}-${String(month).padStart(2, '0')}-01`
    dateTo = endOfMonth(year, month)
  } else if (periodMode === 'year') {
    year = year ?? currentYear
    dateFrom = `${year}-01-01`
    dateTo = `${year}-12-31`
  } else if (periodMode === 'specificDate') {
    dateTo = dateFrom
  }

  if (dateFrom && dateTo && dateAtSaoPaulo(dateFrom).getTime() > dateAtSaoPaulo(dateTo).getTime()) {
    errors.push('Data inicial não pode ser maior que a data final.')
  }

  const validSortBy = new Set<SortBy>(['createdAt', 'updatedAt', 'approvedAt', 'saleDate', 'client', 'seller', 'unit', 'status', 'type', 'value'])
  const validCommission = new Set<CommissionFilter>(['any', 'with', 'without', 'PREVISTO', 'APROVADO', 'PAGO', 'ESTORNADO'])
  const validPendency = new Set<PendencyFilter>(['any', 'open', 'overdue', 'none'])
  const validImport = new Set<ImportFilter>(['any', 'manual', 'imported', 'autoconf', 'provisional'])

  return {
    filters: {
      page: clampPage(getFirst(params, 'page')),
      pageSize: clampPageSize(getFirst(params, 'pageSize')),
      search: cleanSearch(getFirst(params, 'search')),
      unitId: cleanId(getFirst(params, 'unitId')),
      sellerId: cleanId(getFirst(params, 'sellerId')),
      responsibleId: cleanId(getFirst(params, 'responsibleId')),
      statuses,
      types,
      source: SOURCE_SET.has(getFirst(params, 'source').toUpperCase()) ? getFirst(params, 'source').toUpperCase() : '',
      importFilter: validImport.has(importFilter) ? importFilter : 'any',
      periodMode: ['none', 'today', 'yesterday', 'week', 'month', 'specificMonth', 'year', 'custom', 'specificDate'].includes(periodMode) ? periodMode : 'none',
      dateFrom,
      dateTo,
      month,
      year,
      commission: validCommission.has(commission) ? commission : 'any',
      pendency: validPendency.has(pendency) ? pendency : 'any',
      sortBy: validSortBy.has(sortBy) ? sortBy : 'createdAt',
      sortDirection,
    },
    errors,
  }
}

export function buildNegotiationFilterWhere(filters: NegotiationFilters): Prisma.DealWhereInput {
  const and: Prisma.DealWhereInput[] = []

  if (filters.unitId) and.push({ unitId: filters.unitId })
  if (filters.sellerId) and.push({ sellerId: filters.sellerId })
  if (filters.responsibleId) and.push({ OR: [{ sellerId: filters.responsibleId }, { managerId: filters.responsibleId }] })
  if (filters.statuses.length) and.push({ status: { in: filters.statuses as never[] } })
  if (filters.types.length) and.push({ type: { in: filters.types as never[] } })
  if (filters.source) and.push({ source: filters.source })

  if (filters.importFilter === 'manual') and.push({ source: 'MANUAL' })
  if (filters.importFilter === 'imported') and.push({ source: { not: 'MANUAL' } })
  if (filters.importFilter === 'autoconf') and.push({ source: { in: ['AUTOCONF', 'PLANILHA', 'EXTENSAO'] } })
  if (filters.importFilter === 'provisional') and.push({ isSellerProvisional: true })

  if (filters.dateFrom || filters.dateTo) {
    and.push({
      createdAt: {
        ...(filters.dateFrom ? { gte: dateAtSaoPaulo(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: dateAtSaoPaulo(filters.dateTo, true) } : {}),
      },
    })
  }

  if (filters.search) {
    const search = filters.search
    const plateSearches = plateVariants(search)
    and.push({
      OR: [
        { id: { contains: search, mode: 'insensitive' } },
        { dealNumber: { contains: search, mode: 'insensitive' } },
        { externalId: { contains: search, mode: 'insensitive' } },
        { source: { contains: search, mode: 'insensitive' } },
        { paymentBank: { contains: search, mode: 'insensitive' } },
        { sellerNameFromSheet: { contains: search, mode: 'insensitive' } },
        { person: { nomeCompleto: { contains: search, mode: 'insensitive' } } },
        { person: { email: { contains: search, mode: 'insensitive' } } },
        { person: { phone: { contains: search, mode: 'insensitive' } } },
        { person: { cpf: { contains: search.replace(/\D/g, '') } } },
        { person: { cnpj: { contains: search.replace(/\D/g, '') } } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { email: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search, mode: 'insensitive' } } },
        { seller: { fullName: { contains: search, mode: 'insensitive' } } },
        { seller: { user: { name: { contains: search, mode: 'insensitive' } } } },
        { vehicles: { some: { brand: { contains: search, mode: 'insensitive' } } } },
        { vehicles: { some: { model: { contains: search, mode: 'insensitive' } } } },
        ...plateSearches.map((plate) => ({ vehicles: { some: { plate: { contains: plate, mode: 'insensitive' as const } } } })),
      ],
    })
  }

  if (filters.pendency === 'open') {
    and.push({ pendencies: { some: { status: { in: ['ABERTA', 'EM_ANDAMENTO'] as never[] } } } })
  } else if (filters.pendency === 'overdue') {
    and.push({ pendencies: { some: { status: { in: ['ABERTA', 'EM_ANDAMENTO'] as never[] }, dueDate: { lt: new Date() } } } })
  } else if (filters.pendency === 'none') {
    and.push({ pendencies: { none: { status: { in: ['ABERTA', 'EM_ANDAMENTO'] as never[] } } } })
  }

  return and.length ? { AND: and } : {}
}

export function buildNegotiationOrderBy(filters: NegotiationFilters): Prisma.DealOrderByWithRelationInput[] {
  const direction = filters.sortDirection
  if (filters.sortBy === 'client') return [{ person: { nomeCompleto: direction } }, { createdAt: 'desc' }]
  if (filters.sortBy === 'seller') return [{ seller: { fullName: direction } }, { createdAt: 'desc' }]
  if (filters.sortBy === 'unit') return [{ unitId: direction }, { createdAt: 'desc' }]
  if (filters.sortBy === 'status') return [{ status: direction }, { createdAt: 'desc' }]
  if (filters.sortBy === 'type') return [{ type: direction }, { createdAt: 'desc' }]
  if (filters.sortBy === 'value') return [{ saleAmount: direction }, { totalPayments: direction }, { createdAt: 'desc' }]
  if (filters.sortBy === 'updatedAt') return [{ updatedAt: direction }]
  if (filters.sortBy === 'approvedAt') return [{ approvedAt: direction }, { createdAt: 'desc' }]
  if (filters.sortBy === 'saleDate') return [{ saleDate: direction }, { createdAt: 'desc' }]
  return [{ createdAt: direction }]
}
