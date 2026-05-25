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
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'

import { canAccessModule } from '@/lib/permissions'
import { EvaluationHeader }     from '@/components/estoque/avaliacoes/EvaluationHeader'
import { EvaluationStatsCards, type StatsCounts } from '@/components/estoque/avaliacoes/EvaluationStatsCards'
import { EvaluationFilters, EMPTY_FILTERS, type EvaluationFiltersState } from '@/components/estoque/avaliacoes/EvaluationFilters'
import { EvaluationCard, EvaluationCardSkeleton, type EvaluationListItem } from '@/components/estoque/avaliacoes/EvaluationCard'
import { EmptyState }            from '@/components/estoque/avaliacoes/EmptyState'
import { OPEN_STATUSES }         from '@/components/estoque/avaliacoes/status'

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
      if (filters.status)  qs.set('status', filters.status)
      if (filters.unitId)  qs.set('unitId', filters.unitId)

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

  // Stats agregados (em todo o conjunto retornado, não só nessa página visível)
  const counts: StatsCounts = useMemo(() => {
    const c: StatsCounts = { pending: 0, inProgress: 0, finalized: 0, canceled: 0, total: items.length }
    for (const i of items) {
      const s = i.status ?? ''
      if (s === 'PENDING_REVIEW' || s === 'DRAFT' || s === 'REOPENED') c.pending++
      else if (s === 'IN_PROGRESS') c.inProgress++
      else if (s === 'FINALIZED' || s === 'APPROVED') c.finalized++
      else if (s === 'CANCELED' || s === 'REJECTED') c.canceled++
    }
    return c
  }, [items])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasActiveFilters =
    !!filters.search || !!filters.status || !!filters.unitId ||
    !!filters.periodFrom || !!filters.periodTo

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

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="rounded-lg border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
            Tentar novamente
          </button>
        </div>
      )}

      {/* Conteúdo principal */}
      {loading && items.length === 0 ? (
        <div className="space-y-3">
          <EvaluationCardSkeleton />
          <EvaluationCardSkeleton />
          <EvaluationCardSkeleton />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          filtered={hasActiveFilters}
          onClear={hasActiveFilters ? () => setFilters(EMPTY_FILTERS) : undefined}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <EvaluationCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && !loading && items.length > 0 && (
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
