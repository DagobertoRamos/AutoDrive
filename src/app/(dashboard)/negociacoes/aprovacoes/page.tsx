'use client'

// =============================================================================
// /negociacoes/aprovacoes — Fila de negociações aguardando aprovação
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronRight,
  Clock,
  AlertCircle,
} from 'lucide-react'
import { canAccessModule } from '@/lib/permissions'

interface Deal {
  id:            string
  type:          string
  status:        string
  totalPayments: number | null
  notes:         string | null
  createdAt:     string
  person: { nomeCompleto: string } | null
  seller: { user: { name: string } } | null
}

const TYPE_LABEL: Record<string, string> = {
  VENDA: 'Venda', COMPRA: 'Compra', TROCA: 'Troca', CONSIGNACAO: 'Consignação',
}

export default function AprovacoesPage() {
  const { data: session, status } = useSession()
  const router  = useRouter()
  const role    = session?.user?.role

  const [deals, setDeals]   = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing]   = useState<string | null>(null)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (status === 'authenticated' && !canAccessModule(role, 'negotiations.approve')) {
      router.replace('/negociacoes')
    }
  }, [status, role, router])

  const load = useCallback(() => {
    if (!canAccessModule(role, 'negotiations.approve')) return
    setLoading(true)
    // Busca ambos os status (legado + novo) em paralelo
    Promise.all([
      fetch('/api/negotiations?status=AGUARDANDO_APROVACAO').then(r => r.json()),
      fetch('/api/negotiations?status=AGUARDANDO_LIBERACAO').then(r => r.json()),
    ])
      .then(([a, b]) => {
        const all = [...(a.data ?? []), ...(b.data ?? [])]
        // Remove duplicatas por id
        setDeals(all.filter((d, i, arr) => arr.findIndex(x => x.id === d.id) === i))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [role])

  useEffect(() => { load() }, [load])

  const act = async (id: string, action: 'approve' | 'reject') => {
    setActing(id)
    setError('')
    try {
      const res = await fetch(`/api/negotiations/${id}/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock size={22} className="text-amber-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Aprovações Pendentes</h1>
            <p className="text-sm text-gray-500">{deals.length} negociação(ões) aguardando</p>
          </div>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-1.5 text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : deals.length === 0 ? (
        <div className="card flex h-40 flex-col items-center justify-center gap-2 text-gray-400">
          <CheckCircle2 size={32} />
          <p className="text-sm">Nenhuma negociação aguardando aprovação</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map((deal) => (
            <div key={deal.id} className="card flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-medium text-amber-700">
                    {TYPE_LABEL[deal.type] ?? deal.type}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(deal.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <p className="mt-1 font-semibold text-gray-900">{deal.person?.nomeCompleto ?? '—'}</p>
                <p className="text-sm text-gray-500">
                  Vendedor: {deal.seller?.user?.name ?? '—'}
                  {deal.totalPayments && (
                    <> · {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(deal.totalPayments))}</>
                  )}
                </p>
                {deal.notes && (
                  <p className="mt-1 text-xs text-gray-400 italic">{deal.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/negociacoes/${deal.id}`}
                  className="btn-secondary flex items-center gap-1 text-xs"
                >
                  Ver <ChevronRight size={11} />
                </Link>
                <button
                  onClick={() => act(deal.id, 'reject')}
                  disabled={acting === deal.id}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-40"
                >
                  <XCircle size={13} />
                  Recusar
                </button>
                <button
                  onClick={() => act(deal.id, 'approve')}
                  disabled={acting === deal.id}
                  className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-40"
                >
                  <CheckCircle2 size={13} />
                  Aprovar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
