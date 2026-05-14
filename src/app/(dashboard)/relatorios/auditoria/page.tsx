'use client'

// =============================================================================
// Auditoria — AutoDrive
// Log de ações realizadas no sistema por usuários
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, Shield, ChevronDown, ChevronUp } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

interface AuditLog {
  id:          string
  userId:      string
  userName:    string | null
  userRole:    string | null
  action:      string
  entity:      string
  entityId:    string | null
  beforeData:  unknown
  afterData:   unknown
  status:      string | null
  ipAddress:   string | null
  createdAt:   string
}

interface Meta {
  total:       number
  page:        number
  perPage:     number
  totalPages:  number
}

const ACTION_COLORS: Record<string, string> = {
  CREATE:   'bg-green-100 text-green-700',
  UPDATE:   'bg-blue-100 text-blue-700',
  DELETE:   'bg-red-100 text-red-700',
  LOGIN:    'bg-purple-100 text-purple-700',
  LOGOUT:   'bg-gray-100 text-gray-600',
  IMPORT:   'bg-teal-100 text-teal-700',
  EXPORT:   'bg-indigo-100 text-indigo-700',
  DISPATCH: 'bg-amber-100 text-amber-700',
}

export default function AuditoriaPage() {
  const [logs, setLogs]     = useState<AuditLog[]>([])
  const [meta, setMeta]     = useState<Meta>({ total: 0, page: 1, perPage: 50, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [page, setPage]     = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    search: '', action: '', entity: '',
  })

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.search) params.set('search', filters.search)
      if (filters.action) params.set('action', filters.action)
      if (filters.entity) params.set('entity', filters.entity)
      params.set('page',    String(page))
      params.set('perPage', '50')
      const res  = await fetch(`/api/logs/audit?${params}`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setLogs(data.data ?? [])
        setMeta(data.meta ?? meta)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [filters, page])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const setFilter = (key: keyof typeof filters, value: string) => {
    setFilters((p) => ({ ...p, [key]: value }))
    setPage(1)
  }

  const toggleExpand = (id: string) =>
    setExpanded((p) => (p === id ? null : id))

  return (
    <div className="space-y-5">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Log de Auditoria</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading ? 'Carregando...' : `${meta.total} registros encontrados`}
          </p>
        </div>
        <button onClick={fetchLogs} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Buscar por usuário, entidade..."
            className="input pl-9"
          />
        </div>
        <select value={filters.action} onChange={(e) => setFilter('action', e.target.value)} className="input w-auto">
          <option value="">Todas as ações</option>
          <option value="CREATE">CREATE</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
          <option value="LOGIN">LOGIN</option>
          <option value="LOGOUT">LOGOUT</option>
          <option value="IMPORT">IMPORT</option>
          <option value="EXPORT">EXPORT</option>
          <option value="DISPATCH">DISPATCH</option>
        </select>
        <select value={filters.entity} onChange={(e) => setFilter('entity', e.target.value)} className="input w-auto">
          <option value="">Todas as entidades</option>
          <option value="Pendency">Pendência</option>
          <option value="User">Usuário</option>
          <option value="Seller">Vendedor</option>
          <option value="GoogleSheetConfig">Planilha</option>
          <option value="CommissionExtract">Comissão</option>
          <option value="SystemSetting">Configuração</option>
        </select>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Data/Hora','Usuário','Perfil','Ação','Entidade','ID da Entidade',''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-gray-200" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center">
                    <Shield size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} />
                    <p className="text-sm text-gray-400">Nenhum registro encontrado</p>
                  </td>
                </tr>
              ) : (
                logs.flatMap((log) => [
                  <tr key={log.id} className="transition-colors hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {formatDate(new Date(log.createdAt))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-800">
                      {log.userName ?? log.userId.slice(0, 8) + '...'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {log.userRole ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-semibold',
                        ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600',
                      )}>
                        {log.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {log.entity}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-400">
                        {log.entityId ? log.entityId.slice(0, 12) + '...' : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(log.beforeData || log.afterData) && (
                        <button
                          onClick={() => toggleExpand(log.id)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="Ver dados"
                        >
                          {expanded === log.id
                            ? <ChevronUp size={14} />
                            : <ChevronDown size={14} />}
                        </button>
                      )}
                    </td>
                  </tr>,
                  ...(expanded === log.id ? [
                    <tr key={`${log.id}-expand`} className="bg-gray-50">
                      <td colSpan={7} className="px-4 pb-4 pt-2">
                        <div className="grid gap-3 sm:grid-cols-2">
                          {log.beforeData && (
                            <div>
                              <p className="mb-1 text-xs font-semibold text-gray-500">Antes</p>
                              <pre className="rounded-lg bg-white border border-gray-200 p-3 text-xs text-gray-600 overflow-auto max-h-40">
                                {JSON.stringify(log.beforeData, null, 2)}
                              </pre>
                            </div>
                          )}
                          {log.afterData && (
                            <div>
                              <p className="mb-1 text-xs font-semibold text-gray-500">Depois</p>
                              <pre className="rounded-lg bg-white border border-gray-200 p-3 text-xs text-gray-600 overflow-auto max-h-40">
                                {JSON.stringify(log.afterData, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>,
                  ] : []),
                ])
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-500">
              Página {meta.page} de {meta.totalPages} — {meta.total} registros
            </p>
            <div className="flex gap-2">
              <button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} className="btn-secondary text-xs disabled:opacity-40">
                Anterior
              </button>
              <button disabled={page >= meta.totalPages || loading} onClick={() => setPage((p) => p + 1)} className="btn-secondary text-xs disabled:opacity-40">
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
