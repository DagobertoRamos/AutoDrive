'use client'

// =============================================================================
// Master > F&I > Saúde das Integrações (Fase Master). MASTER-only. Read-only.
// KPIs de logs (OK/ERROR/taxa), webhooks (total/pendentes), provedores ativos,
// última atividade e últimos erros. Consome /api/master/financing/health.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Activity, RefreshCw, Lock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ErrRow { id: string; action: string; message: string | null; createdAt: string }
interface Health {
  logs: { total: number; ok: number; error: number; errorRate: number }
  webhooks: { total: number; pending: number }
  providers: { total: number; active: number }
  lastActivity: string | null
  recentErrors: ErrRow[]
}
const dt = (s: string) => new Date(s).toLocaleString('pt-BR')

export default function MasterHealthPage() {
  const { data: session } = useSession()
  const isMaster = !((session?.user as { role?: string })?.role) || (session?.user as { role?: string })?.role === 'MASTER'

  const [h, setH] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await fetch('/api/master/financing/health', { credentials: 'include' }).then((x) => x.json()); setH(r?.data ?? null) }
    catch { setH(null) } finally { setLoading(false) }
  }, [])
  useEffect(() => { if (isMaster) load() }, [isMaster, load])

  if (session && !isMaster) {
    return <div className="flex flex-col items-center justify-center gap-4 py-20 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div><p className="text-lg font-semibold text-gray-800">Área exclusiva do MASTER</p></div>
  }

  const cards = [
    { label: 'Provedores ativos', value: h ? `${h.providers.active}/${h.providers.total}` : '—', cls: 'border-brand-200 bg-brand-50 text-brand-800' },
    { label: 'Eventos de log', value: h ? String(h.logs.total) : '—', cls: 'border-gray-200 bg-white text-gray-900' },
    { label: 'Taxa de erro', value: h ? `${h.logs.errorRate}%` : '—', cls: cn('border', h && h.logs.errorRate > 0 ? 'border-red-200 bg-red-50 text-red-600' : 'border-green-200 bg-green-50 text-green-700') },
    { label: 'Webhooks pendentes', value: h ? String(h.webhooks.pending) : '—', cls: cn('border', h && h.webhooks.pending > 0 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-white text-gray-900') },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Activity size={20} className="text-brand-600" />Saúde das Integrações</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : h?.lastActivity ? `Última atividade: ${dt(h.lastActivity)}` : 'Sem atividade registrada.'}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={cn('rounded-xl border p-4', c.cls)}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">{c.label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{loading ? '—' : c.value}</p>
          </div>
        ))}
      </div>

      {h && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-green-200 bg-green-50/40 p-4"><p className="text-xs text-gray-500">Logs OK</p><p className="text-lg font-bold tabular-nums text-green-700">{h.logs.ok}</p></div>
          <div className="rounded-xl border border-red-200 bg-red-50/40 p-4"><p className="text-xs text-gray-500">Logs com erro</p><p className="text-lg font-bold tabular-nums text-red-600">{h.logs.error}</p></div>
          <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs text-gray-500">Webhooks recebidos</p><p className="text-lg font-bold tabular-nums text-gray-800">{h.webhooks.total}</p></div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-800"><AlertTriangle size={15} className="text-red-500" />Últimos erros</div>
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (<tr key={i}><td className="px-4 py-3" colSpan={3}><div className="h-4 animate-pulse rounded bg-gray-200" /></td></tr>))
            ) : !h || h.recentErrors.length === 0 ? (
              <tr><td className="py-10 text-center text-sm text-gray-400" colSpan={3}>Nenhum erro recente. 🎉</td></tr>
            ) : h.recentErrors.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">{dt(e.createdAt)}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{e.action}</td>
                <td className="px-4 py-2.5 text-gray-600">{e.message ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
