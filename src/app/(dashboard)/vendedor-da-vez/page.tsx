'use client'

// =============================================================================
// Comercial › Fila de Atendimento — visão geral (somente leitura) + atalhos.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ListOrdered, DoorOpen, Bell, RefreshCw, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Entry { id: string; sellerName: string; status: string; position: number; attendanceCount: number }
interface Data { entries: Entry[]; vendedorDaVez: { sellerName: string } | null; arrivalsPending: number; queue: unknown | null }

const STATUS_CLS: Record<string, string> = { WAITING: 'bg-gray-100 text-gray-600', PAUSED: 'bg-amber-100 text-amber-700', CALLED: 'bg-blue-100 text-blue-700', IN_ATTENDANCE: 'bg-green-100 text-green-700', NEXT: 'bg-brand-100 text-brand-700' }

export default function FilaOverviewPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/seller-queue/current', { credentials: 'include' })
      if (res.status === 403 || res.status === 400) { const j = await res.json().catch(() => ({})); setDenied(j?.error ?? 'Sem acesso.'); return }
      setDenied(null); setData((await res.json())?.data ?? null)
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const i = setInterval(load, 6000); return () => clearInterval(i) }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><ListOrdered size={20} className="text-brand-600" />Fila de Atendimento</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${data?.entries?.length ?? 0} na fila · ${data?.arrivalsPending ?? 0} cliente(s) aguardando`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/vendedor-da-vez/minha-fila" className="rounded-xl border border-gray-200 bg-white p-4 shadow-card hover:border-brand-300"><DoorOpen size={20} className="mb-2 text-brand-600" /><p className="font-semibold text-gray-900">Minha Fila</p><p className="text-xs text-gray-500">Entrar, pausar, atender</p></Link>
        <Link href="/vendedor-da-vez/cliente-na-loja" className="rounded-xl border border-gray-200 bg-white p-4 shadow-card hover:border-brand-300"><Bell size={20} className="mb-2 text-brand-600" /><p className="font-semibold text-gray-900">Cliente na Loja</p><p className="text-xs text-gray-500">Registrar chegada</p></Link>
      </div>

      {denied ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{denied}</div>
      ) : (
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-100 px-4 py-2.5">
          <p className="text-sm font-semibold text-gray-700">Vendedor da vez: {data?.vendedorDaVez ? <span className="inline-flex items-center gap-1 text-brand-700"><Crown size={14} />{data.vendedorDaVez.sellerName}</span> : <span className="text-gray-400">—</span>}</p>
        </div>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50"><tr>{['#', 'Vendedor', 'Status', 'Atend.'].map((h) => (<th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {(data?.entries ?? []).length === 0 ? (<tr><td colSpan={4} className="py-10 text-center text-sm text-gray-400">Fila vazia.</td></tr>)
            : data!.entries.map((e, i) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 tabular-nums text-gray-500">{i + 1}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900">{e.sellerName}</td>
                <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[e.status] ?? 'bg-gray-100 text-gray-500')}>{e.status}</span></td>
                <td className="px-4 py-2.5 tabular-nums text-gray-500">{e.attendanceCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  )
}
