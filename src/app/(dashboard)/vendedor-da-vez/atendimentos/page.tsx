'use client'

// =============================================================================
// Comercial › Fila de Atendimento › Atendimentos — histórico do dia.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { ClipboardList, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

const dt = (s: string | null) => (s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—')
const TYPE_LBL: Record<string, string> = { SALE: 'Venda', EXCHANGE: 'Troca', PURCHASE: 'Compra', CONSIGNMENT: 'Consignação', FINANCING: 'Financiamento', AFTER_SALES: 'Pós-venda', OTHER: 'Outro' }
const RESULT_LBL: Record<string, string> = { CONVERTED_TO_NEGOTIATION: 'Negociação', SCHEDULED_RETURN: 'Retorno', NO_INTEREST: 'Sem interesse', LOST: 'Perdido', DUPLICATED: 'Duplicado', FORWARDED_TO_RESPONSIBLE: 'Encaminhado', INVALID_ATTENDANCE: 'Inválido' }
const STATUS_CLS: Record<string, string> = { FINISHED: 'bg-green-100 text-green-700', IN_ATTENDANCE: 'bg-blue-100 text-blue-700', CALLED: 'bg-amber-100 text-amber-700', EXPIRED: 'bg-red-100 text-red-600', REJECTED: 'bg-gray-100 text-gray-500', ACCEPTED: 'bg-blue-100 text-blue-700' }

interface Att { id: string; sellerName: string; status: string; type: string | null; result: string | null; calledAt: string; acceptedAt: string | null; finishedAt: string | null; arrival: { customerName: string | null; recurring: boolean } | null }

export default function AtendimentosPage() {
  const [items, setItems] = useState<Att[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/seller-queue/attendances', { credentials: 'include' })
      if (res.status === 403 || res.status === 400) { const j = await res.json().catch(() => ({})); setDenied(j?.error ?? 'Sem acesso.'); return }
      setDenied(null); setItems((await res.json())?.data ?? [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  if (denied) return <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{denied}</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><ClipboardList size={20} className="text-brand-600" />Atendimentos</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} atendimento(s) hoje`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Chamado', 'Vendedor', 'Cliente', 'Status', 'Tipo', 'Resultado', 'Finalizado'].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array.from({ length: 5 }).map((_, i) => (<tr key={i}>{Array.from({ length: 7 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              : items.length === 0 ? (<tr><td colSpan={7} className="py-14 text-center"><ClipboardList size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum atendimento hoje.</p></td></tr>)
              : items.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{dt(a.calledAt)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{a.sellerName}</td>
                  <td className="px-4 py-3 text-gray-600">{a.arrival?.customerName ?? '—'}{a.arrival?.recurring && <span className="ml-1 text-[10px] text-brand-600">(rec.)</span>}</td>
                  <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[a.status] ?? 'bg-gray-100 text-gray-500')}>{a.status}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{a.type ? (TYPE_LBL[a.type] ?? a.type) : '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{a.result ? (RESULT_LBL[a.result] ?? a.result) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{dt(a.finishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
