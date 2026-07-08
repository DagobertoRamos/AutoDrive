'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AttendanceRow {
  id: string
  sellerName: string
  customerName: string | null
  customerPhone: string | null
  status: string
  result: string | null
  type: string | null
  visitType: string | null
  leadId: string | null
  dealId: string | null
  calledAt: string
  finishedAt: string | null
}

export default function CrmAttendancesPage() {
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/crm/attendances', { credentials: 'include' })
      const json = await res.json().catch(() => null) as { data?: AttendanceRow[] } | null
      setRows(json?.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Atendimentos</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando atendimentos...' : `${rows.length} atendimento(s) no escopo atual`}</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
            <p className="font-semibold text-gray-900">{row.customerName ?? 'Cliente não identificado'}</p>
            <p className="text-sm text-gray-500">{row.sellerName} · {row.visitType ?? row.type ?? 'ATENDIMENTO'}</p>
            <p className="mt-2 text-xs text-gray-500">Status: {row.status}{row.result ? ` · ${row.result}` : ''}</p>
            <p className="text-xs text-gray-400">Início: {new Date(row.calledAt).toLocaleString('pt-BR')}</p>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Data', 'Cliente', 'Vendedor', 'Tipo', 'Status', 'Lead', 'Negociação'].map((item) => (
                  <th key={item} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{item}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(row.calledAt).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{row.customerName ?? 'Sem cliente'}</p>
                    <p className="text-xs text-gray-500">{row.customerPhone ?? 'Sem telefone'}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{row.sellerName}</td>
                  <td className="px-4 py-3 text-gray-600">{row.visitType ?? row.type ?? 'ATENDIMENTO'}</td>
                  <td className="px-4 py-3 text-gray-600">{row.status}{row.result ? ` · ${row.result}` : ''}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{row.leadId ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{row.dealId ?? '—'}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum atendimento encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
