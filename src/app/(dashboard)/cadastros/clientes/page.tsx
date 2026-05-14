'use client'

// =============================================================================
// Clientes — AutoDrive
// Cadastro e busca de clientes
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Users, Search, RefreshCw, Plus, Eye, Phone, Mail } from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'

interface Customer {
  id:        string
  name:      string
  cpf:       string | null
  email:     string | null
  phone:     string | null
  whatsapp:  string | null
  city:      string | null
  state:     string | null
  createdAt: string
}

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [page, setPage]           = useState(1)
  const [total, setTotal]         = useState(0)
  const PER_PAGE = 50

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) })
      if (search) params.set('search', search)
      const res  = await fetch(`/api/customers?${params}`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setCustomers(data.data ?? [])
        setTotal(data.meta?.total ?? 0)
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [page, search])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  const totalPages = Math.ceil(total / PER_PAGE)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clientes</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${total} clientes cadastrados`}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchCustomers} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          </button>
          <button className="btn-primary text-xs">
            <Plus size={13} />
            Novo cliente
          </button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Buscar por nome, CPF ou e-mail..."
          className="input pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Nome','CPF','Contato','Cidade/UF','Cadastrado em','Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>
                    ))}
                  </tr>
                ))
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <Users size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} />
                    <p className="text-sm text-gray-400">Nenhum cliente encontrado</p>
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-800">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.cpf ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        {c.phone && (
                          <span className="flex items-center gap-1 text-xs text-gray-600">
                            <Phone size={11} />{c.phone}
                          </span>
                        )}
                        {c.email && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Mail size={11} />{c.email}
                          </span>
                        )}
                        {!c.phone && !c.email && <span className="text-gray-300 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {c.city && c.state ? `${c.city}/${c.state}` : c.city ?? c.state ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400">
                      {formatDate(new Date(c.createdAt))}
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
            <p className="text-xs text-gray-500">Página {page} de {totalPages} — {total} clientes</p>
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
