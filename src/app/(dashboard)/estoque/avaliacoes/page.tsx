'use client'

// =============================================================================
// /estoque/avaliacoes — Dashboard de Avaliações de Veículos
//
// Diferente de /estoque/avaliacao (singular = wizard de criação), esta página
// é uma listagem rica com cards, filtros, stats e empty/loading states.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, ChevronLeft, ChevronRight, LayoutGrid, List as ListIcon, Loader2 } from 'lucide-react'

import { canAccessModule } from '@/lib/permissions'
import { EvaluationHeader }     from '@/components/estoque/avaliacoes/EvaluationHeader'
import { EvaluationStatsCards, type StatsCounts } from '@/components/estoque/avaliacoes/EvaluationStatsCards'
import { EvaluationFilters, EMPTY_FILTERS, type EvaluationFiltersState } from '@/components/estoque/avaliacoes/EvaluationFilters'
import { EvaluationCard, EvaluationCardSkeleton, type EvaluationListItem } from '@/components/estoque/avaliacoes/EvaluationCard'
import { EmptyState }            from '@/components/estoque/avaliacoes/EmptyState'
import { OPEN_STATUSES, expandStatusFilter, getStatusDef } from '@/components/estoque/avaliacoes/status'

interface UnitOption { id: string; name: string }

const PAGE_SIZE = 50

export default function AvaliacoesPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()

  const [items,    setItems]    = useState<EvaluationListItem[]>([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [page,     setPage]     = useState(1)
  const [filters,  setFilters]  = useState<EvaluationFiltersState>(EMPTY_FILTERS)
  const [units,    setUnits]    = useState<UnitOption[]>([])

  // viewMode persistido em localStorage — sobrevive a refresh/navegação
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    if (typeof window === 'undefined') return 'cards'
    const saved = localStorage.getItem('avaliacoes:view')
    return saved === 'list' || saved === 'cards' ? saved : 'cards'
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('avaliacoes:view', viewMode)
  }, [viewMode])

  // Carrega unidades para o filtro (não bloqueia a listagem)
  useEffect(() => {
    if (authStatus !== 'authenticated') return
    fetch('/api/units')
      .then((r) => r.json())
      .then((j) => setUnits(Array.isArray(j?.data) ? j.data : []))
      .catch(() => { /* silently ignore */ })
  }, [authStatus])

  // Auth guard
  useEffect(() => {
    if (authStatus === 'authenticated' && !canAccessModule(session?.user?.role, 'stock.evaluate')) {
      router.replace('/inicio')
    }
  }, [authStatus, session, router])

  // Debounce na busca textual (400ms)
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 400)
    return () => clearTimeout(t)
  }, [filters.search])

  // Reseta para página 1 quando filtros mudam
  useEffect(() => { setPage(1) }, [debouncedSearch, filters.status, filters.unitId, filters.periodFrom, filters.periodTo])

  const load = useCallback(async () => {
    if (authStatus !== 'authenticated') return
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams()
      qs.set('page', String(page))
      if (debouncedSearch) qs.set('search', debouncedSearch)
      if (filters.unitId)  qs.set('unitId', filters.unitId)
      // NÃO enviamos `status` ao backend — o filtro é feito client-side via
      // `expandStatusFilter` (status.ts) para aceitar aliases pt-BR/en
      // (CANCELADA↔CANCELED, AGUARDANDO_APROVACAO↔PENDING_REVIEW, etc.)
      // sem precisar reescrever a API.

      const res  = await fetch(`/api/evaluations?${qs.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Erro ${res.status}`)

      let data: EvaluationListItem[] = Array.isArray(json.data) ? json.data : []

      // Filtros locais — period (a API ainda não filtra por data)
      if (filters.periodFrom) {
        const from = new Date(filters.periodFrom + 'T00:00:00').getTime()
        data = data.filter((d) => new Date(d.createdAt).getTime() >= from)
      }
      if (filters.periodTo) {
        const to = new Date(filters.periodTo + 'T23:59:59').getTime()
        data = data.filter((d) => new Date(d.createdAt).getTime() <= to)
      }

      // Enrichment: mapeia unitId → unitName para os cards
      const unitMap = Object.fromEntries(units.map((u) => [u.id, u.name]))
      data = data.map((d) => ({ ...d, unitName: d.unitId ? unitMap[d.unitId] ?? null : null }))

      // Mantemos TUDO no `items` (canceladas inclusive) pra que os contadores
      // do stats card fiquem corretos. O filtro de "esconder canceladas por
      // padrão" é aplicado apenas no render (visibleItems abaixo).

      // Ordenação padrão: abertas primeiro (mais antigas) → depois finalizadas recentes
      data.sort((a, b) => {
        const aOpen = OPEN_STATUSES.includes((a.status ?? '') as never) ? 0 : 1
        const bOpen = OPEN_STATUSES.includes((b.status ?? '') as never) ? 0 : 1
        if (aOpen !== bOpen) return aOpen - bOpen
        if (aOpen === 0) {
          // abertas: mais antigas primeiro (chama mais atenção)
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        }
        // fechadas: mais recentes primeiro
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })

      setItems(data)
      setTotal(json.pagination?.total ?? data.length)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar avaliações.')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [authStatus, page, debouncedSearch, filters.status, filters.unitId, filters.periodFrom, filters.periodTo, units])

  useEffect(() => { load() }, [load])

  // Stats agregados. Aceita status em pt-BR e en (legado) — ver
  // src/components/estoque/avaliacoes/status.ts para a lista canônica.
  const counts: StatsCounts = useMemo(() => {
    const c: StatsCounts = { pending: 0, inProgress: 0, finalized: 0, canceled: 0, total: items.length }
    for (const i of items) {
      const s = (i.status ?? '').toUpperCase()
      if (s === 'PENDING_REVIEW' || s === 'DRAFT' || s === 'REOPENED' || s === 'AGUARDANDO_APROVACAO') c.pending++
      else if (s === 'IN_PROGRESS') c.inProgress++
      else if (s === 'FINALIZED' || s === 'APPROVED' || s === 'LIBERADA') c.finalized++
      else if (s === 'CANCELED' || s === 'CANCELADA' || s === 'REJECTED') c.canceled++
    }
    return c
  }, [items])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasActiveFilters =
    !!filters.search || !!filters.status || !!filters.unitId ||
    !!filters.periodFrom || !!filters.periodTo

  // Filtro client-side:
  //  • Se há filtro de status: aceita TODOS os aliases (pt-BR + legados en).
  //    Ex: filtro 'CANCELADA' inclui status 'CANCELADA', 'CANCELED', 'REJECTED'.
  //  • "Todos os status" (filtro vazio): mostra TUDO — inclusive canceladas
  //    (o status fica visível no badge cinza pra identificar).
  // Counts continuam contando tudo (não dependem desse filtro).
  const visibleItems = useMemo(() => {
    if (!filters.status) return items
    const allowed = new Set(expandStatusFilter(filters.status))
    return items.filter((d) => allowed.has((d.status ?? '').toUpperCase()))
  }, [items, filters.status])

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <EvaluationHeader
        total={total}
        loading={loading}
        onRefresh={load}
      />

      <EvaluationStatsCards
        counts={counts}
        activeStatus={filters.status}
        onSelect={(status) => setFilters((p) => ({ ...p, status }))}
        loading={loading && items.length === 0}
      />

      <EvaluationFilters
        value={filters}
        onChange={setFilters}
        units={units}
      />

      {/* Toggle Lista ↔ Cards — alinhado à direita, padrão do app */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {visibleItems.length} de {total} avaliação{total === 1 ? '' : 'ões'}
        </p>
        <div className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            title="Exibir em lista"
            aria-pressed={viewMode === 'list'}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              viewMode === 'list' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
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
              viewMode === 'cards' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <LayoutGrid size={13} />
            <span className="hidden sm:inline">Cards</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Conteúdo principal — usa visibleItems pra esconder canceladas no
          modo "Todos os status", mas mantém contadores corretos. */}
      {loading && items.length === 0 ? (
        <div className="space-y-3">
          <EvaluationCardSkeleton />
          <EvaluationCardSkeleton />
          <EvaluationCardSkeleton />
        </div>
      ) : visibleItems.length === 0 ? (
        <EmptyState
          filtered={hasActiveFilters || items.length > 0}
          onClear={hasActiveFilters ? () => setFilters(EMPTY_FILTERS) : undefined}
        />
      ) : viewMode === 'list' ? (
        <EvaluationListTable items={visibleItems} />
      ) : (
        <div className="space-y-3">
          {visibleItems.map((item) => (
            <EvaluationCard key={item.id} item={item} onReopened={load} />
          ))}
        </div>
      )}

      {loading && items.length > 0 && (
        <div className="flex items-center justify-center py-2 text-xs text-gray-400">
          <Loader2 size={14} className="mr-1.5 animate-spin" />
          Atualizando...
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && !loading && visibleItems.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm text-gray-600">
            Página {page} de {totalPages} — {total} avaliações
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={13} /> Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Próxima <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── EvaluationListTable ─────────────────────────────────────────────────────
// Render tabular compacto pra modo lista. Reusa os mesmos dados dos cards.

function EvaluationListTable({ items }: { items: EvaluationListItem[] }) {
  const fmtBRL = (v: unknown): string => {
    if (v == null || v === '') return '—'
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (isNaN(n) || n === 0) return '—'
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  const fmtDate = (iso: string): string => {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              {['Placa', 'Veículo', 'Cliente', 'Unidade', 'Avaliado', 'Status', 'Criada em', ''].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item) => {
              const status = getStatusDef(item.status)
              const veh = [item.brand, item.model, item.version].filter(Boolean).join(' ')
              const year = [item.manufactureYear, item.modelYear].filter(Boolean).join('/')
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/estoque/avaliacao/${item.id}/inspecao`}
                      className="rounded bg-gray-900 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-white hover:bg-gray-700"
                    >
                      {item.plate ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-900 line-clamp-1">{veh || '—'}</p>
                    <p className="text-[11px] text-gray-500">
                      {year && <span>{year}</span>}
                      {item.color && <span className="ml-2">{item.color}</span>}
                      {item.km != null && <span className="ml-2">{Number(item.km).toLocaleString('pt-BR')} km</span>}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-sm text-gray-800 line-clamp-1">{item.ownerName ?? '—'}</p>
                    {item.ownerPhone && <p className="text-[11px] text-gray-400">{item.ownerPhone}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">{item.unitName ?? '—'}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-emerald-700">{fmtBRL(item.evaluatedValue)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{fmtDate(item.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/estoque/avaliacao/${item.id}/inspecao`}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Ver <ChevronRight size={11} />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
