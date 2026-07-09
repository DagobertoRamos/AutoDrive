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
  Palette,
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
} from 'lucide-react'

interface MasterDashboardData {
  platform: {
    status: 'healthy' | 'warning' | 'degraded' | 'critical'
    issuesCount: number
    maintenanceActive: boolean
    lastIncidentAt: string | null
  }
  tenants: {
    summary: {
      total: number
      ativo: number
      teste: number
      suspenso: number
      bloqueado: number
      inadimplente: number
      paused: number
      cancelado: number
    }
    warnings: Array<{
      id: string
      name: string
      plan: string
      status: string
      issue: string
      action: string
    }>
  }
  tickets: {
    open: number
    critical: number
    overdue: number
    inProgress: number
    waiting: number
    items: Array<{
      id: string
      title: string
      tenantName: string
      priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
      status: 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED'
      durationText: string
    }>
  }
  infrastructure: {
    app: { status: string; pingMs: number }
    database: { status: string; pingMs: number; error: string | null }
    jobs: { status: string; lastExecution: string }
    deploy: {
      branch: string
      commit: string
      env: string
      updatedAt: string
    }
  }
  integrations: Array<{
    id: string
    name: string
    service: string
    status: 'CONNECTED' | 'INACTIVE' | 'ERROR' | 'UNCONFIGURED'
    lastTested: string | null
    lastMsg: string | null
  }>
  notifications: {
    fcmActive: number
    webPushActive: number
    invalidSubscriptions: number
    failures24h: number
  }
  queue: {
    activeQueues: number
    pendingCalls: number
    averageAcceptSeconds: number
  }
  security: {
    failedLoginsToday: number
    permissionChangesToday: number
    blockedUsers: number
  }
  recentErrors: Array<{
    time: string
    service: string
    message: string
    tenant: string
  }>
}

interface MasterDashboardProps {
  firstName: string
  greeting: string
}

export function MasterDashboard({ firstName, greeting }: MasterDashboardProps) {
  const [data, setData] = useState<MasterDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    setError(null)
    try {
      const res = await fetch('/api/master/dashboard', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? 'Falha ao carregar métricas globais.')
      }
      setData(json.data)
    } catch (err: any) {
      setError(err?.message ?? 'Erro desconhecido ao carregar painel.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        <p className="text-sm font-medium text-gray-500 animate-pulse">Carregando painel de controle SaaS...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-6 rounded-2xl border border-red-150 bg-red-50/50 text-center shadow-lg">
        <AlertTriangle className="mx-auto text-red-600" size={44} />
        <h2 className="mt-4 text-lg font-bold text-red-900">Falha ao iniciar o Painel Master</h2>
        <p className="mt-2 text-sm text-red-700">{error ?? 'Não foi possível carregar os dados agregados.'}</p>
        <button
          onClick={() => loadData(false)}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-all shadow-sm"
        >
          <RefreshCw size={14} /> Tentar novamente
        </button>
      </div>
    )
  }

  // Cores de status
  const platformStatusLabels = {
    healthy: { label: 'Operacional', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    warning: { label: 'Atenção', color: 'text-amber-700 bg-amber-50 border-amber-200 animate-pulse' },
    degraded: { label: 'Degradado', color: 'text-orange-700 bg-orange-50 border-orange-200' },
    critical: { label: 'Crítico', color: 'text-red-700 bg-red-50 border-red-200 animate-bounce' },
  }

  const currentStatus = platformStatusLabels[data.platform.status] ?? platformStatusLabels.healthy

  const getPriorityColor = (prio: string) => {
    switch (prio) {
      case 'CRITICAL':
        return 'bg-red-50 text-red-700 border-red-200'
      case 'HIGH':
        return 'bg-orange-50 text-orange-700 border-orange-200'
      case 'MEDIUM':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200'
    }
  }

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto px-4 py-6">
      {/* ── CADASTRADO CABEÇALHO GLOBAL ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-700 to-purple-500 shadow-md">
            <Crown size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">
              {greeting}, {firstName}!
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">Torre de controle SaaS & Infraestrutura Global</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${currentStatus.color}`}>
            <span className="h-2 w-2 rounded-full bg-current" />
            {currentStatus.label}
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
            <Server size={12} />
            {data.infrastructure.deploy.env.toUpperCase()}
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

      {/* ── LINHA 1: CARDS DE SAÚDE GLOBAL ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Status Plataforma */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700">
            <Cpu size={20} />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Saúde Plataforma</h3>
            <p className="text-xl font-black text-gray-950 mt-0.5">{currentStatus.label}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {data.platform.issuesCount === 0 ? 'Tudo operacional' : `${data.platform.issuesCount} problemas de atenção`}
            </p>
          </div>
        </div>

        {/* Tenants */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700">
            <Building2 size={20} />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Tenants</h3>
            <p className="text-xl font-black text-gray-950 mt-0.5">
              {data.tenants.summary.ativo} ativos
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Total: {data.tenants.summary.total} | Suspensos: {data.tenants.summary.suspenso + data.tenants.summary.bloqueado}
            </p>
          </div>
        </div>

        {/* Tickets / Chamados */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Chamados / Tickets</h3>
            <p className="text-xl font-black text-gray-950 mt-0.5">{data.tickets.open} em aberto</p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Críticos: {data.tickets.critical} | SLA próximo: {data.tickets.overdue}
            </p>
          </div>
        </div>

        {/* Infraestrutura / Deploy */}
        <div className="bg-white border border-gray-150 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700">
            <Server size={20} />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Infraestrutura</h3>
            <p className="text-xl font-black text-gray-950 mt-0.5">
              Banco: {data.infrastructure.database.status}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5 truncate">
              Commit: {data.infrastructure.deploy.commit} ({data.infrastructure.deploy.branch})
            </p>
          </div>
        </div>
      </div>

      {/* ── LINHA 2: TICKETS E TENANTS EM ATENÇÃO ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Bloco Chamados/Tickets */}
        <div className="bg-white border border-gray-150 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert size={18} className="text-amber-500" />
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Tickets de Suporte & Plataforma</h2>
            </div>
            <span className="text-xs text-gray-400 font-medium">SLA Ativo</span>
          </div>

          <div className="p-4 flex-1 divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
            {data.tickets.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="text-emerald-500" size={32} />
                <p className="text-sm font-semibold text-gray-800 mt-2">Nenhum chamado crítico no momento.</p>
                <p className="text-xs text-gray-400 mt-0.5">Todas as lojas e integradoras estão operando sem falhas relatadas.</p>
              </div>
            ) : (
              data.tickets.items.map((ticket) => (
                <div key={ticket.id} className="py-3 flex items-start justify-between gap-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-gray-400">{ticket.id}</span>
                      <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold ${getPriorityColor(ticket.priority)}`}>
                        {ticket.priority}
                      </span>
                      <span className="text-xs text-gray-500 font-medium truncate">{ticket.tenantName}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-900 mt-1">{ticket.title}</p>
                  </div>
                  <span className="text-xs font-semibold text-gray-400 shrink-0 mt-0.5 bg-gray-50 border border-gray-150 px-2 py-0.5 rounded-lg">
                    {ticket.durationText}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bloco Tenants em Atenção */}
        <div className="bg-white border border-gray-150 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-indigo-600" />
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Tenants com Pendências / Erros</h2>
            </div>
            <Link href="/master/tenants" className="text-xs text-brand-700 font-bold hover:underline flex items-center gap-1">
              Ver todos <ExternalLink size={10} />
            </Link>
          </div>

          <div className="p-4 flex-1 divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
            {data.tenants.warnings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="text-emerald-500" size={32} />
                <p className="text-sm font-semibold text-gray-800 mt-2">Nenhum tenant em atenção.</p>
                <p className="text-xs text-gray-400 mt-0.5">Todas as lojas possuem configurações válidas e usuários ativos.</p>
              </div>
            ) : (
              data.tenants.warnings.map((tenant) => (
                <div key={tenant.id} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">{tenant.name}</p>
                    <p className="text-xs text-red-600 font-medium mt-0.5">{tenant.issue}</p>
                  </div>
                  <Link
                    href={`/master/tenants/${tenant.id}`}
                    className="btn-secondary text-[11px] font-bold px-3 py-1 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-100 shrink-0"
                  >
                    {tenant.action}
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── LINHA 3: INFRAESTRUTURA E INTEGRAÇÕES ── */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Bloco Infraestrutura detalhado */}
        <div className="bg-white border border-gray-150 rounded-2xl shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Server size={18} className="text-blue-500" />
            Infraestrutura Global
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="border border-gray-100 p-4 rounded-xl">
              <p className="text-xs text-gray-400 font-semibold uppercase">Banco de Dados</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${data.infrastructure.database.status === 'OK' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <p className="text-sm font-bold text-gray-900">
                  {data.infrastructure.database.status === 'OK' ? 'Neon Postgres (OK)' : 'Falha na conexão'}
                </p>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Ping de resposta: {data.infrastructure.database.pingMs}ms</p>
              {data.infrastructure.database.error && (
                <p className="text-[10px] text-red-600 mt-1 truncate">{data.infrastructure.database.error}</p>
              )}
            </div>

            <div className="border border-gray-100 p-4 rounded-xl">
              <p className="text-xs text-gray-400 font-semibold uppercase">Cron / Workers</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <p className="text-sm font-bold text-gray-900">Agendador Fila (OK)</p>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">Último tick: {data.infrastructure.jobs.lastExecution}</p>
            </div>
          </div>

          <div className="border border-gray-100 p-4 rounded-xl">
            <p className="text-xs text-gray-400 font-semibold uppercase">Último Deploy Vercel</p>
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
              <p className="text-gray-500">Branch: <strong className="text-gray-800">{data.infrastructure.deploy.branch}</strong></p>
              <p className="text-gray-500">Commit: <strong className="text-gray-800">{data.infrastructure.deploy.commit}</strong></p>
              <p className="text-gray-500">Ambiente: <strong className="text-gray-800">{data.infrastructure.deploy.env}</strong></p>
              <p className="text-gray-500">Data: <strong className="text-gray-800">{data.infrastructure.deploy.updatedAt}</strong></p>
            </div>
          </div>
        </div>

        {/* Bloco Integrações externas */}
        <div className="bg-white border border-gray-150 rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Plug size={18} className="text-orange-500" />
              Plugins & Conexões Externas
            </h2>
            <Link href="/master/integrations" className="text-xs text-brand-700 font-bold hover:underline flex items-center gap-1">
              Ver credenciais <ExternalLink size={10} />
            </Link>
          </div>

          <div className="p-4 flex-1 divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
            {data.integrations.map((int) => (
              <div key={int.id} className="py-2.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">{int.name}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{int.lastMsg}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                    int.status === 'CONNECTED'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : int.status === 'ERROR'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : int.status === 'UNCONFIGURED'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-gray-50 text-gray-700 border-gray-200'
                  }`}>
                    {int.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── LINHA 4: PUSH, FILA DO VENDEDOR E SEGURANÇA ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Push & PWA iPhone */}
        <div className="bg-white border border-gray-150 p-6 rounded-2xl shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Bell size={18} className="text-indigo-600" />
            Notificações & PWA
          </h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-gray-50 pb-2">
              <span className="text-xs text-gray-500 font-semibold">Web Push Ativos</span>
              <span className="text-sm font-bold text-gray-900">{data.notifications.webPushActive}</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-50 pb-2">
              <span className="text-xs text-gray-500 font-semibold">Devices FCM Registrados</span>
              <span className="text-sm font-bold text-gray-900">{data.notifications.fcmActive}</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-50 pb-2">
              <span className="text-xs text-gray-500 font-semibold">Inscrições Inválidas / Revogadas</span>
              <span className="text-sm font-bold text-red-600">{data.notifications.invalidSubscriptions}</span>
            </div>
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs text-gray-500 font-semibold">Falhas nas últimas 24h</span>
              <span className="text-sm font-bold text-amber-600">{data.notifications.failures24h}</span>
            </div>
          </div>
        </div>

        {/* Fila do Vendedor */}
        <div className="bg-white border border-gray-150 p-6 rounded-2xl shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Activity size={18} className="text-emerald-600" />
            Fila de Atendimento
          </h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-gray-50 pb-2">
              <span className="text-xs text-gray-500 font-semibold">Filas Ativas</span>
              <span className="text-sm font-bold text-gray-900">{data.queue.activeQueues} lojas</span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-50 pb-2">
              <span className="text-xs text-gray-500 font-semibold">Chamadas Pendentes (CALLED)</span>
              <span className="text-sm font-bold text-gray-900">{data.queue.pendingCalls} chamadas</span>
            </div>
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs text-gray-500 font-semibold">Tempo médio de Aceite</span>
              <span className="text-sm font-bold text-indigo-600">{data.queue.averageAcceptSeconds}s</span>
            </div>
          </div>
        </div>

        {/* Auditoria de Segurança */}
        <div className="bg-white border border-gray-150 p-6 rounded-2xl shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Lock size={18} className="text-red-500" />
            Segurança & Auditoria
          </h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-gray-50 pb-2">
              <span className="text-xs text-gray-500 font-semibold">Falhas de Login (Hoje)</span>
              <span className={`text-sm font-bold ${data.security.failedLoginsToday > 0 ? 'text-red-600 animate-pulse' : 'text-gray-900'}`}>
                {data.security.failedLoginsToday} tentativas
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-gray-50 pb-2">
              <span className="text-xs text-gray-500 font-semibold">Mudanças de Permissão (Hoje)</span>
              <span className="text-sm font-bold text-amber-600">{data.security.permissionChangesToday} alterações</span>
            </div>
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs text-gray-500 font-semibold">Usuários Bloqueados Hoje</span>
              <span className="text-sm font-bold text-gray-900">{data.security.blockedUsers} bloqueios</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── LINHA 5: ERROS RECENTES E AÇÕES RÁPIDAS ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Erros Recentes */}
        <div className="bg-white border border-gray-150 rounded-2xl shadow-sm overflow-hidden flex flex-col lg:col-span-2">
          <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
              <Terminal size={18} className="text-red-600" />
              Erros & Falhas Recentes do Sistema
            </h2>
            <Link href="/master/audit" className="text-xs text-brand-700 font-bold hover:underline flex items-center gap-1">
              Ver todos <ExternalLink size={10} />
            </Link>
          </div>

          <div className="p-4 flex-1 divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
            {data.recentErrors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="text-emerald-500" size={32} />
                <p className="text-sm font-semibold text-gray-800 mt-2">Nenhum erro recente registrado.</p>
                <p className="text-xs text-gray-400 mt-0.5">O log de auditoria global não reportou falhas do sistema recentemente.</p>
              </div>
            ) : (
              data.recentErrors.map((err, i) => (
                <div key={i} className="py-2.5 flex items-start justify-between gap-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-400">{err.time} - {err.tenant}</p>
                    <p className="text-xs font-bold text-red-600 mt-0.5">{err.service}</p>
                    <p className="text-sm text-gray-800 font-medium mt-1 truncate">{err.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ações Rápidas */}
        <div className="bg-white border border-gray-150 rounded-2xl shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <Key size={18} className="text-purple-600" />
            Ações Rápidas do Master
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/master/tenants"
              className="flex flex-col items-center justify-center p-3 text-center border border-gray-100 rounded-xl hover:bg-slate-50 transition-all group"
            >
              <Building2 className="text-indigo-600 group-hover:scale-110 transition-transform" size={20} />
              <span className="text-xs font-bold text-gray-800 mt-2">Tenants</span>
            </Link>

            <Link
              href="/master/users"
              className="flex flex-col items-center justify-center p-3 text-center border border-gray-100 rounded-xl hover:bg-slate-50 transition-all group"
            >
              <Users className="text-blue-600 group-hover:scale-110 transition-transform" size={20} />
              <span className="text-xs font-bold text-gray-800 mt-2">Usuários</span>
            </Link>

            <Link
              href="/master/integrations"
              className="flex flex-col items-center justify-center p-3 text-center border border-gray-100 rounded-xl hover:bg-slate-50 transition-all group"
            >
              <Plug className="text-orange-600 group-hover:scale-110 transition-transform" size={20} />
              <span className="text-xs font-bold text-gray-800 mt-2">Integrações</span>
            </Link>

            <Link
              href="/master/audit"
              className="flex flex-col items-center justify-center p-3 text-center border border-gray-100 rounded-xl hover:bg-slate-50 transition-all group"
            >
              <Terminal className="text-slate-600 group-hover:scale-110 transition-transform" size={20} />
              <span className="text-xs font-bold text-gray-800 mt-2">Logs Auditoria</span>
            </Link>

            <Link
              href="/master/feature-flags"
              className="flex flex-col items-center justify-center p-3 text-center border border-gray-100 rounded-xl hover:bg-slate-50 transition-all group"
            >
              <Flag className="text-cyan-600 group-hover:scale-110 transition-transform" size={20} />
              <span className="text-xs font-bold text-gray-800 mt-2">Feature Flags</span>
            </Link>

            <Link
              href="/configuracoes/sistema"
              className="flex flex-col items-center justify-center p-3 text-center border border-gray-100 rounded-xl hover:bg-slate-50 transition-all group"
            >
              <Settings className="text-purple-600 group-hover:scale-110 transition-transform" size={20} />
              <span className="text-xs font-bold text-gray-800 mt-2">Config Global</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
