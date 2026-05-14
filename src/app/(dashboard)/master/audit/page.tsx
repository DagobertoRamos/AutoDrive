'use client'

// =============================================================================
// /master/audit — Auditoria de ações na plataforma
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck,
  Search,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id:        string
  action:    string
  entity:    string
  entityId:  string | null
  ipAddress: string | null
  userAgent: string | null
  status:    string | null
  userName:  string | null
  userRole:  string | null
  tenantId:  string | null
  createdAt: string
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function MasterAuditPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [logs, setLogs]         = useState<AuditEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [action, setAction]     = useState('')
  const [page, setPage]         = useState(1)
  const [total, setTotal]       = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') {
      router.replace('/inicio')
    }
  }, [session, status, router])

  const load = useCallback(() => {
    if (session?.user?.role !== 'MASTER') return
    setLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    })
    if (search) params.set('search', search)
    if (action) params.set('action', action)
    fetch(`/api/master/audit?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.data ?? [])
        setTotal(d.total ?? 0)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [session, page, search, action])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const exportCSV = () => {
    const params = new URLSearchParams({ export: 'csv' })
    if (search) params.set('search', search)
    if (action) params.set('action', action)
    window.open(`/api/master/audit?${params}`, '_blank')
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck size={22} className="text-brand-700" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Auditoria da Plataforma</h1>
            <p className="text-sm text-gray-500">{total.toLocaleString('pt-BR')} registro(s) encontrado(s)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="btn-secondary flex items-center gap-1.5 text-sm">
            <Download size={14} />
            Exportar CSV
          </button>
          <button onClick={load} className="btn-secondary flex items-center gap-1.5 text-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 text-sm"
            placeholder="Buscar por usuário, entidade..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select
          className="input text-sm w-44"
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1) }}
        >
          <option value="">Todas as ações</option>
          {['LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'APPROVE', 'REJECT'].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-gray-400 text-sm">
            Nenhum log encontrado
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Data/Hora</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Usuário</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Ação</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Entidade</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">IP</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-xs font-medium text-gray-800">{log.userName ?? '—'}</p>
                    {log.userRole && (
                      <p className="text-[11px] text-gray-400">{log.userRole}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      log.action === 'LOGIN'  ? 'bg-green-50 text-green-700'  :
                      log.action === 'DELETE' ? 'bg-red-50 text-red-700'      :
                      log.action === 'CREATE' ? 'bg-blue-50 text-blue-700'    :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600">
                    {log.entity}
                    {log.entityId && (
                      <span className="ml-1 text-gray-400 font-mono">{log.entityId.slice(0, 8)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono text-gray-400">
                    {log.ipAddress ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium ${
                      log.status === 'SUCCESS' ? 'text-green-600' :
                      log.status === 'ERROR'   ? 'text-red-600'   :
                      'text-gray-400'
                    }`}>
                      {log.status ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-500">
              Página {page} de {totalPages} · {total.toLocaleString('pt-BR')} registros
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary p-1.5 disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn-secondary p-1.5 disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
