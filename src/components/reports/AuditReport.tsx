'use client'

// =============================================================================
// AuditReport — relatório de auditoria (acessos/alteracoes/exclusoes/eventos).
// Consome /api/reports/audit?view=...
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Row {
  id: string; action: string; entity: string; entityId: string | null
  usuario: string; papel: string; status: string; errorMessage: string | null; ip: string | null; createdAt: string
}
interface Bucket { key: string; count: number }

const dt = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export default function AuditReport({
  view, title, Icon = ShieldCheck,
}: {
  view: 'acessos' | 'alteracoes' | 'exclusoes' | 'eventos'; title: string; Icon?: LucideIcon
}) {
  const [summary, setSummary] = useState<{ count: number; erros: number; usuarios: number } | null>(null)
  const [byAction, setByAction] = useState<Bucket[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reports/audit?view=${view}`, { credentials: 'include' })
      const json = await res.json()
      setSummary(json?.summary ?? null); setByAction(json?.byAction ?? []); setRows(json?.data ?? [])
    } catch { setSummary(null); setByAction([]); setRows([]) } finally { setLoading(false) }
  }, [view])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${summary?.count ?? 0} registros`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Registros</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : summary?.count ?? 0}</p></div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Usuários</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : summary?.usuarios ?? 0}</p></div>
        <div className={cn('rounded-xl border p-4', (summary?.erros ?? 0) > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white')}><p className={cn('text-xs font-medium uppercase tracking-wide', (summary?.erros ?? 0) > 0 ? 'text-red-700' : 'text-gray-500')}>Erros / falhas</p><p className={cn('mt-1 text-xl font-bold tabular-nums', (summary?.erros ?? 0) > 0 ? 'text-red-700' : 'text-gray-900')}>{loading ? '—' : summary?.erros ?? 0}</p></div>
      </div>

      {byAction.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byAction.map((b) => (<span key={b.key} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600">{b.key}: <span className="font-semibold tabular-nums text-gray-900">{b.count}</span></span>))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Data/Hora', 'Usuário', 'Papel', 'Ação', 'Entidade', 'Status', 'IP'].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{Array.from({ length: 7 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="py-14 text-center"><Icon size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum registro de auditoria.</p></td></tr>
              ) : (
                rows.map((a) => (
                  <tr key={a.id} className={cn('hover:bg-gray-50', a.status !== 'SUCCESS' && 'bg-red-50/40')}>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{dt(a.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-700">{a.usuario}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{a.papel}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">{a.action}</span></td>
                    <td className="px-4 py-3 text-gray-600">{a.entity}{a.entityId && <span className="ml-1 font-mono text-[10px] text-gray-400">#{a.entityId.slice(0, 8)}</span>}</td>
                    <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', a.status === 'SUCCESS' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>{a.status}</span>{a.errorMessage && <p className="mt-0.5 max-w-xs truncate text-[10px] text-red-500">{a.errorMessage}</p>}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-400">{a.ip ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
