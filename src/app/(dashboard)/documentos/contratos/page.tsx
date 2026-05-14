'use client'

// =============================================================================
// Contratos — AutoDrive
// Listagem e busca de contratos importados via PDF
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { FileText, Search, RefreshCw, Eye, Download } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

interface Contract {
  id:             string
  contractNumber: string | null
  customerName:   string
  plate:          string | null
  vehicle:        string | null
  value:          number | null
  contractDate:   string | null
  type:           string
  status:         string
  createdAt:      string
}

function fmt(n: number | null) {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ContratosPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [total, setTotal]         = useState(0)
  const PER_PAGE = 50

  const fetchContracts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) })
      if (search) params.set('search', search)
      const res  = await fetch(`/api/documents/contracts?${params}`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setContracts(data.data ?? [])
        setTotal(data.meta?.total ?? 0)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [page, search])

  useEffect(() => { fetchContracts() }, [fetchContracts])

  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Contratos</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${total} contratos encontrados`}</p>
        </div>
        <button onClick={fetchContracts} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Buscar por cliente, placa ou nº contrato..."
          className="input pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Nº Contrato','Cliente','Placa','Veículo','Valor','Data','Status','Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>
                    ))}
                  </tr>
                ))
              ) : contracts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center">
                    <FileText size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} />
                    <p className="text-sm text-gray-400">Nenhum contrato encontrado</p>
                    <p className="text-xs text-gray-400 mt-1">Use a leitura de PDF para importar contratos.</p>
                  </td>
                </tr>
              ) : (
                contracts.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{c.contractNumber ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-800">{c.customerName}</td>
                    <td className="px-4 py-3">
                      {c.plate
                        ? <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">{c.plate}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="max-w-[130px] truncate px-4 py-3 text-gray-600">{c.vehicle ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-gray-700">{fmt(c.value)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                      {c.contractDate ? formatDate(new Date(c.contractDate)) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-gray-500">Página {page} de {totalPages} — {total} contratos</p>
            <div className="flex gap-2">
              <button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} className="btn-secondary text-xs disabled:opacity-40">Anterior</button>
              <button disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)} className="btn-secondary text-xs disabled:opacity-40">Próxima</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
