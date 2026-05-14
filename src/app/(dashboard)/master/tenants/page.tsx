'use client'

// =============================================================================
// /master/tenants — Listagem e gestão de tenants (MASTER only)
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Building2,
  Plus,
  Search,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Ban,
  AlertCircle,
  Users,
  Layers,
  ShieldBan,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TenantCount {
  users: number
  units: number
  deals: number
}

interface Tenant {
  id:               string
  publicId:         string
  slug:             string
  name:             string
  razaoSocial:      string | null
  nomeFantasia:     string | null
  cnpj:             string | null
  plan:             string
  status:           string
  statusReason:     string | null
  primaryColor:     string | null
  responsavel:      string | null
  responsavelEmail: string | null
  trialEndsAt:      string | null
  createdAt:        string
  _count:           TenantCount
}

// ── Constantes de UI ──────────────────────────────────────────────────────────

const PLAN_LABEL: Record<string, string> = {
  BASICO: 'Básico', PRO: 'Pro', VIP: 'VIP', CUSTOM: 'Custom',
}
const PLAN_COLOR: Record<string, string> = {
  BASICO: 'bg-gray-100  text-gray-700',
  PRO:    'bg-blue-100  text-blue-700',
  VIP:    'bg-purple-100 text-purple-700',
  CUSTOM: 'bg-brand-100 text-brand-700',
}
const STATUS_ICON: Record<string, React.ElementType> = {
  ATIVO:     CheckCircle2,
  SUSPENSO:  AlertTriangle,
  BLOQUEADO: Ban,
  BANIDO:    ShieldBan,
  CANCELADO: XCircle,
  TESTE:     Clock,
}
const STATUS_COLOR: Record<string, string> = {
  ATIVO:     'text-green-600',
  SUSPENSO:  'text-amber-600',
  BLOQUEADO: 'text-orange-600',
  BANIDO:    'text-red-700',
  CANCELADO: 'text-gray-400',
  TESTE:     'text-blue-600',
}
const STATUS_LABEL: Record<string, string> = {
  ATIVO: 'Ativo', SUSPENSO: 'Suspenso', BLOQUEADO: 'Bloqueado',
  BANIDO: 'Banido', CANCELADO: 'Cancelado', TESTE: 'Teste',
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function MasterTenantsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [tenants, setTenants]         = useState<Tenant[]>([])
  const [loading, setLoading]         = useState(true)
  const [fetchError, setFetchError]   = useState<string | null>(null)
  const [search, setSearch]           = useState('')
  const [planFilter, setPlanFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // Redireciona usuários que não são MASTER
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') {
      router.replace('/inicio')
    }
  }, [session, status, router])

  // ── Função de carregamento ─────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (session?.user?.role !== 'MASTER') return

    setLoading(true)
    setFetchError(null)

    const params = new URLSearchParams()
    if (search)       params.set('search', search)
    if (planFilter)   params.set('plan',   planFilter)
    if (statusFilter) params.set('status', statusFilter)

    try {
      const res = await fetch(`/api/master/tenants?${params}`, {
        // Garante que a listagem sempre busca dados frescos — sem cache HTTP
        cache: 'no-store',
      })

      // Tenta parsear o JSON independente do status HTTP
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        setFetchError(
          json?.error ?? `Erro ao carregar tenants (HTTP ${res.status}).`
        )
        setTenants([])
        return
      }

      if (!json?.success) {
        setFetchError(json?.error ?? 'Resposta inválida do servidor.')
        setTenants([])
        return
      }

      setTenants(Array.isArray(json.data) ? json.data : [])
    } catch {
      setFetchError('Falha de conexão ao carregar a lista de tenants.')
      setTenants([])
    } finally {
      setLoading(false)
    }
  }, [session, search, planFilter, statusFilter])

  useEffect(() => { load() }, [load])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-6xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 size={22} className="text-brand-700" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Tenants</h1>
            <p className="text-sm text-gray-500">
              {loading
                ? 'Carregando...'
                : fetchError
                  ? 'Erro ao carregar'
                  : `${tenants.length} empresa${tenants.length !== 1 ? 's' : ''} cadastrada${tenants.length !== 1 ? 's' : ''}`
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="btn-secondary flex items-center gap-1.5 text-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <Link
            href="/master/tenants/novo"
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Plus size={14} />
            Novo Tenant
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="card flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 text-sm"
            placeholder="Buscar por nome, razão social, CNPJ, slug, ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input text-sm w-36"
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value)}
        >
          <option value="">Todos os planos</option>
          {Object.entries(PLAN_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select
          className="input text-sm w-40"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Erro de carregamento */}
      {fetchError && !loading && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-medium text-red-700">Falha ao carregar tenants</p>
            <p className="mt-0.5 text-sm text-red-600">{fetchError}</p>
          </div>
          <button
            onClick={load}
            className="ml-auto shrink-0 text-xs font-medium text-red-700 underline hover:no-underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Tabela */}
      <div className="card overflow-hidden p-0">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
          </div>
        ) : tenants.length === 0 && !fetchError ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-gray-400">
            <Building2 size={32} />
            <p className="text-sm">
              {search || planFilter || statusFilter
                ? 'Nenhuma empresa encontrada com os filtros aplicados.'
                : 'Nenhuma empresa cadastrada ainda.'}
            </p>
            {(search || planFilter || statusFilter) && (
              <button
                onClick={() => { setSearch(''); setPlanFilter(''); setStatusFilter('') }}
                className="text-xs text-brand-700 underline hover:no-underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : tenants.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Empresa</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Plano</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">
                  <span className="flex items-center justify-center gap-1">
                    <Users size={12} /> Usuários
                  </span>
                </th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">
                  <span className="flex items-center justify-center gap-1">
                    <Layers size={12} /> Unidades
                  </span>
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Criado em</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tenants.map((t) => {
                const StatusIcon = STATUS_ICON[t.status] ?? Clock
                return (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: t.primaryColor ?? '#166534' }}
                        >
                          {t.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{t.name}</p>
                          <p className="text-xs text-gray-400">
                            {t.nomeFantasia ?? t.razaoSocial ?? t.publicId}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PLAN_COLOR[t.plan] ?? 'bg-gray-100 text-gray-700'}`}>
                        {PLAN_LABEL[t.plan] ?? t.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className={`flex items-center gap-1.5 text-xs font-medium ${STATUS_COLOR[t.status] ?? 'text-gray-500'}`}
                        title={t.statusReason ?? undefined}
                      >
                        <StatusIcon size={13} />
                        {STATUS_LABEL[t.status] ?? t.status}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">{t._count.users}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{t._count.units}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/master/tenants/${t.id}`}
                        className="flex items-center gap-1 text-xs text-brand-700 hover:underline"
                      >
                        Detalhes <ChevronRight size={12} />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  )
}
