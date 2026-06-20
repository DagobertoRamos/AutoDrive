'use client'

// =============================================================================
// Comercial › Fila de Atendimento › Relatórios — por vendedor + suspeitas.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { BarChart3, RefreshCw, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Seller { sellerId: string; sellerName: string; finished: number; timeouts: number; rejected: number; called: number; avgAcceptSeconds: number | null }
interface Flag { id: string; kind: string; severity: string; detail: string | null; createdAt: string }
interface Data { days: number; totals: { arrivals: number; recurring: number; attendances: number; finished: number; timeouts: number }; bySeller: Seller[]; fraudFlags: Flag[]; penalties: { id: string; sellerId: string; type: string }[] }

export default function RelatoriosPage() {
  const [data, setData] = useState<Data | null>(null)
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/seller-queue/reports?days=${days}`, { credentials: 'include' })
      if (res.status === 403 || res.status === 400) { const j = await res.json().catch(() => ({})); setDenied(j?.error ?? 'Sem acesso.'); return }
      setDenied(null); setData((await res.json())?.data ?? null)
    } catch { /* noop */ } finally { setLoading(false) }
  }, [days])
  useEffect(() => { load() }, [load])

  if (denied) return <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{denied}</div>
  const t = data?.totals

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><BarChart3 size={20} className="text-brand-600" />Relatórios da Fila</h1>
          <p className="mt-0.5 text-sm text-gray-500">Últimos {days} dias</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs">{[7, 15, 30, 90].map((d) => <option key={d} value={d}>{d} dias</option>)}</select>
          <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[['Clientes', t?.arrivals], ['Recorrentes', t?.recurring], ['Atendimentos', t?.attendances], ['Finalizados', t?.finished], ['Timeouts', t?.timeouts]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-gray-200 bg-white p-3 shadow-card"><p className="text-xs uppercase tracking-wide text-gray-400">{l}</p><p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{loading ? '—' : (v ?? 0)}</p></div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-100 px-4 py-2.5"><p className="text-sm font-semibold text-gray-700">Por vendedor</p></div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Vendedor', 'Chamados', 'Finalizados', 'Timeouts', 'Recusas', 'Tempo médio aceite'].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {(data?.bySeller ?? []).length === 0 ? (<tr><td colSpan={6} className="py-10 text-center text-sm text-gray-400">Sem dados no período.</td></tr>)
              : data!.bySeller.map((s) => (
                <tr key={s.sellerId} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{s.sellerName}</td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-600">{s.called}</td>
                  <td className="px-4 py-2.5 tabular-nums text-green-700">{s.finished}</td>
                  <td className="px-4 py-2.5 tabular-nums text-red-600">{s.timeouts}</td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-500">{s.rejected}</td>
                  <td className="px-4 py-2.5 tabular-nums text-gray-600">{s.avgAcceptSeconds != null ? `${s.avgAcceptSeconds}s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-100 px-4 py-2.5"><p className="flex items-center gap-2 text-sm font-semibold text-gray-700"><AlertTriangle size={15} className="text-amber-500" />Suspeitas de fraude ({data?.fraudFlags?.length ?? 0})</p></div>
        {(data?.fraudFlags ?? []).length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-400">Nenhuma suspeita aberta.</p> : (
          <ul className="divide-y divide-gray-100">
            {data!.fraudFlags.map((f) => (<li key={f.id} className="px-4 py-2.5 text-sm"><span className={cn('mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold', f.severity === 'HIGH' ? 'bg-red-100 text-red-700' : f.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600')}>{f.severity}</span><span className="font-medium text-gray-800">{f.kind}</span>{f.detail && <span className="text-gray-500"> — {f.detail}</span>}</li>))}
          </ul>
        )}
      </div>
    </div>
  )
}
