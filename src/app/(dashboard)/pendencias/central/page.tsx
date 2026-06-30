'use client'

// =============================================================================
// Central de Avisos — AutoDrive
// Visão enterprise completa: SLA, severidade, atribuição, escalonamento,
// varredura automática, filtros avançados, kanban/tabela.
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import {
  RefreshCw, Search, Eye, Filter, AlertTriangle, Activity,
  BarChart2, UserCheck, Clock, Zap, PlayCircle, ArrowUpCircle, UserCog, ShieldAlert,
  CheckCircle2, XCircle, Timer, Inbox, Plus,
} from 'lucide-react'
import { PriorityBadge, StatusBadge } from '@/components/pendencies/PendencyStatusBadge'
import { PendencyModal } from '@/components/pendencies/PendencyModal'
import { CreatePendencyModal } from '@/components/pendencies/CreatePendencyModal'
import { cn, formatDate } from '@/lib/utils'
import type { PendencyWithRelations } from '@/types'

// ── Tipos locais ──────────────────────────────────────────────────────────────

interface Filters {
  search:       string
  status:       string
  priority:     string
  severity:     string
  unitId:       string
  originModule: string
  assignedOnly: boolean
  slaVencida:   boolean
}

interface ScanReport {
  totalCreated: number
  totalUpdated: number
  totalErrors:  number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SlaIndicator({ slaDeadline }: { slaDeadline?: string | null }) {
  if (!slaDeadline) return <span className="text-gray-300 text-xs">—</span>

  const deadline = new Date(slaDeadline)
  const now      = new Date()
  const diffMs   = deadline.getTime() - now.getTime()
  const diffMin  = Math.round(diffMs / 60000)
  const isExpired = diffMs < 0

  const label = isExpired
    ? `Venceu ${Math.abs(diffMin)}min atrás`
    : diffMin < 60
    ? `${diffMin}min restantes`
    : diffMin < 1440
    ? `${Math.round(diffMin / 60)}h restantes`
    : `${Math.round(diffMin / 1440)}d restantes`

  return (
    <span className={cn(
      'flex items-center gap-1 text-xs font-medium whitespace-nowrap',
      isExpired           ? 'text-red-600'
      : diffMin < 60      ? 'text-amber-600'
      : diffMin < 240     ? 'text-yellow-600'
      :                     'text-emerald-600',
    )}>
      <Timer size={11} />
      {label}
    </span>
  )
}

function SeverityBadge({ severity }: { severity?: string | null }) {
  if (!severity) return null
  const map: Record<string, string> = {
    LOW:      'bg-gray-100 text-gray-600',
    MEDIUM:   'bg-blue-100 text-blue-700',
    HIGH:     'bg-orange-100 text-orange-700',
    CRITICAL: 'bg-red-100 text-red-700',
  }
  const labels: Record<string, string> = {
    LOW: 'Baixo', MEDIUM: 'Médio', HIGH: 'Alto', CRITICAL: 'Crítico',
  }
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-xs font-semibold', map[severity] ?? map.MEDIUM)}>
      {labels[severity] ?? severity}
    </span>
  )
}

function ModuleBadge({ module }: { module?: string | null }) {
  if (!module) return null
  const map: Record<string, string> = {
    DEALS:       'bg-purple-100 text-purple-700',
    COMMISSIONS: 'bg-yellow-100 text-yellow-700',
    STOCK:       'bg-cyan-100 text-cyan-700',
    WHATSAPP:    'bg-green-100 text-green-700',
    CRM:         'bg-pink-100 text-pink-700',
    MANUAL:      'bg-gray-100 text-gray-600',
  }
  const labels: Record<string, string> = {
    DEALS: 'Negoc.', COMMISSIONS: 'Comissão', STOCK: 'Estoque',
    WHATSAPP: 'WhatsApp', CRM: 'CRM', MANUAL: 'Manual',
  }
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', map[module] ?? map.MANUAL)}>
      {labels[module] ?? module}
    </span>
  )
}

// ── Tabs de status ────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: '',             label: 'Todas',        icon: Inbox },
  { key: 'ABERTA',       label: 'Abertas',      icon: AlertTriangle },
  { key: 'EM_ANDAMENTO', label: 'Em Andamento', icon: Activity },
  { key: 'VENCIDA',      label: 'Vencidas',     icon: XCircle },
  { key: 'FINALIZADA',   label: 'Finalizadas',  icon: CheckCircle2 },
]

// ── Componente principal ──────────────────────────────────────────────────────

export default function CentralAvisosPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''
  const isManager= ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'].includes(role)

  const [pendencies,   setPendencies]   = useState<PendencyWithRelations[]>([])
  const [loading,      setLoading]      = useState(true)
  const [selected,     setSelected]     = useState<PendencyWithRelations | null>(null)
  const [creating,     setCreating]     = useState(false)
  const [page,         setPage]         = useState(1)
  const [total,        setTotal]        = useState(0)
  const [scanning,     setScanning]     = useState(false)
  const [scanReport,   setScanReport]   = useState<ScanReport | null>(null)
  const [assigningId,  setAssigningId]  = useState<string | null>(null)
  const [escalatingId, setEscalatingId] = useState<string | null>(null)

  const [filters, setFilters] = useState<Filters>({
    search: '', status: '', priority: '', severity: '',
    unitId: '', originModule: '', assignedOnly: false, slaVencida: false,
  })

  const PER_PAGE = 50

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchPendencies = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.status)       params.set('status',   filters.status)
      if (filters.priority)     params.set('priority', filters.priority)
      if (filters.severity)     params.set('severity', filters.severity)
      if (filters.unitId)       params.set('unitId',   filters.unitId)
      if (filters.originModule) params.set('originModule', filters.originModule)
      if (filters.search)       params.set('search',   filters.search)
      if (filters.assignedOnly) params.set('assignedOnly', 'true')
      if (filters.slaVencida)   params.set('slaVencida',   'true')
      params.set('page',    String(page))
      params.set('perPage', String(PER_PAGE))

      const res  = await fetch(`/api/pendencies?${params}`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setPendencies(data.data ?? [])
        setTotal(data.meta?.total ?? 0)
      }
    } catch {
      // mantém estado anterior
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => { fetchPendencies() }, [fetchPendencies])

  const setFilter = (key: keyof Filters, value: string | boolean) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const totalPages = Math.ceil(total / PER_PAGE)

  // ── Scanner manual ─────────────────────────────────────────────────────────

  const handleScan = async () => {
    setScanning(true)
    setScanReport(null)
    try {
      const res  = await fetch('/api/pendency-scan/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
        credentials: 'include',
      })
      const json = await res.json()
      if (json.success) {
        setScanReport(json.data)
        await fetchPendencies()
      }
    } catch { /* silencioso */ } finally {
      setScanning(false)
    }
  }

  // ── Atribuir a mim ─────────────────────────────────────────────────────────

  const handleAssignToMe = async (pendencyId: string) => {
    if (!session?.user?.id) return
    setAssigningId(pendencyId)
    try {
      await fetch(`/api/pendencies/${pendencyId}/assign`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ assignedUserId: session.user.id }),
        credentials: 'include',
      })
      await fetchPendencies()
    } catch { /* silencioso */ } finally {
      setAssigningId(null)
    }
  }

  // ── Escalonar ──────────────────────────────────────────────────────────────

  const handleEscalate = async (pendencyId: string, reason: string) => {
    if (!reason.trim()) return
    setEscalatingId(pendencyId)
    try {
      await fetch(`/api/pendencies/${pendencyId}/escalate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reason }),
        credentials: 'include',
      })
      await fetchPendencies()
    } catch { /* silencioso */ } finally {
      setEscalatingId(null)
    }
  }

  // ── Métricas ───────────────────────────────────────────────────────────────

  const metrics = useMemo(() => {
    const now = new Date()
    return {
      total,
      urgentes:    pendencies.filter((p) => p.priority === 'URGENTE').length,
      emAndamento: pendencies.filter((p) => p.status === 'EM_ANDAMENTO').length,
      slaVencidas: pendencies.filter((p) => {
        const dl = (p as { slaDeadline?: string }).slaDeadline
        return dl && new Date(dl) < now && !['FINALIZADA', 'CANCELADA'].includes(p.status)
      }).length,
      escaladas:   pendencies.filter((p) => (p as { escalatedAt?: string }).escalatedAt).length,
    }
  }, [pendencies, total])

  const hasActiveFilters = filters.search || filters.priority || filters.severity
    || filters.unitId || filters.originModule || filters.assignedOnly || filters.slaVencida

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <ShieldAlert size={20} className="text-brand-600" />
            Central de Avisos
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {loading ? 'Carregando...' : `${total} pendências${filters.status ? ` · filtro: ${filters.status}` : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isManager && (
            <button onClick={() => setCreating(true)} className="btn-primary text-xs">
              <Plus size={13} />Nova pendência
            </button>
          )}
          {isManager && (
            <button
              onClick={handleScan}
              disabled={scanning}
              title="Varrer todos os módulos automaticamente"
              className="btn-secondary text-xs"
            >
              <PlayCircle size={13} className={cn(scanning && 'animate-pulse text-brand-500')} />
              {scanning ? 'Varrendo…' : 'Varredura automática'}
            </button>
          )}
          <button onClick={fetchPendencies} disabled={loading} className="btn-secondary text-xs">
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
            Atualizar
          </button>
        </div>
      </div>

      {/* ── Resultado da varredura ───────────────────────────────────────────── */}
      {scanReport && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="font-semibold">Varredura concluída:</span>{' '}
          {scanReport.totalCreated} pendências criadas, {scanReport.totalUpdated} atualizadas
          {scanReport.totalErrors > 0 && `, ${scanReport.totalErrors} erros`}.
          <button onClick={() => setScanReport(null)} className="ml-3 text-xs underline opacity-70">
            Fechar
          </button>
        </div>
      )}

      {/* ── Métricas ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Total',        value: metrics.total,        color: 'bg-gray-50 border-gray-200 text-gray-700',   icon: BarChart2 },
          { label: 'Urgentes',     value: metrics.urgentes,     color: 'bg-red-50 border-red-200 text-red-700',      icon: AlertTriangle },
          { label: 'Em Andamento', value: metrics.emAndamento,  color: 'bg-blue-50 border-blue-200 text-blue-700',   icon: Activity },
          { label: 'SLA Vencido',  value: metrics.slaVencidas,  color: 'bg-amber-50 border-amber-200 text-amber-700',icon: Clock },
          { label: 'Escaladas',    value: metrics.escaladas,    color: 'bg-purple-50 border-purple-200 text-purple-700',icon: Zap },
        ].map((c) => {
          const Icon = c.icon
          return (
            <div key={c.label} className={cn('rounded-xl border p-3 text-center', c.color)}>
              <Icon size={14} className="mx-auto mb-1 opacity-60" />
              <p className="text-2xl font-bold tabular-nums">{loading ? '—' : c.value}</p>
              <p className="mt-0.5 text-xs font-medium">{c.label}</p>
            </div>
          )
        })}
      </div>

      {/* ── Tabs de status ──────────────────────────────────────────────────── */}
      <div className="flex gap-1 overflow-x-auto">
        {STATUS_TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setFilter('status', tab.key)}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition',
                filters.status === tab.key
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100',
              )}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Filtros avançados ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Buscar cliente, placa, veículo..."
            className="input pl-9"
          />
        </div>
        <select
          value={filters.priority}
          onChange={(e) => setFilter('priority', e.target.value)}
          className="input w-auto"
        >
          <option value="">Prioridade</option>
          <option value="URGENTE">🔴 Urgente</option>
          <option value="ALTA">🟠 Alta</option>
          <option value="MEDIA">🟡 Média</option>
          <option value="BAIXA">⚪ Baixa</option>
        </select>
        <select
          value={filters.severity}
          onChange={(e) => setFilter('severity', e.target.value)}
          className="input w-auto"
        >
          <option value="">Severidade</option>
          <option value="CRITICAL">Crítico</option>
          <option value="HIGH">Alto</option>
          <option value="MEDIUM">Médio</option>
          <option value="LOW">Baixo</option>
        </select>
        <select
          value={filters.originModule}
          onChange={(e) => setFilter('originModule', e.target.value)}
          className="input w-auto"
        >
          <option value="">Módulo</option>
          <option value="DEALS">Negociações</option>
          <option value="COMMISSIONS">Comissões</option>
          <option value="STOCK">Estoque</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="CRM">CRM</option>
          <option value="MANUAL">Manual</option>
        </select>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={filters.slaVencida}
            onChange={(e) => setFilter('slaVencida', e.target.checked)}
            className="rounded"
          />
          SLA vencido
        </label>
        {hasActiveFilters && (
          <button
            onClick={() => {
              setFilters({ search: '', status: filters.status, priority: '', severity: '',
                unitId: '', originModule: '', assignedOnly: false, slaVencida: false })
              setPage(1)
            }}
            className="text-xs text-gray-500 underline hover:text-gray-700"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* ── Tabela principal ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {[
                  'Prioridade / Severidade', 'Status', 'Cliente',
                  'Módulo', 'Vendedor', 'Unidade',
                  'SLA', 'Vencimento', 'Atribuído', 'Ações',
                ].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-gray-200" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pendencies.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center">
                    <Filter size={32} className="mx-auto mb-2 text-gray-300" strokeWidth={1} />
                    <p className="text-sm text-gray-400">Nenhuma pendência encontrada</p>
                    {isManager && (
                      <p className="mt-1 text-xs text-gray-400">
                        Tente executar uma varredura automática para detectar novas pendências.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                pendencies.map((p) => {
                  const ext     = p as PendencyWithRelations & {
                    slaDeadline?:    string | null
                    severity?:       string | null
                    escalatedAt?:    string | null
                    assignedUser?:   { name: string } | null
                    originModule?:   string | null
                  }
                  const overdue = p.dueDate && new Date(p.dueDate) < new Date()
                  const isEscalated = Boolean(ext.escalatedAt)

                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        'transition-colors hover:bg-gray-50',
                        isEscalated && 'bg-red-50/40',
                      )}
                    >
                      {/* Prioridade / Severidade */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <PriorityBadge priority={p.priority} size="sm" />
                          <SeverityBadge severity={ext.severity} />
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={p.status} size="sm" />
                          {isEscalated && (
                            <span className="flex items-center gap-0.5 text-xs font-semibold text-red-600">
                              <Zap size={10} /> Escalado
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Cliente */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="font-medium text-gray-800">{p.customerName}</p>
                        {p.plate && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                            {p.plate}
                          </span>
                        )}
                      </td>

                      {/* Módulo */}
                      <td className="px-4 py-3">
                        <ModuleBadge module={ext.originModule} />
                      </td>

                      {/* Vendedor */}
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600 text-xs">
                        {p.responsible?.shortName ?? p.responsible?.fullName ?? '—'}
                      </td>

                      {/* Unidade */}
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600 text-xs">
                        {p.unit?.name ?? '—'}
                      </td>

                      {/* SLA */}
                      <td className="px-4 py-3">
                        <SlaIndicator slaDeadline={ext.slaDeadline} />
                      </td>

                      {/* Vencimento */}
                      <td className="whitespace-nowrap px-4 py-3">
                        {p.dueDate ? (
                          <span className={cn('text-xs', overdue ? 'font-semibold text-red-600' : 'text-gray-500')}>
                            {formatDate(new Date(p.dueDate))}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>

                      {/* Atribuído */}
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
                        {ext.assignedUser?.name
                          ? <span className="flex items-center gap-1"><UserCheck size={11} className="text-emerald-500" />{ext.assignedUser.name}</span>
                          : <span className="text-gray-400 italic">Não atribuído</span>}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setSelected(p)}
                            title="Ver detalhes"
                            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                          >
                            <Eye size={14} />
                          </button>

                          {isManager && !ext.assignedUser && (
                            <button
                              onClick={() => handleAssignToMe(p.id)}
                              disabled={assigningId === p.id}
                              title="Atribuir a mim"
                              className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors disabled:opacity-50"
                            >
                              <UserCog size={14} />
                            </button>
                          )}

                          {isManager && !isEscalated && (
                            <button
                              onClick={() => {
                                const reason = prompt('Motivo do escalonamento:')
                                if (reason && reason.trim().length >= 5) {
                                  handleEscalate(p.id, reason)
                                } else if (reason !== null) {
                                  alert('Motivo deve ter no mínimo 5 caracteres.')
                                }
                              }}
                              disabled={escalatingId === p.id}
                              title="Escalonar"
                              className="rounded p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600 transition-colors disabled:opacity-50"
                            >
                              <ArrowUpCircle size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-500">
              Página {page} de {totalPages} — {total} registros
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => p - 1)}
                className="btn-secondary text-xs disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary text-xs disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal de detalhe ─────────────────────────────────────────────────── */}
      {selected && (
        <PendencyModal
          pendency={selected}
          onClose={() => setSelected(null)}
          onRefresh={() => { setSelected(null); fetchPendencies() }}
        />
      )}

      {/* ── Nova pendência (com lembrete por push) ───────────────────────────── */}
      {creating && (
        <CreatePendencyModal onClose={() => setCreating(false)} onCreated={fetchPendencies} />
      )}
    </div>
  )
}
