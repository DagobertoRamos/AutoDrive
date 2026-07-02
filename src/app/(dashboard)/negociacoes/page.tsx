'use client'

// =============================================================================
// /negociacoes — Motor de Negociações
// =============================================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Handshake,
  Plus,
  Search,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  MoreVertical,
  FileText,
  X,
  Car,
  TrendingUp,
  ArrowLeftRight,
  Package,
  ShoppingCart,
  Eye,
  Edit,
  CheckCircle2,
  XCircle,
  Ban,
  Sheet,
  AlertTriangle,
  LayoutGrid,
  List as ListIcon,
  SlidersHorizontal,
} from 'lucide-react'
import { canAccessModule } from '@/lib/permissions'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DealVehicle {
  role:   string
  plate:  string | null
  brand:  string | null
  model:  string | null
  year:   number | null
}

interface Deal {
  id:                  string
  dealNumber:          string | null
  type:                string
  status:              string
  source:              string | null
  saleAmount:          string | number | null
  totalPayments:       string | number | null
  vehicleValue:        string | number | null
  createdAt:           string
  isSellerProvisional: boolean
  person:              { nomeCompleto: string } | null
  customer:            { name: string } | null
  seller:              { fullName: string | null; user: { name: string | null } | null } | null
  sellerNameFromSheet?: string | null
  vehicles:            DealVehicle[]
}

interface Pagination {
  page:       number
  limit:      number
  pageSize?:  number
  total:      number
  totalPages: number
}

interface AvailableFilters {
  units: Array<{ id: string; name: string; active: boolean }>
  sellers: Array<{ id: string; name: string; shortName: string | null; unitId: string; active: boolean }>
}

// ── Constantes ────────────────────────────────────────────────────────────────

const DEAL_TYPE_LABEL: Record<string, string> = {
  VENDA:       'Venda',
  COMPRA:      'Compra',
  TROCA:       'Troca',
  CONSIGNACAO: 'Consignação',
}

const DEAL_TYPE_COLOR: Record<string, string> = {
  VENDA:       'bg-green-50  text-green-700  border-green-200',
  COMPRA:      'bg-blue-50   text-blue-700   border-blue-200',
  TROCA:       'bg-purple-50 text-purple-700 border-purple-200',
  CONSIGNACAO: 'bg-amber-50  text-amber-700  border-amber-200',
}

const DEAL_STATUS_LABEL: Record<string, string> = {
  RASCUNHO:                   'Rascunho',
  EM_PREENCHIMENTO:            'Em Preenchimento',
  AGUARDANDO_LIBERACAO:        'Ag. Liberação',
  AGUARDANDO_APROVACAO:        'Ag. Aprovação',
  LIBERADA:                    'Liberada',
  APROVADA:                    'Aprovada',
  RECUSADA:                    'Recusada',
  DESAPROVADA:                 'Desaprovada',
  DEVOLVIDA_PARA_CORRECAO:     'Dev. Correção',
  AGUARDANDO_SINAL:            'Ag. Sinal',
  SINAL_RECEBIDO:              'Sinal Recebido',
  RESERVADA:                   'Reservada',
  AGUARDANDO_FINANCEIRO:       'Ag. Financeiro',
  FINANCEIRO_APROVADO:         'Fin. Aprovado',
  FINANCEIRO_REPROVADO:        'Fin. Reprovado',
  AGUARDANDO_DOCUMENTACAO:     'Ag. Documentação',
  DOCUMENTACAO_CONCLUIDA:      'Doc. Concluída',
  AGUARDANDO_CONTRATO:         'Ag. Contrato',
  CONTRATO_GERADO:             'Contrato Gerado',
  AGUARDANDO_ASSINATURA:       'Ag. Assinatura',
  ASSINADA:                    'Assinada',
  AGUARDANDO_ENTREGA:          'Ag. Entrega',
  ENTREGUE:                    'Entregue',
  EM_ANDAMENTO:                'Em Andamento',
  FINALIZADA:                  'Finalizada',
  CANCELADA:                   'Cancelada',
  REABERTA:                    'Reaberta',
  BLOQUEADA:                   'Bloqueada',
}

const DEAL_STATUS_COLOR: Record<string, string> = {
  RASCUNHO:                'bg-gray-100    text-gray-600   border-gray-200',
  EM_PREENCHIMENTO:         'bg-slate-100   text-slate-700  border-slate-200',
  AGUARDANDO_LIBERACAO:     'bg-amber-50    text-amber-700  border-amber-200',
  AGUARDANDO_APROVACAO:     'bg-amber-50    text-amber-700  border-amber-200',
  LIBERADA:                 'bg-blue-50     text-blue-700   border-blue-200',
  APROVADA:                 'bg-blue-50     text-blue-700   border-blue-200',
  RECUSADA:                 'bg-red-50      text-red-700    border-red-200',
  DESAPROVADA:              'bg-red-50      text-red-700    border-red-200',
  DEVOLVIDA_PARA_CORRECAO:  'bg-orange-50   text-orange-700 border-orange-200',
  AGUARDANDO_SINAL:         'bg-yellow-50   text-yellow-700 border-yellow-200',
  SINAL_RECEBIDO:           'bg-lime-50     text-lime-700   border-lime-200',
  RESERVADA:                'bg-cyan-50     text-cyan-700   border-cyan-200',
  AGUARDANDO_FINANCEIRO:    'bg-indigo-50   text-indigo-700 border-indigo-200',
  FINANCEIRO_APROVADO:      'bg-teal-50     text-teal-700   border-teal-200',
  FINANCEIRO_REPROVADO:     'bg-rose-50     text-rose-700   border-rose-200',
  AGUARDANDO_DOCUMENTACAO:  'bg-violet-50   text-violet-700 border-violet-200',
  DOCUMENTACAO_CONCLUIDA:   'bg-emerald-50  text-emerald-700 border-emerald-200',
  AGUARDANDO_CONTRATO:      'bg-fuchsia-50  text-fuchsia-700 border-fuchsia-200',
  CONTRATO_GERADO:          'bg-sky-50      text-sky-700    border-sky-200',
  AGUARDANDO_ASSINATURA:    'bg-purple-50   text-purple-700 border-purple-200',
  ASSINADA:                 'bg-green-50    text-green-700  border-green-200',
  AGUARDANDO_ENTREGA:       'bg-blue-50     text-blue-700   border-blue-200',
  ENTREGUE:                 'bg-emerald-50  text-emerald-700 border-emerald-200',
  EM_ANDAMENTO:             'bg-blue-50     text-blue-700   border-blue-200',
  FINALIZADA:               'bg-green-600   text-white      border-green-700',
  CANCELADA:                'bg-red-50      text-red-700    border-red-200',
  REABERTA:                 'bg-orange-50   text-orange-700 border-orange-200',
  BLOQUEADA:                'bg-gray-200    text-gray-700   border-gray-300',
}

const fmtBRL = (v: string | number | null) =>
  v != null
    ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—'

const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR')

// ── Componentes auxiliares ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color = DEAL_STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}>
      {DEAL_STATUS_LABEL[status] ?? status}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  const color = DEAL_TYPE_COLOR[type] ?? 'bg-gray-50 text-gray-600 border-gray-200'
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}>
      {DEAL_TYPE_LABEL[type] ?? type}
    </span>
  )
}

// ── Dropdown de ações ─────────────────────────────────────────────────────────

interface ActionsMenuProps {
  deal:   Deal
  role:   string | undefined
  onAction: (action: string, dealId: string) => void
}

function ActionsMenu({ deal, role, onAction }: ActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isManager = ['GERENTE', 'MASTER', 'ADM'].includes(role ?? '')
  const isAdm     = ['MASTER', 'ADM'].includes(role ?? '')

  const canSubmit  = ['RASCUNHO', 'EM_PREENCHIMENTO', 'DEVOLVIDA_PARA_CORRECAO'].includes(deal.status)
  const canApprove = isManager && ['AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO'].includes(deal.status)
  const canCancel  = !['FINALIZADA', 'CANCELADA'].includes(deal.status)
  const canReopen  = isAdm && deal.status === 'CANCELADA'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((p) => !p) }}
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
      >
        <MoreVertical size={15} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg" onClick={(e) => e.stopPropagation()}>
          <Link
            href={`/negociacoes/${deal.id}`}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => setOpen(false)}
          >
            <Eye size={14} className="text-gray-400" /> Ver detalhes
          </Link>
          <Link
            href={`/negociacoes/${deal.id}/editar`}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => setOpen(false)}
          >
            <Edit size={14} className="text-gray-400" /> Editar
          </Link>
          {canSubmit && (
            <button
              onClick={() => { onAction('submit', deal.id); setOpen(false) }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
            >
              <ChevronRight size={14} className="text-blue-400" /> Enviar para aprovação
            </button>
          )}
          {canApprove && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button
                onClick={() => { onAction('approve', deal.id); setOpen(false) }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-green-700 hover:bg-green-50"
              >
                <CheckCircle2 size={14} className="text-green-400" /> Aprovar
              </button>
              <button
                onClick={() => { onAction('reject', deal.id); setOpen(false) }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                <XCircle size={14} className="text-red-400" /> Rejeitar
              </button>
            </>
          )}
          {(canCancel || canReopen) && <div className="my-1 border-t border-gray-100" />}
          {canReopen && (
            <button
              onClick={() => { onAction('reopen', deal.id); setOpen(false) }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-orange-700 hover:bg-orange-50"
            >
              <RefreshCw size={14} className="text-orange-400" /> Reabrir
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => { onAction('cancel', deal.id); setOpen(false) }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              <Ban size={14} className="text-red-400" /> Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function RowSkeleton() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded bg-gray-100" />
        </td>
      ))}
    </tr>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function NegociacoesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const getParam = useCallback((key: string, fallback = '') => searchParams.get(key) ?? fallback, [searchParams])
  const getListParam = useCallback((key: string) => searchParams.getAll(key).flatMap((v) => v.split(',')).filter(Boolean), [searchParams])

  const [deals, setDeals]           = useState<Deal[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [byType, setByType]         = useState<Record<string, number>>({})
  const [byStatus, setByStatus]     = useState<Record<string, number>>({})
  const [availableFilters, setAvailableFilters] = useState<AvailableFilters>({ units: [], sellers: [] })
  const [loading, setLoading]       = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [search, setSearch]         = useState(() => getParam('search'))
  const [typeFilter, setTypeFilter] = useState<string[]>(() => getListParam('type'))
  const [statusFilter, setStatusFilter] = useState<string[]>(() => getListParam('status'))
  const [unitFilter, setUnitFilter] = useState(() => getParam('unitId'))
  const [sellerFilter, setSellerFilter] = useState(() => getParam('sellerId'))
  const [periodMode, setPeriodMode] = useState(() => getParam('periodMode', 'none'))
  const [dateFrom, setDateFrom] = useState(() => getParam('dateFrom'))
  const [dateTo, setDateTo] = useState(() => getParam('dateTo'))
  const [monthFilter, setMonthFilter] = useState(() => getParam('month'))
  const [yearFilter, setYearFilter] = useState(() => getParam('year'))
  const [sourceFilter, setSourceFilter] = useState(() => getParam('source'))
  const [importFilter, setImportFilter] = useState(() => getParam('importFilter', 'any'))
  const [commissionFilter, setCommissionFilter] = useState(() => getParam('commission', 'any'))
  const [pendencyFilter, setPendencyFilter] = useState(() => getParam('pendency', 'any'))
  const [pageSize, setPageSize] = useState(() => getParam('pageSize', '50'))
  const [sortBy, setSortBy] = useState(() => getParam('sortBy', 'createdAt'))
  const [sortDirection, setSortDirection] = useState(() => getParam('sortDirection', 'desc'))
  const [page, setPage] = useState(() => Math.max(1, Number(getParam('page', '1')) || 1))
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null)

  // Modo de exibição (lista | cards) — persiste em localStorage
  const [viewMode, setViewMode] = useState<'list' | 'cards'>(() => {
    if (typeof window === 'undefined') return 'list'
    return (localStorage.getItem('negociacoes:view') as 'list' | 'cards') ?? 'list'
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('negociacoes:view', viewMode)
  }, [viewMode])

  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const role = session?.user?.role

  const updateUrl = useCallback((patch: Record<string, string | string[] | number | null | undefined>) => {
    const params = new URLSearchParams()
    Object.entries(patch).forEach(([key, value]) => {
      params.delete(key)
      if (Array.isArray(value)) {
        value.filter(Boolean).forEach((item) => params.append(key, item))
      } else if (value != null && String(value).trim() !== '' && String(value) !== 'any' && String(value) !== 'none') {
        params.set(key, String(value))
      }
    })
    const qs = params.toString()
    router.replace(qs ? `/negociacoes?${qs}` : '/negociacoes', { scroll: false })
  }, [router])

  const resetFilters = useCallback(() => {
    setSearch('')
    setDebouncedSearch('')
    setTypeFilter([])
    setStatusFilter([])
    setUnitFilter('')
    setSellerFilter('')
    setPeriodMode('none')
    setDateFrom('')
    setDateTo('')
    setMonthFilter('')
    setYearFilter('')
    setSourceFilter('')
    setImportFilter('any')
    setCommissionFilter('any')
    setPendencyFilter('any')
    setSortBy('createdAt')
    setSortDirection('desc')
    setPageSize('50')
    setPage(1)
    router.replace('/negociacoes', { scroll: false })
  }, [router])

  // Debounce search
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [search])

  useEffect(() => {
    updateUrl({
      page,
      pageSize,
      search: debouncedSearch,
      type: typeFilter,
      status: statusFilter,
      unitId: unitFilter,
      sellerId: sellerFilter,
      periodMode,
      dateFrom,
      dateTo,
      month: monthFilter,
      year: yearFilter,
      source: sourceFilter,
      importFilter,
      commission: commissionFilter,
      pendency: pendencyFilter,
      sortBy,
      sortDirection,
    })
  }, [
    page, pageSize, debouncedSearch, typeFilter, statusFilter, unitFilter, sellerFilter,
    periodMode, dateFrom, dateTo, monthFilter, yearFilter, sourceFilter, importFilter,
    commissionFilter, pendencyFilter, sortBy, sortDirection, updateUrl,
  ])

  useEffect(() => {
    if (status === 'authenticated' && !canAccessModule(role, 'negotiations')) {
      router.replace('/inicio')
    }
  }, [status, role, router])

  const load = useCallback(async () => {
    // Aguarda sessão carregar; redireciona se não autorizado (via effect acima)
    if (status !== 'authenticated') return
    setLoading(true)
    setFetchError('')
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', pageSize)
      if (debouncedSearch) params.set('search', debouncedSearch)
      typeFilter.forEach((value) => params.append('type', value))
      statusFilter.forEach((value) => params.append('status', value))
      if (unitFilter) params.set('unitId', unitFilter)
      if (sellerFilter) params.set('sellerId', sellerFilter)
      if (periodMode && periodMode !== 'none') params.set('periodMode', periodMode)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (monthFilter) params.set('month', monthFilter)
      if (yearFilter) params.set('year', yearFilter)
      if (sourceFilter) params.set('source', sourceFilter)
      if (importFilter && importFilter !== 'any') params.set('importFilter', importFilter)
      if (commissionFilter && commissionFilter !== 'any') params.set('commission', commissionFilter)
      if (pendencyFilter && pendencyFilter !== 'any') params.set('pendency', pendencyFilter)
      if (sortBy && sortBy !== 'createdAt') params.set('sortBy', sortBy)
      if (sortDirection && sortDirection !== 'desc') params.set('sortDirection', sortDirection)
      const res  = await fetch(`/api/negotiations?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`)
      const list = Array.isArray(json.data) ? json.data : []
      setDeals(list)
      setPagination(json.pagination ?? null)
      setByType(json.byType ?? {})
      setByStatus(json.byStatus ?? {})
      setAvailableFilters(json.availableFilters ?? { units: [], sellers: [] })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar negociações'
      console.error('[Motor de Negociações] Falha ao buscar negociações:', msg)
      setFetchError(msg)
      setDeals([])
      setPagination(null)
      setByType({})
      setByStatus({})
    } finally {
      setLoading(false)
    }
  }, [status, page, pageSize, debouncedSearch, typeFilter, statusFilter, unitFilter, sellerFilter, periodMode, dateFrom, dateTo, monthFilter, yearFilter, sourceFilter, importFilter, commissionFilter, pendencyFilter, sortBy, sortDirection])

  useEffect(() => { load() }, [load])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const showToast = (msg: string, ok = true) => setToast({ msg, ok })

  const handleAction = async (action: string, dealId: string) => {
    try {
      const res = await fetch(`/api/negotiations/${dealId}/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')
      showToast('Ação realizada com sucesso!')
      load()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Erro inesperado', false)
    }
  }

  const summaryCards = [
    { label: 'Total',        count: pagination?.total      ?? 0, icon: Handshake,      color: 'bg-brand-50 text-brand-700 border-brand-100' },
    { label: 'Vendas',       count: byType.VENDA           ?? 0, icon: TrendingUp,     color: 'bg-green-50  text-green-700  border-green-100'  },
    { label: 'Compras',      count: byType.COMPRA          ?? 0, icon: ShoppingCart,   color: 'bg-blue-50   text-blue-700   border-blue-100'   },
    { label: 'Trocas',       count: byType.TROCA           ?? 0, icon: ArrowLeftRight, color: 'bg-purple-50 text-purple-700 border-purple-100' },
    { label: 'Consignações', count: byType.CONSIGNACAO     ?? 0, icon: Package,        color: 'bg-amber-50  text-amber-700  border-amber-100'  },
    { label: 'Canceladas',   count: byStatus.CANCELADA     ?? 0, icon: XCircle,        color: 'bg-red-50    text-red-700    border-red-100'    },
  ]

  const hasActiveFilters = Boolean(
    debouncedSearch || typeFilter.length || statusFilter.length || unitFilter || sellerFilter ||
    (periodMode && periodMode !== 'none') || sourceFilter || (importFilter && importFilter !== 'any') ||
    (commissionFilter && commissionFilter !== 'any') || (pendencyFilter && pendencyFilter !== 'any') ||
    sortBy !== 'createdAt' || sortDirection !== 'desc' || pageSize !== '50',
  )
  const setSelected = (values: string[], setter: (values: string[]) => void) => {
    setter(values)
    setPage(1)
  }
  const selectedFromOptions = (options: HTMLOptionsCollection) =>
    Array.from(options).filter((option) => option.selected).map((option) => option.value)
  const currentYear = new Date().getFullYear()

  return (
    <div className="flex flex-col gap-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg transition-all ${
          toast.ok
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-red-200   bg-red-50   text-red-800'
        }`}>
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100">
            <Handshake size={20} className="text-brand-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Motor de Negociações</h1>
            <p className="text-sm text-gray-500">
              {loading ? 'Carregando...' : pagination ? `${pagination.total} negociação(ões)` : '0 negociações'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          {canAccessModule(role, 'negotiations') && (
            <Link
              href="/negociacoes/nova"
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 transition-colors"
            >
              <Plus size={14} />
              Nova Negociação
            </Link>
          )}
        </div>
      </div>

      {/* Erro de carregamento */}
      {fetchError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertTriangle size={15} />
          {fetchError}
          <button onClick={load} className="ml-auto text-xs underline hover:no-underline">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${card.color}`}>
              <Icon size={18} />
              <div>
                <p className="text-xs font-medium opacity-70">{card.label}</p>
                <p className="text-lg font-bold">{card.count}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-8 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Buscar cliente, placa, veículo, ID, banco..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setPage(1) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <SlidersHorizontal size={14} />
          Filtros
        </button>
        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
          >
            <X size={13} /> Limpar
          </button>
        )}

        {/* Toggle de visualização (lista | cards) — compacto, profissional */}
        <div className="ml-auto inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            title="Exibir em lista"
            aria-pressed={viewMode === 'list'}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              viewMode === 'list'
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <ListIcon size={13} />
            <span className="hidden sm:inline">Lista</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            title="Exibir em cards"
            aria-pressed={viewMode === 'cards'}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              viewMode === 'cards'
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <LayoutGrid size={13} />
            <span className="hidden sm:inline">Cards</span>
          </button>
        </div>
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2">
            {debouncedSearch && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">Busca: {debouncedSearch}</span>}
            {unitFilter && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">Loja: {availableFilters.units.find((u) => u.id === unitFilter)?.name ?? unitFilter}</span>}
            {sellerFilter && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">Vendedor: {availableFilters.sellers.find((s) => s.id === sellerFilter)?.name ?? sellerFilter}</span>}
            {typeFilter.map((type) => <span key={type} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">Tipo: {DEAL_TYPE_LABEL[type] ?? type}</span>)}
            {statusFilter.map((item) => <span key={item} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">Status: {DEAL_STATUS_LABEL[item] ?? item}</span>)}
            {periodMode !== 'none' && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">Período: {periodMode}</span>}
            {commissionFilter !== 'any' && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">Comissão: {commissionFilter}</span>}
            {pendencyFilter !== 'any' && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">Pendências: {pendencyFilter}</span>}
          </div>
        )}

        {filtersOpen && (
          <div className="grid gap-3 border-t border-gray-100 pt-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Loja</label>
              <select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={unitFilter} onChange={(e) => { setUnitFilter(e.target.value); setPage(1) }}>
                <option value="">Todas permitidas</option>
                {availableFilters.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}{unit.active ? '' : ' (inativa)'}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Vendedor</label>
              <select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={sellerFilter} onChange={(e) => { setSellerFilter(e.target.value); setPage(1) }}>
                <option value="">Todos permitidos</option>
                {availableFilters.sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}{seller.active ? '' : ' (inativo)'}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Tipo</label>
              <select multiple className="h-[86px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={typeFilter} onChange={(e) => setSelected(selectedFromOptions(e.currentTarget.options), setTypeFilter)}>
                {Object.entries(DEAL_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
              <select multiple className="h-[86px] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setSelected(selectedFromOptions(e.currentTarget.options), setStatusFilter)}>
                {Object.entries(DEAL_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Tipo de período</label>
              <select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={periodMode} onChange={(e) => { setPeriodMode(e.target.value); setPage(1) }}>
                <option value="none">Sem filtro</option>
                <option value="today">Hoje</option>
                <option value="yesterday">Ontem</option>
                <option value="week">Esta semana</option>
                <option value="month">Este mês</option>
                <option value="specificDate">Data específica</option>
                <option value="specificMonth">Mês específico</option>
                <option value="year">Ano específico</option>
                <option value="custom">Período personalizado</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Data inicial</label>
              <input type="date" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} disabled={!['specificDate', 'custom'].includes(periodMode)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Data final</label>
              <input type="date" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} disabled={periodMode !== 'custom'} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Mês</label>
                <input type="number" min={1} max={12} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); setPage(1) }} disabled={periodMode !== 'specificMonth'} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Ano</label>
                <input type="number" min={2000} max={2100} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={yearFilter || String(currentYear)} onChange={(e) => { setYearFilter(e.target.value); setPage(1) }} disabled={!['specificMonth', 'year'].includes(periodMode)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Origem</label>
              <select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1) }}>
                <option value="">Todas</option>
                {['MANUAL', 'PLANILHA', 'AUTOCONF', 'EXTENSAO', 'API', 'SITE', 'SDR', 'MARKETING', 'PORTAL'].map((source) => <option key={source} value={source}>{source}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Importação</label>
              <select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={importFilter} onChange={(e) => { setImportFilter(e.target.value); setPage(1) }}>
                <option value="any">Todas</option>
                <option value="manual">Manuais</option>
                <option value="imported">Importadas</option>
                <option value="autoconf">AutoConf/Extensão</option>
                <option value="provisional">Vendedor não encontrado</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Comissão</label>
              <select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={commissionFilter} onChange={(e) => { setCommissionFilter(e.target.value); setPage(1) }}>
                <option value="any">Todas</option>
                <option value="with">Com comissão</option>
                <option value="without">Sem comissão</option>
                <option value="PREVISTO">Comissão pendente</option>
                <option value="PAGO">Comissão paga</option>
                <option value="ESTORNADO">Comissão estornada</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Pendências</label>
              <select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={pendencyFilter} onChange={(e) => { setPendencyFilter(e.target.value); setPage(1) }}>
                <option value="any">Todas</option>
                <option value="open">Com pendência aberta</option>
                <option value="overdue">Com pendência vencida</option>
                <option value="none">Sem pendência aberta</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Ordenar por</label>
              <select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1) }}>
                <option value="createdAt">Criação</option>
                <option value="updatedAt">Atualização</option>
                <option value="approvedAt">Aprovação</option>
                <option value="saleDate">Data da venda</option>
                <option value="client">Cliente</option>
                <option value="seller">Vendedor</option>
                <option value="status">Status</option>
                <option value="type">Tipo</option>
                <option value="value">Valor</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Direção</label>
                <select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={sortDirection} onChange={(e) => { setSortDirection(e.target.value); setPage(1) }}>
                  <option value="desc">Decrescente</option>
                  <option value="asc">Crescente</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Por página</label>
                <select className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={pageSize} onChange={(e) => { setPageSize(e.target.value); setPage(1) }}>
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                {['Número', 'Cliente', 'Vendedor', 'Veículo', 'Valor', 'Status', 'Data', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)}
            </tbody>
          </table>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
              <Handshake size={28} className="text-gray-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-gray-600">Nenhuma negociação encontrada</p>
              <p className="mt-1 text-sm text-gray-400">
                {debouncedSearch || typeFilter || statusFilter
                  ? 'Tente ajustar os filtros.'
                  : 'Crie a primeira negociação.'}
              </p>
            </div>
            <Link
              href="/negociacoes/nova"
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              <Plus size={14} /> Nova Negociação
            </Link>
          </div>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {deals.map((deal) => {
              const clientName = deal.person?.nomeCompleto ?? deal.customer?.name ?? '—'
              const mainVehicle = deal.vehicles?.find((v) => v.role === 'VENDIDO' || v.role === 'COMPRADO' || v.role === 'CONSIGNADO') ?? deal.vehicles?.[0]
              const amount = deal.totalPayments ?? deal.saleAmount ?? deal.vehicleValue
              return (
                <button
                  key={deal.id}
                  type="button"
                  onClick={() => router.push('/negociacoes/' + deal.id)}
                  className="group flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-shadow hover:border-brand-300 hover:shadow-md"
                >
                  {/* Header: número + tipo + status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <FileText size={11} />
                        <span className="font-mono">{deal.dealNumber ?? deal.id.slice(0, 8)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <TypeBadge type={deal.type} />
                        {deal.source === 'PLANILHA' && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                            <Sheet size={9} /> Importada
                          </span>
                        )}
                      </div>
                    </div>
                    <StatusBadge status={deal.status} />
                  </div>

                  {/* Cliente */}
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Cliente</p>
                    <p className="font-medium text-gray-900 line-clamp-1">{clientName}</p>
                  </div>

                  {/* Veículo */}
                  {mainVehicle && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-700">
                      <Car size={13} className="text-gray-400 shrink-0" />
                      <span className="line-clamp-1">
                        {[mainVehicle.brand, mainVehicle.model].filter(Boolean).join(' ')}
                        {mainVehicle.plate && <span className="ml-1 font-mono text-xs text-gray-400">· {mainVehicle.plate}</span>}
                      </span>
                    </div>
                  )}

                  {/* Footer: valor + vendedor + data + ações */}
                  <div className="mt-auto flex items-end justify-between gap-2 border-t border-gray-100 pt-3">
                    <div className="min-w-0">
                      <p className="text-lg font-bold text-gray-900">{amount ? fmtBRL(amount) : '—'}</p>
                      <p className="truncate text-[11px] text-gray-500">
                        {deal.seller?.user?.name ?? deal.seller?.fullName ?? deal.sellerNameFromSheet ?? 'sem vendedor'}
                      </p>
                      <p className="text-[10px] text-gray-400">{fmtDate(deal.createdAt)}</p>
                    </div>
                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                      <ActionsMenu deal={deal} role={role} onAction={handleAction} />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Número / Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Vendedor</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Veículo</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Valor</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Data</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {deals.map((deal) => {
                const clientName = deal.person?.nomeCompleto ?? deal.customer?.name ?? '—'
                const mainVehicle = deal.vehicles?.find((v) => v.role === 'VENDIDO' || v.role === 'COMPRADO' || v.role === 'CONSIGNADO') ?? deal.vehicles?.[0]
                const amount = deal.totalPayments ?? deal.saleAmount ?? deal.vehicleValue
                return (
                  <tr key={deal.id} className="group hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => router.push('/negociacoes/' + deal.id)}>
                    {/* Número / Tipo */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <FileText size={11} className="text-gray-400" />
                          <span className="font-mono text-xs text-gray-500">
                            {deal.dealNumber ?? deal.id.slice(0, 8)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          <TypeBadge type={deal.type} />
                          {deal.source === 'PLANILHA' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                              <Sheet size={9} /> Importada
                            </span>
                          )}
                          {deal.isSellerProvisional && (
                            <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
                              Provisório
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Cliente */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 line-clamp-1">{clientName}</p>
                    </td>

                    {/* Vendedor */}
                    <td className="px-4 py-3 text-gray-600">
                      {deal.seller?.user?.name ?? deal.seller?.fullName ?? deal.sellerNameFromSheet ?? '—'}
                    </td>

                    {/* Veículo */}
                    <td className="px-4 py-3">
                      {mainVehicle ? (
                        <div className="flex items-center gap-1.5">
                          <Car size={12} className="text-gray-400 shrink-0" />
                          <span className="text-gray-700 line-clamp-1">
                            {[mainVehicle.brand, mainVehicle.model].filter(Boolean).join(' ')}
                            {mainVehicle.plate && (
                              <span className="ml-1 font-mono text-xs text-gray-400">· {mainVehicle.plate}</span>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Valor */}
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {amount ? fmtBRL(amount) : '—'}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={deal.status} />
                    </td>

                    {/* Data */}
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {fmtDate(deal.createdAt)}
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/negociacoes/${deal.id}`}
                          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 transition-colors"
                        >
                          Ver <ChevronRight size={12} />
                        </Link>
                        <ActionsMenu deal={deal} role={role} onAction={handleAction} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm text-gray-600">
            Página {pagination.page} de {pagination.totalPages} — {pagination.total} negociação(ões)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(pagination.totalPages - 4, pagination.page - 2)) + i
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`h-8 w-8 rounded-lg text-sm font-medium transition-colors ${
                      p === pagination.page
                        ? 'bg-brand-600 text-white'
                        : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page >= pagination.totalPages}
              className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Próxima <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
