'use client'

// =============================================================================
// /negociacoes — Listagem de negociações
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Handshake,
  Plus,
  Search,
  RefreshCw,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
} from 'lucide-react'
import { canAccessModule } from '@/lib/permissions'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Deal {
  id:            string
  type:          string
  status:        string
  totalPayments: number | null
  createdAt:     string
  person: { nomeCompleto: string } | null
  seller: { user: { name: string } } | null
}

const DEAL_TYPE_LABEL: Record<string, string> = {
  VENDA:        'Venda',
  COMPRA:       'Compra',
  TROCA:        'Troca',
  CONSIGNACAO:  'Consignação',
}

const DEAL_TYPE_COLOR: Record<string, string> = {
  VENDA:       'bg-green-50  text-green-700  border-green-200',
  COMPRA:      'bg-blue-50   text-blue-700   border-blue-200',
  TROCA:       'bg-purple-50 text-purple-700 border-purple-200',
  CONSIGNACAO: 'bg-amber-50  text-amber-700  border-amber-200',
}

const DEAL_STATUS_LABEL: Record<string, string> = {
  RASCUNHO:             'Rascunho',
  AGUARDANDO_LIBERACAO: 'Ag. Liberação',
  LIBERADA:             'Liberada',
  RECUSADA:             'Recusada',
  EM_ANDAMENTO:         'Em Andamento',
  FINALIZADA:           'Finalizada',
  CANCELADA:            'Cancelada',
  REABERTA:             'Reaberta',
}

const DEAL_STATUS_ICON: Record<string, React.ElementType> = {
  RASCUNHO:             FileText,
  AGUARDANDO_LIBERACAO: Clock,
  LIBERADA:             CheckCircle2,
  RECUSADA:             XCircle,
  EM_ANDAMENTO:         AlertTriangle,
  FINALIZADA:           CheckCircle2,
  CANCELADA:            XCircle,
  REABERTA:             AlertTriangle,
}

const DEAL_STATUS_COLOR: Record<string, string> = {
  RASCUNHO:             'text-gray-500',
  AGUARDANDO_LIBERACAO: 'text-amber-600',
  LIBERADA:             'text-brand-600',
  RECUSADA:             'text-red-600',
  EM_ANDAMENTO:         'text-blue-600',
  FINALIZADA:           'text-green-600',
  CANCELADA:            'text-gray-400',
  REABERTA:             'text-purple-600',
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function NegociacoesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [deals, setDeals]     = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [typeFilter, setTypeFilter]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const role = session?.user?.role

  useEffect(() => {
    if (status === 'authenticated' && !canAccessModule(role, 'negotiations')) {
      router.replace('/inicio')
    }
  }, [status, role, router])

  const load = useCallback(() => {
    if (!canAccessModule(role, 'negotiations')) return
    setLoading(true)
    const params = new URLSearchParams()
    if (search)       params.set('search', search)
    if (typeFilter)   params.set('type',   typeFilter)
    if (statusFilter) params.set('status', statusFilter)
    fetch(`/api/negotiations?${params}`)
      .then((r) => r.json())
      .then((d) => setDeals(d.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [role, search, typeFilter, statusFilter])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Handshake size={22} className="text-brand-700" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Negociações</h1>
            <p className="text-sm text-gray-500">{deals.length} negociação(ões)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary flex items-center gap-1.5 text-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          {canAccessModule(role, 'negotiations') && (
            <Link href="/negociacoes/nova" className="btn-primary flex items-center gap-1.5 text-sm">
              <Plus size={14} />
              Nova Negociação
            </Link>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="card flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 text-sm"
            placeholder="Buscar por cliente, vendedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input text-sm w-36"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">Todos os tipos</option>
          {Object.entries(DEAL_TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          className="input text-sm w-44"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos os status</option>
          {Object.entries(DEAL_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          </div>
        ) : deals.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3">
            <Handshake size={32} className="text-gray-300" />
            <p className="text-sm text-gray-400">Nenhuma negociação encontrada</p>
            <Link href="/negociacoes/nova" className="btn-primary text-sm">
              Criar primeira negociação
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Tipo</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Valor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Vendedor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Data</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {deals.map((deal) => {
                const StatusIcon = DEAL_STATUS_ICON[deal.status] ?? FileText
                return (
                  <tr key={deal.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {deal.person?.nomeCompleto ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${DEAL_TYPE_COLOR[deal.type] ?? ''}`}>
                        {DEAL_TYPE_LABEL[deal.type] ?? deal.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`flex items-center gap-1.5 text-xs font-medium ${DEAL_STATUS_COLOR[deal.status] ?? ''}`}>
                        <StatusIcon size={13} />
                        {DEAL_STATUS_LABEL[deal.status] ?? deal.status}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {deal.totalPayments
                        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(deal.totalPayments))
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {deal.seller?.user?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(deal.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/negociacoes/${deal.id}`}
                        className="flex items-center gap-1 text-xs text-brand-700 hover:underline"
                      >
                        Ver <ChevronRight size={12} />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
