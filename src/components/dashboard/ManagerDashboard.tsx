'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ShieldAlert,
  Building2,
  Users,
  Settings,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  Globe,
  Flag,
  Construction,
  Mail,
  Plug,
  XCircle,
  Ban,
  PauseCircle,
  BadgeAlert,
  UserCheck,
  Crown,
  ExternalLink,
  RefreshCw,
  Server,
  Key,
  Terminal,
  Bell,
  Cpu,
  Lock,
  ArrowRight,
  ChevronRight,
  Sparkles,
  Plus,
  Play,
  Pause,
  UserX,
  AlertCircle,
  Calendar,
  DollarSign,
  FileText,
  Check,
} from 'lucide-react'

interface ManagerDashboardData {
  manager: {
    id: string
    name: string
    unitId: string
    unitName: string
  }
  unitOverview: {
    salesMonth: number
    purchasesMonth: number
    tradesMonth: number
    consignmentsMonth: number
    activeDeals: number
    approvedDeals: number
    cancelledDeals: number
  }
  goals: {
    unit: {
      title: string
      target: number
      achieved: number
      percent: number
      remaining: number
      status: 'no ritmo' | 'atenção' | 'atrasado' | 'batida' | 'superada'
    } | null
    team: Array<{
      sellerId: string
      sellerName: string
      goalId: string | null
      title: string
      target: number
      achieved: number
      percent: number
      remaining: number
      status: 'no ritmo' | 'atenção' | 'atrasado' | 'batida' | 'superada'
    }>
  }
  sellers: Array<{
    id: string
    userId: string
    name: string
    cargo: string
    whatsapp: string | null
    queueStatus: 'WAITING' | 'NEXT' | 'CALLED' | 'ACCEPTED' | 'IN_ATTENDANCE' | 'PAUSED' | 'SKIPPED' | 'LEFT' | 'EXPIRED' | 'BLOCKED' | 'OFFLINE'
    position: number | null
    activeLeads: number
    attendancesToday: number
    salesMonth: number
    goalTarget: number
    goalPercent: number
    goalStatus: string
    openPendencies: number
    criticalPendencies: number
    overduePendencies: number
    overdueTasks: number
    averageResponseSeconds: number | null
    acceptanceRate: number
    qualityScore: number
  }>
  leads: {
    newCount: number
    activeCount: number
    noContactCount: number
    followUpTodayCount: number
    overdueCount: number
    convertedMonth: number
    noContactOver24h: number
    funnel: Array<{ name: string; value: number; href: string }>
  }
  pendingIssues: {
    criticalCount: number
    overdueCount: number
    dueTodayCount: number
    escalatedCount: number
    items: Array<{
      id: string
      type: string
      description: string
      priority: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'
      dueDate: string | null
      customerName: string
      negotiation: string | null
      responsibleName: string
    }>
  }
  collections: {
    recommendedActions: Array<{
      sellerId: string
      sellerName: string
      type: 'PENDENCY' | 'LEAD' | 'DEAL'
      message: string
      action: string
      target: string
    }>
  }
  queue: {
    queueId: string | null
    status: 'OPEN' | 'CLOSED'
    vendedorDaVez: {
      sellerId: string
      sellerName: string
      position: number
    } | null
    availableSellers: number
    busySellers: number
    pausedSellers: number
    callsToday: number
    timeoutCount: number
    averageAcceptSeconds: number | null
    recent: Array<{
      id: string
      calledAt: string
      sellerName: string
      visitType: string
      status: string
      result: string | null
      responseSeconds: number | null
    }>
  }
  ranking: {
    sellers: Array<{
      rank: number
      id: string
      name: string
      sales: number
      qualityScore: number
      acceptanceRate: number
    }>
  }
  documentsAndFinance: {
    pendingContracts: number
    pendingDocuments: number
    deliveriesToday: number
    delayedDeliveries: number
    pendingPayments: number
  }
  alerts: Array<{
    type: 'warning' | 'error' | 'info'
    message: string
    action: string
    target: string
  }>
}

interface ManagerDashboardProps {
  firstName: string
  greeting: string
}

export function ManagerDashboard({ firstName, greeting }: ManagerDashboardProps) {
  const [data, setData] = useState<ManagerDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Controle de ações da fila por vendedor
  const [managingSellerId, setManagingSellerId] = useState<string | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [actionType, setActionType] = useState<'pause' | 'resume' | 'add' | 'remove' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    setError(null)
    try {
      const res = await fetch('/api/dashboard/manager', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? 'Falha ao carregar painel gerencial.')
      }
      setData(json.data)
    } catch (err: any) {
      setError(err?.message ?? 'Erro desconhecido ao carregar dashboard.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleQueueAction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!managingSellerId || !actionType || !actionReason.trim()) {
      setActionError('Informe o motivo da alteração.')
      return
    }

    setActionError(null)
    try {
      const res = await fetch('/api/seller-queue/manage-seller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId: managingSellerId,
          action: actionType,
          reason: actionReason.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? 'Falha ao executar ação na fila.')
      }
      // Resetar modais e atualizar
      setManagingSellerId(null)
      setActionType(null)
      setActionReason('')
      loadData(true)
    } catch (err: any) {
      setActionError(err?.message ?? 'Erro na requisição.')
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        <p className="text-sm font-medium text-gray-500 animate-pulse">Carregando cockpit de gerência da loja...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-6 rounded-2xl border border-red-150 bg-red-50/50 text-center shadow-lg">
        <AlertTriangle className="mx-auto text-red-600" size={44} />
        <h2 className="mt-4 text-lg font-bold text-red-900">Falha ao iniciar o Painel Gerencial</h2>
        <p className="mt-2 text-sm text-red-700">{error ?? 'Não foi possível carregar os dados agregados da unidade.'}</p>
        <button
          onClick={() => loadData(false)}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-all shadow-sm"
        >
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    )
  }

  // Resolver status geral da loja baseado em alertas e pendências
  const totalAlerts = data.alerts.length
  let storeStatus: 'Saudável' | 'Atenção' | 'Crítico' = 'Saudável'
  let storeStatusColor = 'text-emerald-700 bg-emerald-50 border-emerald-200'

  if (data.alerts.some((a) => a.type === 'error') || data.pendingIssues.criticalCount > 2) {
    storeStatus = 'Crítico'
    storeStatusColor = 'text-red-700 bg-red-50 border-red-200 animate-pulse'
  } else if (totalAlerts > 0 || data.pendingIssues.overdueCount > 3) {
    storeStatus = 'Atenção'
    storeStatusColor = 'text-amber-700 bg-amber-50 border-amber-200'
  }

  const getQueueStatusBadge = (status: string) => {
    switch (status) {
      case 'WAITING':
      case 'NEXT':
        return 'text-emerald-700 bg-emerald-50 border-emerald-100'
      case 'CALLED':
      case 'ACCEPTED':
      case 'IN_ATTENDANCE':
        return 'text-blue-700 bg-blue-50 border-blue-100 animate-pulse'
      case 'PAUSED':
        return 'text-amber-700 bg-amber-50 border-amber-100'
      case 'BLOCKED':
        return 'text-red-700 bg-red-50 border-red-100'
      default:
        return 'text-gray-500 bg-gray-50 border-gray-150'
    }
  }

  const getGoalStatusColor = (status: string) => {
    switch (status) {
      case 'superada':
      case 'batida':
        return 'text-emerald-700 bg-emerald-50 border-emerald-200'
      case 'no ritmo':
        return 'text-blue-700 bg-blue-50 border-blue-200'
      case 'atrasado':
        return 'text-red-700 bg-red-50 border-red-200'
      default:
        return 'text-amber-700 bg-amber-50 border-amber-200'
    }
  }

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto px-4 py-6">
      {/* ── CADASTRADO CABEÇALHO DA UNIDADE ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-500 shadow-md">
            <Building2 size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">
              Gerência da Unidade — {data.manager.unitName}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Gestor: <strong className="text-gray-800">{data.manager.name}</strong> | Vendedores ativos: {data.sellers.length}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${storeStatusColor}`}>
            <span className="h-2 w-2 rounded-full bg-current" />
            Loja: {storeStatus}
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
            <Users size={12} />
            Fila: {data.queue.status === 'OPEN' ? 'Aberta' : 'Fechada'}
          </span>

          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 transition-all shadow-sm"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Botões Rápidos de Acesso */}
      <div className="flex flex-wrap gap-2.5">
        <Link href="/vendedor-da-vez/painel" className="btn-secondary text-xs bg-white border border-gray-200 px-3 py-2 rounded-xl text-gray-700 font-semibold hover:bg-slate-50 flex items-center gap-1.5 shadow-sm">
          <Activity size={14} className="text-brand-600" /> Abrir Fila
        </Link>
        <Link href="/crm/leads" className="btn-secondary text-xs bg-white border border-gray-200 px-3 py-2 rounded-xl text-gray-700 font-semibold hover:bg-slate-50 flex items-center gap-1.5 shadow-sm">
          <Sparkles size={14} className="text-orange-500" /> Abrir Leads
        </Link>
        <Link href="/pendencias" className="btn-secondary text-xs bg-white border border-gray-200 px-3 py-2 rounded-xl text-gray-700 font-semibold hover:bg-slate-50 flex items-center gap-1.5 shadow-sm">
          <ShieldAlert size={14} className="text-red-500" /> Abrir Pendências
        </Link>
        <Link href="/metas" className="btn-secondary text-xs bg-white border border-gray-200 px-3 py-2 rounded-xl text-gray-700 font-semibold hover:bg-slate-50 flex items-center gap-1.5 shadow-sm">
          <Flag size={14} className="text-blue-500" /> Abrir Metas
        </Link>
        <Link href="/ranking/geral" className="btn-secondary text-xs bg-white border border-gray-200 px-3 py-2 rounded-xl text-gray-700 font-semibold hover:bg-slate-50 flex items-center gap-1.5 shadow-sm">
          <Crown size={14} className="text-amber-500" /> Abrir Ranking
        </Link>
        <Link href="/negociacoes" className="btn-secondary text-xs bg-white border border-gray-200 px-3 py-2 rounded-xl text-gray-700 font-semibold hover:bg-slate-50 flex items-center gap-1.5 shadow-sm">
          <DollarSign size={14} className="text-emerald-500" /> Negociações
        </Link>
      </div>

      {/* ── LINHA 1: CARDS DE VISÃO GERAL (KPIs) ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Produção */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Produção da Loja</h3>
            <TrendingUp size={16} className="text-emerald-600" />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Vendas (Mês):</span>
              <strong className="text-gray-900 font-bold">{data.unitOverview.salesMonth}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Compras / Trocas:</span>
              <strong className="text-gray-900 font-bold">{data.unitOverview.purchasesMonth} / {data.unitOverview.tradesMonth}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Ativas no Funil:</span>
              <strong className="text-gray-900 font-bold">{data.unitOverview.activeDeals}</strong>
            </div>
          </div>
        </div>

        {/* Meta da Unidade */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Meta da Unidade</h3>
            <Flag size={16} className="text-indigo-600" />
          </div>
          {data.goals.unit ? (
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-black text-gray-950">
                  {data.goals.unit.achieved} <span className="text-sm font-semibold text-gray-400">/ {data.goals.unit.target}</span>
                </span>
                <span className="text-xs font-bold text-gray-800">{data.goals.unit.percent}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(data.goals.unit.percent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-gray-500">Faltam: {data.goals.unit.remaining}</span>
                <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold ${getGoalStatusColor(data.goals.unit.status)}`}>
                  {data.goals.unit.status.toUpperCase()}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex h-16 items-center justify-center border border-dashed border-gray-200 rounded-xl">
              <p className="text-xs text-gray-400 font-medium">Nenhuma meta ativa</p>
            </div>
          )}
        </div>

        {/* Leads */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Cockpit de Leads</h3>
            <Sparkles size={16} className="text-orange-500" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Novos:</span>
              <strong className="text-gray-900">{data.leads.newCount}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Hoje:</span>
              <strong className="text-brand-600 font-bold">{data.leads.followUpTodayCount}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Atrasados:</span>
              <strong className={data.leads.overdueCount > 0 ? 'text-red-600 font-bold' : 'text-gray-900'}>
                {data.leads.overdueCount}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Conversões:</span>
              <strong className="text-emerald-700 font-bold">{data.leads.convertedMonth}</strong>
            </div>
          </div>
        </div>

        {/* Pendências */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Pendências Críticas</h3>
            <ShieldAlert size={16} className="text-red-500" />
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Críticas:</span>
              <strong className={data.pendingIssues.criticalCount > 0 ? 'text-red-600 font-bold animate-pulse' : 'text-gray-900'}>
                {data.pendingIssues.criticalCount}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Vencidas:</span>
              <strong className={data.pendingIssues.overdueCount > 0 ? 'text-orange-600 font-bold' : 'text-gray-900'}>
                {data.pendingIssues.overdueCount}
              </strong>
            </div>
            <div className="flex justify-between col-span-2">
              <span className="text-gray-500">Escalonadas Gestor:</span>
              <strong className="text-gray-900">{data.pendingIssues.escalatedCount}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ── LINHA 2: VENDEDORES DA UNIDADE ── */}
      <div className="bg-white border border-gray-150 rounded-2xl shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Users size={18} className="text-brand-600" />
            Visão Geral dos Vendedores da Equipe
          </h2>
          <span className="text-xs text-gray-400 font-semibold">Atualização em tempo real</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-150 text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Nome / Cargo</th>
                <th className="px-6 py-3.5">Status Fila</th>
                <th className="px-6 py-3.5 text-center">Meta Individual</th>
                <th className="px-6 py-3.5 text-center">Leads Ativos</th>
                <th className="px-6 py-3.5 text-center">Pendências (Críticas)</th>
                <th className="px-6 py-3.5 text-center">Resposta Aceite</th>
                <th className="px-6 py-3.5 text-center">Qualidade</th>
                <th className="px-6 py-3.5 text-right">Ações Fila</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {data.sellers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/40 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-gray-900">{s.name}</p>
                    <p className="text-[11px] text-gray-400">{s.cargo}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold ${getQueueStatusBadge(s.queueStatus)}`}>
                        {s.queueStatus === 'OFFLINE' ? 'OFFLINE' : s.queueStatus}
                      </span>
                      {s.position !== null && s.queueStatus !== 'OFFLINE' && (
                        <span className="text-xs text-gray-400 font-semibold">#{s.position} vez</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <p className="font-bold text-gray-900">{s.salesMonth} / {s.goalTarget}</p>
                    <p className="text-[10px] text-gray-400">{s.goalPercent}% da meta</p>
                  </td>
                  <td className="px-6 py-4 text-center font-semibold text-gray-800">
                    {s.activeLeads}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <p className="font-bold text-gray-900">{s.openPendencies}</p>
                    {s.criticalPendencies > 0 && (
                      <p className="text-[10px] text-red-600 font-bold">{s.criticalPendencies} críticas</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <p className="font-semibold text-gray-900">
                      {s.averageResponseSeconds !== null ? `${s.averageResponseSeconds}s` : '—'}
                    </p>
                    <p className="text-[10px] text-gray-400">Aceite: {s.acceptanceRate}%</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center justify-center font-bold h-7 w-7 rounded-full text-xs ${
                      s.qualityScore >= 90
                        ? 'bg-emerald-50 text-emerald-700'
                        : s.qualityScore >= 70
                          ? 'bg-indigo-50 text-indigo-700'
                          : 'bg-red-50 text-red-700'
                    }`}>
                      {s.qualityScore}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="inline-flex gap-1.5">
                      {s.queueStatus === 'OFFLINE' || s.queueStatus === 'LEFT' ? (
                        <button
                          onClick={() => {
                            setActionType('add')
                            setManagingSellerId(s.userId)
                            setActionReason('Entrada manual pelo gestor')
                          }}
                          className="p-1 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                          title="Inserir na fila"
                        >
                          <Play size={14} />
                        </button>
                      ) : (
                        <>
                          {s.queueStatus === 'PAUSED' ? (
                            <button
                              onClick={() => {
                                setActionType('resume')
                                setManagingSellerId(s.userId)
                                setActionReason('Retorno manual pelo gestor')
                              }}
                              className="p-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors"
                              title="Retomar na fila"
                            >
                              <Play size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setActionType('pause')
                                setManagingSellerId(s.userId)
                                setActionReason('Pausa ordenada pelo gestor')
                              }}
                              className="p-1 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 transition-colors"
                              title="Pausar vendedor"
                            >
                              <Pause size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setActionType('remove')
                              setManagingSellerId(s.userId)
                              setActionReason('Retirado manual pelo gestor')
                            }}
                            className="p-1 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 transition-colors"
                            title="Remover da fila"
                          >
                            <UserX size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal / Inline form para Ações Administrativas da Fila */}
      {actionType && managingSellerId && (
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-2xl max-w-md shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 uppercase">Confirmar Ação Administrativa na Fila</h3>
          <p className="text-xs text-gray-500 mt-1">
            Você está alterando o status de {data.sellers.find((s) => s.userId === managingSellerId)?.name}.
          </p>
          <form onSubmit={handleQueueAction} className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Motivo / Justificativa:</label>
              <input
                type="text"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:ring-1 focus:ring-brand-500 outline-none"
                placeholder="Ex: Vendedor em almoço, erro de checkout..."
                required
              />
            </div>
            {actionError && <p className="text-xs text-red-600 font-bold">{actionError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-brand-600 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg hover:bg-brand-700 transition-all"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionType(null)
                  setManagingSellerId(null)
                  setActionReason('')
                  setActionError(null)
                }}
                className="bg-white border border-gray-200 text-gray-700 font-semibold text-xs px-3.5 py-1.5 rounded-lg hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── LINHA 3: FUNIL COMERCIAL & METAS DA EQUIPE ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Funil Comercial */}
        <div className="bg-white border border-gray-150 rounded-2xl shadow-sm p-6 flex flex-col justify-between">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Activity size={18} className="text-orange-500" />
            Funil Comercial da Loja
          </h2>

          <div className="space-y-2">
            {data.leads.funnel.map((stage, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <span className="w-32 text-xs font-semibold text-gray-500 truncate">{stage.name}</span>
                <div className="flex-1 bg-slate-50 border border-gray-100 rounded-lg h-8 relative flex items-center overflow-hidden">
                  <div
                    className="bg-orange-100 border-r border-orange-200 h-full transition-all"
                    style={{
                      width: `${data.leads.newCount > 0 ? (stage.value / Math.max(...data.leads.funnel.map((f) => f.value), 1)) * 100 : 0}%`,
                    }}
                  />
                  <span className="absolute left-3 text-xs font-bold text-gray-800">{stage.value}</span>
                </div>
              </div>
            ))}
          </div>

          {data.leads.noContactOver24h > 0 && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-150 text-amber-700 rounded-xl text-xs flex items-center gap-2 font-semibold">
              <AlertCircle size={14} />
              Gargalo: {data.leads.noContactOver24h} leads sem contato há mais de 24h!
            </div>
          )}
        </div>

        {/* Metas Detalhadas da Equipe */}
        <div className="bg-white border border-gray-150 rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
          <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Flag size={18} className="text-blue-500" />
              Metas da Equipe
            </h2>
            <span className="text-xs text-gray-400 font-semibold">Vendas no Mês</span>
          </div>

          <div className="p-4 flex-1 space-y-4 max-h-[360px] overflow-y-auto">
            {data.goals.team.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center border border-dashed border-gray-200 rounded-2xl text-center">
                <Flag className="text-gray-300" size={32} />
                <p className="text-xs font-bold text-gray-800 mt-2">Nenhum vendedor com meta configurada.</p>
              </div>
            ) : (
              data.goals.team.map((tg) => (
                <div key={tg.sellerId} className="space-y-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-bold text-gray-800">{tg.sellerName}</span>
                    <span className="text-xs font-bold text-gray-500">
                      {tg.achieved} / {tg.target} <span className="text-[10px] text-gray-400">({tg.percent}%)</span>
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div
                      className="bg-brand-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.min(tg.percent, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[9px]">
                    <span className="text-gray-400">Faltam {tg.remaining} para bater</span>
                    <span className={`px-1 rounded border font-semibold ${getGoalStatusColor(tg.status)}`}>
                      {tg.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── LINHA 4: PENDÊNCIAS E COBRANÇAS RECOMENDADAS ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Bloco de Pendências */}
        <div className="bg-white border border-gray-150 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert size={18} className="text-red-500" />
              Pendências da Loja (Top 8)
            </h2>
          </div>

          <div className="p-4 flex-1 divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
            {data.pendingIssues.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="text-emerald-500" size={32} />
                <p className="text-sm font-semibold text-gray-800 mt-2">Nenhuma pendência na unidade.</p>
              </div>
            ) : (
              data.pendingIssues.items.map((item) => (
                <div key={item.id} className="py-3 flex items-start justify-between gap-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono text-gray-400">{item.id}</span>
                      <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold ${
                        item.priority === 'URGENTE'
                          ? 'bg-red-50 text-red-700 border-red-200 animate-pulse'
                          : item.priority === 'ALTA'
                            ? 'bg-orange-50 text-orange-700 border-orange-200'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                      }`}>
                        {item.priority}
                      </span>
                      <span className="text-xs font-semibold text-gray-400">{item.responsibleName}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-900 mt-1">{item.description}</p>
                    {item.negotiation && <p className="text-xs text-gray-400 mt-0.5">Negociação: {item.negotiation}</p>}
                  </div>
                  {item.dueDate && (
                    <span className="text-[10px] font-semibold text-gray-400 shrink-0 mt-0.5 bg-gray-50 border border-gray-150 px-2 py-0.5 rounded-lg">
                      Vence: {new Date(item.dueDate).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Cobranças Recomendadas */}
        <div className="bg-white border border-gray-150 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="border-b border-gray-100 px-6 py-4 bg-slate-50/50">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Mail size={18} className="text-indigo-500" />
              Cobranças Recomendadas à Gestão
            </h2>
          </div>

          <div className="p-4 flex-1 divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
            {data.collections.recommendedActions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="text-emerald-500" size={32} />
                <p className="text-sm font-semibold text-gray-800 mt-2">Nenhuma ação de cobrança sugerida hoje.</p>
                <p className="text-xs text-gray-400 mt-0.5">Todos os vendedores estão com tarefas e pendências atualizadas.</p>
              </div>
            ) : (
              data.collections.recommendedActions.map((action, idx) => (
                <div key={idx} className="py-3.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">{action.message}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Responsável: {action.sellerName}</p>
                  </div>
                  <Link
                    href={action.target}
                    className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 bg-brand-50 border border-brand-200 rounded-lg text-brand-700 hover:bg-brand-100 shrink-0"
                  >
                    Resolver <ArrowRight size={10} />
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── LINHA 5: FILA DO VENDEDOR E ÚLTIMOS ATENDIMENTOS ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Painel da Fila */}
        <div className="bg-white border border-gray-150 p-6 rounded-2xl shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Activity size={18} className="text-brand-600" />
            Fila da Unidade
          </h2>

          <div className="space-y-3">
            {data.queue.vendedorDaVez ? (
              <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-xl">
                <p className="text-[10px] uppercase font-bold text-emerald-800">Vendedor da Vez:</p>
                <p className="text-sm font-black text-emerald-950 mt-0.5">{data.queue.vendedorDaVez.sellerName}</p>
                <p className="text-[10px] text-emerald-600 mt-0.5">Posição: #{data.queue.vendedorDaVez.position}</p>
              </div>
            ) : (
              <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl text-center">
                <p className="text-xs text-gray-400 font-semibold">Nenhum vendedor aguardando na fila</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border border-slate-100 p-2 rounded-lg text-center">
                <p className="text-gray-400">Aguardando</p>
                <p className="text-sm font-bold text-gray-950 mt-0.5">{data.queue.availableSellers}</p>
              </div>
              <div className="border border-slate-100 p-2 rounded-lg text-center">
                <p className="text-gray-400">Em Atendimento</p>
                <p className="text-sm font-bold text-gray-950 mt-0.5">{data.queue.busySellers}</p>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs border-b border-gray-50 pb-2">
              <span className="text-gray-500 font-semibold">Chamadas hoje:</span>
              <strong className="text-gray-900">{data.queue.callsToday}</strong>
            </div>
            <div className="flex justify-between items-center text-xs border-b border-gray-50 pb-2">
              <span className="text-gray-500 font-semibold">Timeouts hoje:</span>
              <strong className={data.queue.timeoutCount > 0 ? 'text-red-600 font-bold' : 'text-gray-900'}>
                {data.queue.timeoutCount}
              </strong>
            </div>
            <div className="flex justify-between items-center text-xs pb-1">
              <span className="text-gray-500 font-semibold">Aceite médio:</span>
              <strong className="text-brand-600">{data.queue.averageAcceptSeconds !== null ? `${data.queue.averageAcceptSeconds}s` : '—'}</strong>
            </div>
          </div>
        </div>

        {/* Últimos Atendimentos */}
        <div className="bg-white border border-gray-150 rounded-2xl shadow-sm overflow-hidden lg:col-span-2 flex flex-col justify-between">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Clock size={18} className="text-indigo-500" />
              Últimos Atendimentos da Unidade
            </h2>
          </div>

          <div className="p-4 flex-1 divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
            {data.queue.recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="text-emerald-500" size={32} />
                <p className="text-sm font-semibold text-gray-800 mt-2">Nenhum atendimento realizado hoje.</p>
              </div>
            ) : (
              data.queue.recent.map((item) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">{item.sellerName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Natureza: {item.visitType} | Aceite: {item.responseSeconds !== null ? `${item.responseSeconds}s` : '—'}
                    </p>
                  </div>
                  <span className={`inline-flex rounded border px-2 py-0.5 text-[9px] font-bold ${
                    item.status === 'FINISHED'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : item.status === 'EXPIRED'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-gray-50 text-gray-700 border-gray-200'
                  }`}>
                    {item.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── LINHA 6: RANKING DA LOJA & DOCUMENTAÇÃO/FINANCEIRO ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Ranking */}
        <div className="bg-white border border-gray-150 rounded-2xl shadow-sm overflow-hidden flex flex-col justify-between">
          <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Crown size={18} className="text-amber-500" />
              Ranking da Unidade (Vendas + Qualidade)
            </h2>
            <span className="text-xs text-gray-400 font-semibold">Mensal</span>
          </div>

          <div className="p-4 flex-1 divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
            {data.ranking.sellers.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center border border-dashed border-gray-200 rounded-2xl text-center">
                <Crown className="text-gray-300" size={32} />
                <p className="text-xs font-bold text-gray-800 mt-2">Nenhum vendedor ranqueado no período.</p>
              </div>
            ) : (
              data.ranking.sellers.map((rs, index) => (
                <div key={rs.id} className="py-2.5 flex items-center justify-between first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center justify-center h-6 w-6 rounded-lg text-xs font-extrabold ${
                      index === 0
                        ? 'bg-amber-100 text-amber-800'
                        : index === 1
                          ? 'bg-slate-100 text-slate-800'
                          : index === 2
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-slate-50 text-slate-600'
                    }`}>
                      {rs.rank}º
                    </span>
                    <span className="text-sm font-bold text-gray-900">{rs.name}</span>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-bold text-gray-900">{rs.sales} vendas</p>
                    <p className="text-[10px] text-gray-400">Qualidade: {rs.qualityScore} | Aceite: {rs.acceptanceRate}%</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Documentação, Financeiro & Entregas */}
        <div className="bg-white border border-gray-150 p-6 rounded-2xl shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Server size={18} className="text-indigo-600" />
            Documentação, Financeiro & Entregas
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="border border-slate-100 p-4 rounded-xl space-y-1">
              <p className="text-[10px] uppercase font-bold text-gray-400">Contratos Pendentes</p>
              <p className="text-lg font-black text-gray-950">{data.documentsAndFinance.pendingContracts}</p>
            </div>
            <div className="border border-slate-100 p-4 rounded-xl space-y-1">
              <p className="text-[10px] uppercase font-bold text-gray-400">Documentação Pendente</p>
              <p className="text-lg font-black text-gray-950">{data.documentsAndFinance.pendingDocuments}</p>
            </div>
            <div className="border border-slate-100 p-4 rounded-xl space-y-1">
              <p className="text-[10px] uppercase font-bold text-gray-400">Entregas Previstas Hoje</p>
              <p className="text-lg font-black text-emerald-700">{data.documentsAndFinance.deliveriesToday}</p>
            </div>
            <div className="border border-slate-100 p-4 rounded-xl space-y-1">
              <p className="text-[10px] uppercase font-bold text-gray-400">Entregas Atrasadas</p>
              <p className={`text-lg font-black ${data.documentsAndFinance.delayedDeliveries > 0 ? 'text-red-600 animate-pulse' : 'text-gray-950'}`}>
                {data.documentsAndFinance.delayedDeliveries}
              </p>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs bg-slate-50 border border-slate-100 p-3.5 rounded-xl">
            <div className="flex items-center gap-2">
              <DollarSign size={16} className="text-emerald-600" />
              <span className="text-gray-700 font-semibold">Negociações Aguardando Sinal:</span>
            </div>
            <strong className="text-sm font-black text-gray-950">{data.documentsAndFinance.pendingPayments}</strong>
          </div>
        </div>
      </div>

      {/* ── LINHA 7: ALERTAS INTELIGENTES & AÇÕES RÁPIDAS ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Alertas Inteligentes */}
        <div className="bg-white border border-gray-150 p-6 rounded-2xl shadow-sm space-y-4 lg:col-span-2">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Bell size={18} className="text-orange-500" />
            Alertas da Gerência (Atenção Agora)
          </h2>

          <div className="space-y-3">
            {data.alerts.length === 0 ? (
              <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-150 text-emerald-800 rounded-xl text-xs font-semibold">
                <CheckCircle2 size={16} />
                Nenhum alerta crítico ativo na loja hoje. Excelente!
              </div>
            ) : (
              data.alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className={`flex items-start justify-between gap-3 p-3 rounded-xl border text-xs ${
                    alert.type === 'error'
                      ? 'bg-red-50 border-red-150 text-red-800'
                      : alert.type === 'warning'
                        ? 'bg-amber-50 border-amber-150 text-amber-800'
                        : 'bg-blue-50 border-blue-150 text-blue-800'
                  }`}
                >
                  <div className="flex gap-2">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span className="font-semibold">{alert.message}</span>
                  </div>
                  <Link href={alert.target} className="text-[10px] font-bold underline shrink-0 hover:opacity-80">
                    Resolver
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ações Rápidas de Gestão */}
        <div className="bg-white border border-gray-150 p-6 rounded-2xl shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Key size={18} className="text-brand-600" />
            Painel Administrativo da Loja
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/vendedor-da-vez/configuracoes"
              className="flex flex-col items-center justify-center p-3 text-center border border-slate-100 rounded-xl hover:bg-slate-50 transition-all group"
            >
              <Settings className="text-brand-600 group-hover:scale-110 transition-transform" size={20} />
              <span className="text-[10px] font-bold text-gray-800 mt-2">Config Fila</span>
            </Link>

            <Link
              href="/cadastros/vendedores"
              className="flex flex-col items-center justify-center p-3 text-center border border-slate-100 rounded-xl hover:bg-slate-50 transition-all group"
            >
              <Users className="text-blue-600 group-hover:scale-110 transition-transform" size={20} />
              <span className="text-[10px] font-bold text-gray-800 mt-2">Vendedores</span>
            </Link>

            <Link
              href="/metas"
              className="flex flex-col items-center justify-center p-3 text-center border border-slate-100 rounded-xl hover:bg-slate-50 transition-all group"
            >
              <Flag className="text-indigo-600 group-hover:scale-110 transition-transform" size={20} />
              <span className="text-[10px] font-bold text-gray-800 mt-2">Metas</span>
            </Link>

            <Link
              href="/pendencias/configuracoes"
              className="flex flex-col items-center justify-center p-3 text-center border border-slate-100 rounded-xl hover:bg-slate-50 transition-all group"
            >
              <ShieldAlert className="text-red-600 group-hover:scale-110 transition-transform" size={20} />
              <span className="text-[10px] font-bold text-gray-800 mt-2">Config Pendências</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
