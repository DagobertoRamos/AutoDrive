'use client'

// =============================================================================
// Veículos — AutoDrive
// Cadastro e busca de veículos
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Car, Search, RefreshCw, Plus, Eye } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

interface Vehicle {
  id:           string
  plate:        string
  brand:        string | null
  model:        string | null
  year:         number | null
  color:        string | null
  chassi:       string | null
  renavam:      string | null
  status:       string
  createdAt:    string
  customer?:    { name: string } | null
}

export default function VeiculosPage() {
  const [vehicles, setVehicles]   = useState<Vehicle[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [total, setTotal]         = useState(0)
  const PER_PAGE = 50

  const fetchVehicles = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) })
      if (search) params.set('search', search)
      const res  = await fetch(`/api/vehicles?${params}`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setVehicles(data.data ?? [])
        setTotal(data.meta?.total ?? 0)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [page, search])

  useEffect(() => { fetchVehicles() }, [fetchVehicles])

  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Veículos</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${total} veículos cadastrados`}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchVehicles} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          </button>
          <button className="btn-primary text-xs">
            <Plus size={13} />
            Novo veículo
          </button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Buscar por placa, modelo ou chassi..."
          className="input pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Placa','Marca/Modelo','Ano','Cor','Proprietário','Status','Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>
                    ))}
                  </tr>
                ))
              ) : vehicles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center">
                    <Car size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} />
                    <p className="text-sm text-gray-400">Nenhum veículo cadastrado</p>
                  </td>
                </tr>
              ) : (
                vehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-sm font-semibold">{v.plate}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="font-medium text-gray-800">{v.brand ?? '—'}</p>
                      <p className="text-xs text-gray-500">{v.model ?? ''}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-600">{v.year ?? '—'}</td>
                    <td className="px-4 py-3 capitalize text-gray-600">{v.color ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{v.customer?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {v.status}
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
            <p className="text-xs text-gray-500">Página {page} de {totalPages} — {total} veículos</p>
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
