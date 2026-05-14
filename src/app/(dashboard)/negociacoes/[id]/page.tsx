'use client'

// =============================================================================
// /negociacoes/[id] — Detalhes de uma negociação
// =============================================================================

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Handshake,
  User,
  Car,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Send,
} from 'lucide-react'
import { canAccessModule } from '@/lib/permissions'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DealDetail {
  id:            string
  type:          string
  status:        string
  totalPayments: number | null
  tradeValue:    number | null
  changeAmount:  number | null
  vehicleValue:  number | null
  notes:         string | null
  createdAt:     string
  updatedAt:     string
  person: {
    nomeCompleto: string
    type:         string
    cpf:          string | null
    cnpj:         string | null
    email:        string | null
    phone:        string | null
  } | null
  seller: { user: { name: string; email: string } } | null
  vehicles: Array<{
    role: string
    vehicle: {
      plate: string | null
      brand: string | null
      model: string | null
      year:  number | null
      color: string | null
    } | null
  }>
  statusHistory: Array<{
    id:            string
    previousStatus: string | null
    newStatus:      string
    reason:         string | null
    createdAt:      string
    changedByUser:  { name: string } | null
  }>
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO:             'Rascunho',
  AGUARDANDO_LIBERACAO: 'Aguardando Liberação',
  LIBERADA:             'Liberada',
  RECUSADA:             'Recusada',
  EM_ANDAMENTO:         'Em Andamento',
  FINALIZADA:           'Finalizada',
  CANCELADA:            'Cancelada',
  REABERTA:             'Reaberta',
}

const TYPE_LABEL: Record<string, string> = {
  VENDA: 'Venda', COMPRA: 'Compra', TROCA: 'Troca', CONSIGNACAO: 'Consignação',
}

const fmtBRL = (v: number | null) =>
  v != null
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
    : '—'

// ── Página ────────────────────────────────────────────────────────────────────

export default function NegociacaoDetailPage() {
  const { data: session, status } = useSession()
  const router  = useRouter()
  const { id }  = useParams<{ id: string }>()
  const role    = session?.user?.role

  const [deal, setDeal]   = useState<DealDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing]   = useState<string | null>(null)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (status === 'authenticated' && !canAccessModule(role, 'negotiations')) {
      router.replace('/inicio')
    }
  }, [status, role, router])

  useEffect(() => {
    if (!canAccessModule(role, 'negotiations') || !id) return
    fetch(`/api/negotiations/${id}`)
      .then((r) => r.json())
      .then((d) => setDeal(d.data ?? null))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [role, id])

  const act = async (action: string) => {
    setActing(action)
    setError('')
    try {
      const res = await fetch(`/api/negotiations/${id}/${action}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro')
      setDeal(data.data ?? deal)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setActing(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  if (!deal) {
    return (
      <div className="card flex h-40 flex-col items-center justify-center gap-2 text-gray-400">
        <AlertCircle size={24} />
        <p>Negociação não encontrada</p>
        <Link href="/negociacoes" className="btn-secondary text-sm">Voltar</Link>
      </div>
    )
  }

  const canApprove = canAccessModule(role, 'negotiations.approve') &&
    deal.status === 'AGUARDANDO_LIBERACAO'
  const canSubmit = deal.status === 'RASCUNHO' || deal.status === 'REABERTA'

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/negociacoes" className="btn-secondary p-2">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex items-center gap-2">
          <Handshake size={20} className="text-brand-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {TYPE_LABEL[deal.type] ?? deal.type} · {deal.person?.nomeCompleto ?? '—'}
            </h1>
            <p className="text-sm text-gray-500">
              {STATUS_LABEL[deal.status] ?? deal.status} ·{' '}
              {new Date(deal.createdAt).toLocaleString('pt-BR')}
            </p>
          </div>
        </div>

        {/* Ações */}
        <div className="ml-auto flex items-center gap-2">
          {canSubmit && (
            <button
              onClick={() => act('submit')}
              disabled={acting === 'submit'}
              className="btn-primary flex items-center gap-1.5 text-sm"
            >
              <Send size={13} />
              {acting === 'submit' ? 'Enviando...' : 'Enviar para aprovação'}
            </button>
          )}
          {canApprove && (
            <>
              <button
                onClick={() => act('reject')}
                disabled={!!acting}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-40"
              >
                <XCircle size={13} />
                Recusar
              </button>
              <button
                onClick={() => act('approve')}
                disabled={!!acting}
                className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-40"
              >
                <CheckCircle2 size={13} />
                Aprovar
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Cliente */}
        <div className="card space-y-3">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800">
            <User size={15} className="text-brand-600" />
            Cliente
          </h2>
          {deal.person ? (
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Nome</dt>
                <dd className="font-medium text-gray-800">{deal.person.nomeCompleto}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Tipo</dt>
                <dd className="text-gray-700">{deal.person.type === 'FISICA' ? 'Pessoa Física' : 'Pessoa Jurídica'}</dd>
              </div>
              {deal.person.cpf && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">CPF</dt>
                  <dd className="font-mono text-gray-700">{deal.person.cpf}</dd>
                </div>
              )}
              {deal.person.cnpj && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">CNPJ</dt>
                  <dd className="font-mono text-gray-700">{deal.person.cnpj}</dd>
                </div>
              )}
              {deal.person.email && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">E-mail</dt>
                  <dd className="text-gray-700">{deal.person.email}</dd>
                </div>
              )}
              {deal.person.phone && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Telefone</dt>
                  <dd className="text-gray-700">{deal.person.phone}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-gray-400">Sem dados de cliente</p>
          )}
        </div>

        {/* Financeiro */}
        <div className="card space-y-3">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800">
            <DollarSign size={15} className="text-brand-600" />
            Valores
          </h2>
          <dl className="space-y-1.5 text-sm">
            {deal.vehicleValue != null && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Valor do veículo</dt>
                <dd className="font-medium text-gray-700">{fmtBRL(Number(deal.vehicleValue))}</dd>
              </div>
            )}
            {deal.tradeValue != null && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Troca</dt>
                <dd className="font-medium text-gray-700">{fmtBRL(Number(deal.tradeValue))}</dd>
              </div>
            )}
            {deal.totalPayments != null && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Total a receber</dt>
                <dd className="font-bold text-brand-700">{fmtBRL(Number(deal.totalPayments))}</dd>
              </div>
            )}
            {deal.changeAmount != null && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Troco</dt>
                <dd className="font-medium text-gray-700">{fmtBRL(Number(deal.changeAmount))}</dd>
              </div>
            )}
          </dl>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Vendedor</span>
            <span className="text-gray-700">{deal.seller?.user?.name ?? '—'}</span>
          </div>
        </div>

        {/* Veículos */}
        {deal.vehicles.length > 0 && (
          <div className="card space-y-3 md:col-span-2">
            <h2 className="flex items-center gap-2 font-semibold text-gray-800">
              <Car size={15} className="text-brand-600" />
              Veículo(s)
            </h2>
            <div className="space-y-2">
              {deal.vehicles.map((dv, i) => (
                <div key={i} className="flex items-center gap-4 rounded-lg bg-gray-50 px-4 py-3 text-sm">
                  <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                    {dv.role}
                  </span>
                  {dv.vehicle && (
                    <span className="text-gray-700">
                      {[dv.vehicle.brand, dv.vehicle.model, dv.vehicle.year].filter(Boolean).join(' ')}
                      {dv.vehicle.plate && <> · <span className="font-mono">{dv.vehicle.plate}</span></>}
                      {dv.vehicle.color && <> · {dv.vehicle.color}</>}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Histórico */}
        <div className="card space-y-3 md:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold text-gray-800">
            <Clock size={15} className="text-brand-600" />
            Histórico de Status
          </h2>
          {deal.statusHistory.length === 0 ? (
            <p className="text-sm text-gray-400">Sem histórico</p>
          ) : (
            <ol className="space-y-2 border-l-2 border-gray-100 pl-4">
              {deal.statusHistory.map((h) => (
                <li key={h.id} className="relative text-sm">
                  <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-brand-200 ring-2 ring-white" />
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-gray-800">{STATUS_LABEL[h.newStatus] ?? h.newStatus}</span>
                    {h.previousStatus && (
                      <span className="text-xs text-gray-400">← {STATUS_LABEL[h.previousStatus] ?? h.previousStatus}</span>
                    )}
                    <span className="ml-auto text-xs text-gray-400">
                      {new Date(h.createdAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  {(h.reason || h.changedByUser) && (
                    <p className="text-xs text-gray-400">
                      {h.changedByUser?.name && <>{h.changedByUser.name} · </>}
                      {h.reason}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Observações */}
        {deal.notes && (
          <div className="card md:col-span-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Observações</p>
            <p className="text-sm text-gray-700">{deal.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
