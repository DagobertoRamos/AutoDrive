'use client'

// =============================================================================
// /negociacoes — Motor de Negociações
// =============================================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
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
  total:      number
  totalPages: number
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

  const [deals, setDeals]           = useState<Deal[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [byType, setByType]         = useState<Record<string, number>>({})
  const [byStatus, setByStatus]     = useState<Record<string, number>>({})
  const [loading, setLoading]       = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage]             = useState(1)
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

  // Debounce search
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => { if (searchRef.current) clearTimeout(searchRef.current) }
  }, [search])

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
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (typeFilter)      params.set('type',   typeFilter)
      if (statusFilter)    params.set('status', statusFilter)
      const res  = await fetch(`/api/negotiations?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`)
      const list = Array.isArray(json.data) ? json.data : []
      setDeals(list)
      setPagination(json.pagination ?? null)
      setByType(json.byType ?? {})
      setByStatus(json.byStatus ?? {})
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao carregar negociações'
      console.error('[Motor de Negociações] Falha ao buscar negociações:', msg)
      setFetchError(msg)
      setDeals([])
      setPagination(null)
      setByType({})
    } finally {
      setLoading(false)
    }
  }, [status, page, debouncedSearch, typeFilter, statusFilter])

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
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-8 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Buscar por cliente, número..."
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
        <select
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
        >
          <option value="">Todos os tipos</option>
          {Object.entries(DEAL_TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 min-w-[180px]"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
        >
          <option value="">Todos os status</option>
          {Object.entries(DEAL_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        {(typeFilter || statusFilter || debouncedSearch) && (
          <button
            onClick={() => { setSearch(''); setTypeFilter(''); setStatusFilter(''); setPage(1) }}
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
