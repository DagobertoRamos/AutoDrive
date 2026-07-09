'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Banknote,
  BarChart3,
  Car,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  RefreshCw,
  Target,
  Trophy,
  Users,
  Megaphone,
  ShieldCheck,
  Play,
  Pause,
  LogOut,
  ExternalLink,
  ChevronRight,
  Info,
  Flame,
  ShieldAlert,
  UserCheck,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GoalsPanel } from '@/components/goals/GoalsPanel'
import { RankingPositionCard } from '@/components/ranking/RankingPositionCard'
import { MasterDashboard } from './MasterDashboard'
import { ManagerDashboard } from './ManagerDashboard'
import type {
  DashboardIcon,
  DashboardMetric,
  DashboardRoleKind,
  DashboardSection,
  DashboardSummary,
  DashboardTone,
} from '@/lib/dashboard/types'

const toneClasses: Record<DashboardTone, { icon: string; bg: string; border: string; badge: string }> = {
  brand:  { icon: 'text-brand-700', bg: 'bg-brand-50', border: 'border-l-brand-600', badge: 'bg-brand-50 text-brand-700' },
  amber:  { icon: 'text-amber-600', bg: 'bg-amber-50', border: 'border-l-amber-400', badge: 'bg-amber-50 text-amber-700' },
  red:    { icon: 'text-red-600', bg: 'bg-red-50', border: 'border-l-red-500', badge: 'bg-red-50 text-red-700' },
  blue:   { icon: 'text-blue-600', bg: 'bg-blue-50', border: 'border-l-blue-400', badge: 'bg-blue-50 text-blue-700' },
  green:  { icon: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-l-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
  purple: { icon: 'text-purple-600', bg: 'bg-purple-50', border: 'border-l-purple-500', badge: 'bg-purple-50 text-purple-700' },
  teal:   { icon: 'text-teal-600', bg: 'bg-teal-50', border: 'border-l-teal-500', badge: 'bg-teal-50 text-teal-700' },
  cyan:   { icon: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-l-cyan-500', badge: 'bg-cyan-50 text-cyan-700' },
  slate:  { icon: 'text-slate-600', bg: 'bg-slate-50', border: 'border-l-slate-400', badge: 'bg-slate-50 text-slate-700' },
  gray:   { icon: 'text-gray-500', bg: 'bg-gray-50', border: 'border-l-gray-300', badge: 'bg-gray-50 text-gray-600' },
}

interface DashboardRouterProps {
  summary: DashboardSummary
  firstName: string
  greeting: string
  refreshing: boolean
  onRefresh: () => void
}

function DashboardIconView({
  name,
  size,
  className,
}: {
  name?: DashboardIcon
  size: number
  className?: string
}) {
  switch (name) {
    case 'sales':
      return <BarChart3 size={size} className={className} />
    case 'target':
      return <Target size={size} className={className} />
    case 'ranking':
      return <Trophy size={size} className={className} />
    case 'pendencies':
    case 'alert':
      return <AlertCircle size={size} className={className} />
    case 'money':
      return <DollarSign size={size} className={className} />
    case 'leads':
      return <Megaphone size={size} className={className} />
    case 'finance':
      return <Banknote size={size} className={className} />
    case 'documents':
      return <FileText size={size} className={className} />
    case 'stock':
      return <Car size={size} className={className} />
    case 'users':
      return <Users size={size} className={className} />
    case 'system':
      return <ShieldCheck size={size} className={className} />
    case 'clock':
      return <Clock size={size} className={className} />
    case 'check':
      return <CheckCircle2 size={size} className={className} />
    case 'activity':
    default:
      return <Activity size={size} className={className} />
  }
}

function MetricCard({ metric }: { metric: DashboardMetric }) {
  const tone = toneClasses[metric.tone ?? 'gray']
  const body = (
    <div className={cn(
      'group relative flex min-h-[104px] items-center gap-4 rounded-lg border border-gray-100 bg-white p-5 shadow-card transition-all duration-200',
      metric.href ? 'hover:-translate-y-0.5 hover:shadow-card-hover' : '',
      'border-l-4',
      tone.border,
      )}>
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', tone.bg)}>
        <DashboardIconView name={metric.icon} size={20} className={tone.icon} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-bold leading-tight text-gray-900 tabular-nums">{metric.value}</p>
        <p className="truncate text-sm font-medium text-gray-600">{metric.label}</p>
        {metric.helper && <p className="mt-0.5 truncate text-xs text-gray-400">{metric.helper}</p>}
      </div>
      {metric.href && (
        <ArrowRight size={16} className="shrink-0 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-gray-500" />
      )}
    </div>
  )

  if (metric.href) return <Link href={metric.href}>{body}</Link>
  return body
}

function SectionCard({ section }: { section: DashboardSection }) {
  return (
    <div className="card">
      <div className="section-header">
        <DashboardIconView name={section.icon} size={16} className="text-brand-700" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-800">{section.title}</h2>
          {section.description && <p className="mt-0.5 truncate text-xs text-gray-400">{section.description}</p>}
        </div>
      </div>
      <div className="p-4">
        {section.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            {section.emptyText ?? 'Dados ainda não disponíveis para este módulo.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-50 rounded-lg border border-gray-100">
            {section.items.map((row) => {
              const tone = toneClasses[row.tone ?? 'gray']
              const content = (
                <div className={cn('flex items-center justify-between gap-3 px-4 py-3', row.href && 'transition-colors hover:bg-gray-50')}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-700">{row.label}</p>
                    {row.helper && <p className="mt-0.5 truncate text-xs text-gray-400">{row.helper}</p>}
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums', tone.badge)}>
                    {row.value}
                  </span>
                </div>
              )
              return row.href ? <Link key={row.id} href={row.href}>{content}</Link> : <div key={row.id}>{content}</div>
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function RoleDashboardView({
  summary,
  firstName,
  greeting,
  refreshing,
  onRefresh,
}: DashboardRouterProps) {
  const showGoalsPanel = summary.services.metas
  const showRankingPanel = summary.profile.canSeeRanking && summary.services.ranking
  const showCommonSection = summary.commonSection.items.length > 0
  const hasContent =
    summary.highlights.length > 0 ||
    summary.sections.length > 0 ||
    showGoalsPanel ||
    showRankingPanel ||
    showCommonSection

  return (
    <div className="max-w-screen-2xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{summary.profile.scopeLabel}</p>
          <h1 className="mt-1 text-xl font-bold text-gray-900">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{summary.profile.label}</p>
          <p className="mt-0.5 max-w-3xl text-xs text-gray-400">{summary.profile.description}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="btn-secondary self-start text-xs sm:self-auto"
        >
          <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {summary.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          {summary.warnings.map((warning) => (
            <p key={warning} className="text-xs font-medium text-amber-800">{warning}</p>
          ))}
        </div>
      )}

      {!hasContent && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-gray-800">Nenhum bloco ativo para este perfil.</h2>
          <p className="mt-1 text-xs text-gray-500">
            Os módulos disponíveis para este usuário ainda não possuem widgets habilitados no dashboard.
          </p>
        </div>
      )}

      {summary.highlights.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summary.highlights.map((metric) => <MetricCard key={metric.id} metric={metric} />)}
        </div>
      )}

      {(showGoalsPanel || showRankingPanel || showCommonSection) && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
          {showGoalsPanel && <GoalsPanel />}
          {showRankingPanel
            ? <RankingPositionCard />
            : showCommonSection
              ? <SectionCard section={summary.commonSection} />
              : null}
        </div>
      )}

      {showRankingPanel && showCommonSection && <SectionCard section={summary.commonSection} />}

      {summary.sections.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {summary.sections.map((dashboardSection) => (
            <SectionCard key={dashboardSection.id} section={dashboardSection} />
          ))}
        </div>
      )}
    </div>
  )
}

function getPosition(): Promise<{ latitude?: number; longitude?: number; accuracyM?: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({})
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyM: pos.coords.accuracy,
      }),
      () => resolve({}),
      { timeout: 5000, enableHighAccuracy: true }
    )
  })
}

function VendedorDashboard(props: DashboardRouterProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; success: boolean } | null>(null)

  const flash = (text: string, success: boolean = true) => {
    setMsg({ text, success })
    setTimeout(() => setMsg(null), 4000)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/seller', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Erro ao carregar dados.')
      setData(json.data)
    } catch (err: any) {
      setError(err.message ?? 'Erro ao carregar dashboard do vendedor.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleQueueAction = async (action: 'check-in' | 'pause' | 'resume' | 'check-out') => {
    setBusy(action)
    try {
      let body = {}
      if (action === 'check-in') {
        body = await getPosition()
      }
      const res = await fetch(`/api/seller-queue/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Falha ao executar ação.')
      flash(
        action === 'check-in' ? 'Você entrou na fila!' :
        action === 'pause' ? 'Você pausou a sua rotação.' :
        action === 'resume' ? 'Você voltou para a fila!' : 'Você saiu da fila.',
        true
      )
      await loadData()
    } catch (err: any) {
      flash(err.message ?? 'Erro ao executar ação na fila.', false)
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="max-w-screen-2xl space-y-6">
        <div className="flex h-32 animate-pulse rounded-2xl bg-gray-100" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-screen-md rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <div className="flex gap-4">
          <AlertCircle className="h-6 w-6 text-red-600 shrink-0" />
          <div>
            <h3 className="text-base font-bold text-red-900">Falha ao carregar o dashboard</h3>
            <p className="mt-1 text-sm text-red-600">{error ?? 'Não foi possível carregar as informações operacionais.'}</p>
            <button onClick={loadData} className="mt-4 flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700">
              <RefreshCw className="h-3 w-3" /> Tentar novamente
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { seller, goals, pendingIssues, leads, queueAttendances, ranking } = data

  const queueStatusConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
    WAITING: { label: 'Disponível', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700', border: 'border-emerald-200' },
    NEXT: { label: 'Próximo da vez', bg: 'bg-teal-50 text-teal-700 border-teal-200', text: 'text-teal-700', border: 'border-teal-200' },
    CALLED: { label: 'Chamado!', bg: 'bg-red-100 text-red-700 border-red-200 animate-pulse', text: 'text-red-700', border: 'border-red-200' },
    ACCEPTED: { label: 'Atendimento Aceito', bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700', border: 'border-blue-200' },
    IN_ATTENDANCE: { label: 'Em Atendimento', bg: 'bg-brand-50 text-brand-700 border-brand-200', text: 'text-brand-700', border: 'border-brand-200' },
    PAUSED: { label: 'Pausado / Ocupado', bg: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-700', border: 'border-amber-200' },
    LEFT: { label: 'Fora da fila', bg: 'bg-gray-100 text-gray-700 border-gray-200', text: 'text-gray-700', border: 'border-gray-200' },
    BLOCKED: { label: 'Bloqueado', bg: 'bg-red-50 text-red-700 border-red-200', text: 'text-red-700', border: 'border-red-200' },
  }

  const currentQueueStatus = queueStatusConfig[seller.queueStatus] ?? queueStatusConfig.LEFT

  return (
    <div className="max-w-screen-2xl space-y-6">
      {msg && (
        <div className={cn(
          "fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg border",
          msg.success ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"
        )}>
          {msg.success ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-red-600" />}
          {msg.text}
        </div>
      )}

      {/* 1. CABEÇALHO OPERACIONAL */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{seller.unitName}</p>
            <h1 className="text-2xl font-bold text-gray-900">{props.greeting}, {props.firstName}!</h1>
            <p className="text-sm text-gray-500">Dashboard Operacional do Vendedor</p>
          </div>

          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-4">
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Fila de Atendimento</span>
              <div className="flex items-center gap-2">
                <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", currentQueueStatus.bg)}>
                  {currentQueueStatus.label}
                </span>
                {['WAITING', 'NEXT'].includes(seller.queueStatus) && (
                  <span className="text-xs font-medium text-gray-600">
                    Posição: <strong>{seller.position}º</strong> de {seller.totalWaiting}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
              {seller.queueStatus === 'LEFT' ? (
                <button
                  onClick={() => handleQueueAction('check-in')}
                  disabled={busy === 'check-in'}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" />
                  {busy === 'check-in' ? 'Entrando...' : 'Entrar na Fila'}
                </button>
              ) : (
                <>
                  {seller.queueStatus === 'PAUSED' ? (
                    <button
                      onClick={() => handleQueueAction('resume')}
                      disabled={busy === 'resume'}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {busy === 'resume' ? 'Voltando...' : 'Voltar à Fila'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleQueueAction('pause')}
                      disabled={busy === 'pause'}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      <Pause className="h-3.5 w-3.5" />
                      {busy === 'pause' ? 'Pausando...' : 'Pausa / Ocupado'}
                    </button>
                  )}
                  <button
                    onClick={() => handleQueueAction('check-out')}
                    disabled={busy === 'check-out'}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sair
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. PRIMEIRO BLOCO: CARDS DE METAS */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Minha Meta</span>
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[10px] font-semibold text-brand-700">
              {goals.applicable?.scopeLabel ?? 'Individual'}
            </span>
          </div>

          {goals.applicable ? (
            <div className="space-y-3">
              <div>
                <h3 className="font-bold text-gray-950 truncate">{goals.applicable.title}</h3>
                <p className="text-xs text-gray-400 capitalize">{goals.applicable.period.toLowerCase()} — Vendas/Trocas</p>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-gray-900 tabular-nums">
                  {goals.applicable.achieved} <span className="text-sm font-medium text-gray-400">/ {goals.applicable.target}</span>
                </span>
                <span className="text-sm font-bold text-brand-700 tabular-nums">{goals.applicable.percent}%</span>
              </div>

              <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(goals.applicable.percent, 100)}%` }} />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Faltam {goals.applicable.remaining} vendas</span>
                <span className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  goals.applicable.status === 'no ritmo' ? "bg-emerald-50 text-emerald-700" :
                  goals.applicable.status === 'batida' || goals.applicable.status === 'superada' ? "bg-blue-50 text-blue-700" :
                  goals.applicable.status === 'atrasado' ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                )}>
                  {goals.applicable.status}
                </span>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-gray-400">
              Nenhuma meta ativa para este ciclo.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Meta da Unidade</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">Loja</span>
          </div>

          {goals.unit ? (
            <div className="space-y-3">
              <div>
                <h3 className="font-bold text-gray-950 truncate">{goals.unit.title}</h3>
                <p className="text-xs text-gray-400">Acumulado da Loja</p>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-gray-900 tabular-nums">
                  {goals.unit.achieved} <span className="text-sm font-medium text-gray-400">/ {goals.unit.target}</span>
                </span>
                <span className="text-sm font-bold text-emerald-700 tabular-nums">{goals.unit.percent}%</span>
              </div>

              <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(goals.unit.percent, 100)}%` }} />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Sua contribuição: <strong>{goals.unit.contribution}</strong></span>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-gray-400">
              Nenhuma meta de unidade ativa para este ciclo.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
              {goals.roleOrGeneral?.scopeLabel === 'Cargo' ? 'Meta do Cargo' : 'Meta Geral'}
            </span>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700">
              {goals.roleOrGeneral?.scopeLabel ?? 'Geral'}
            </span>
          </div>

          {goals.roleOrGeneral ? (
            <div className="space-y-3">
              <div>
                <h3 className="font-bold text-gray-950 truncate">{goals.roleOrGeneral.title}</h3>
                <p className="text-xs text-gray-400">Regra Comercial Recorrente</p>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-gray-900 tabular-nums">
                  {goals.roleOrGeneral.achieved} <span className="text-sm font-medium text-gray-400">/ {goals.roleOrGeneral.target}</span>
                </span>
                <span className="text-sm font-bold text-blue-700 tabular-nums">{goals.roleOrGeneral.percent}%</span>
              </div>

              <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(goals.roleOrGeneral.percent, 100)}%` }} />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Sua contribuição: <strong>{goals.roleOrGeneral.contribution}</strong></span>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-gray-400">
              Nenhuma meta do cargo ou geral configurada.
            </div>
          )}
        </div>
      </div>

      {/* 3. SEGUNDO BLOCO: PENDÊNCIAS E LEADS */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <h2 className="text-base font-bold text-gray-900">Minhas Pendências</h2>
            </div>
            <Link href="/pendencias/minhas" className="text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1">
              Ver todas <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-red-50 p-3 border border-red-100">
              <p className="text-2xl font-black text-red-700 tabular-nums">{pendingIssues.criticalCount}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-600">Críticas</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 border border-amber-100">
              <p className="text-2xl font-black text-amber-700 tabular-nums">{pendingIssues.overdueCount}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Vencidas</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 border border-blue-100">
              <p className="text-2xl font-black text-blue-700 tabular-nums">{pendingIssues.dueTodayCount}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Hoje</p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-2">Próxima Pendência Urgente</span>
            {pendingIssues.nextUrgent ? (
              <div className="rounded-xl bg-gray-50 p-4 border border-gray-100 space-y-2">
                <div className="flex items-start justify-between">
                  <h4 className="text-sm font-bold text-gray-900 truncate max-w-[70%]">
                    {pendingIssues.nextUrgent.type ?? 'Pendência Operacional'}
                  </h4>
                  <span className={cn(
                    "text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded",
                    pendingIssues.nextUrgent.priority === 'URGENTE' || pendingIssues.nextUrgent.severity === 'CRITICAL'
                      ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                  )}>
                    {pendingIssues.nextUrgent.priority}
                  </span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2">{pendingIssues.nextUrgent.description ?? 'Sem descrição detalhada.'}</p>
                <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
                  <span>Cliente: <strong>{pendingIssues.nextUrgent.customerName}</strong></span>
                  {pendingIssues.nextUrgent.dueDate && (
                    <span>Prazo: {new Date(pendingIssues.nextUrgent.dueDate).toLocaleDateString('pt-BR')}</span>
                  )}
                </div>
                <Link
                  href="/pendencias/minhas"
                  className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gray-900 py-2 text-xs font-bold text-white hover:bg-gray-800 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" /> Tratar Pendência
                </Link>
              </div>
            ) : (
              <p className="text-xs text-gray-400 py-3 text-center">Você não possui pendências críticas no momento.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-brand-700" />
              <h2 className="text-base font-bold text-gray-900">Resumo dos Leads</h2>
            </div>
            <Link href="/marketing/sdr/inbox" className="text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1">
              Abrir CRM / SDR <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 font-medium">Novos atribuídos</span>
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 tabular-nums">
                  {leads.newCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 font-medium">Em atendimento</span>
                <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 tabular-nums">
                  {leads.activeCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 font-medium">Sem contato recente</span>
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700 tabular-nums">
                  {leads.semContatoCount}
                </span>
              </div>
            </div>

            <div className="space-y-3 border-l border-gray-100 pl-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 font-medium">Retornos de hoje</span>
                <span className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-bold tabular-nums",
                  leads.followUpTodayCount > 0 ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"
                )}>
                  {leads.followUpTodayCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 font-medium">Cadências atrasadas</span>
                <span className={cn(
                  "rounded-md px-2 py-0.5 text-xs font-bold tabular-nums",
                  leads.overdueCount > 0 ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-700"
                )}>
                  {leads.overdueCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 font-medium">Convertidos no mês</span>
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 tabular-nums">
                  {leads.convertedThisMonth}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 flex gap-2">
            <Link
              href="/marketing/sdr/inbox"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Clock className="h-3.5 w-3.5" /> Ver Retornos de Hoje
            </Link>
            <Link
              href="/marketing/sdr/inbox"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-brand-700 py-2 text-xs font-bold text-white hover:bg-brand-800 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Cockpit de Leads
            </Link>
          </div>
        </div>
      </div>

      {/* 4. TERCEIRO BLOCO: FILA E RANKING */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-gray-700" />
              <h2 className="text-base font-bold text-gray-900">Atendimentos Fila</h2>
            </div>
            <Link href="/vendedor-da-vez/atendimentos" className="text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1">
              Ver todos <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center text-xs border-b border-gray-100 pb-4">
            <div>
              <p className="text-lg font-black text-gray-900 tabular-nums">{queueAttendances.todayCount}</p>
              <p className="text-[10px] text-gray-400">Hoje</p>
            </div>
            <div>
              <p className="text-lg font-black text-gray-900 tabular-nums">{queueAttendances.monthCount}</p>
              <p className="text-[10px] text-gray-400">Mês</p>
            </div>
            <div>
              <p className="text-lg font-black text-gray-900 tabular-nums">{queueAttendances.averageResponseSeconds ? `${queueAttendances.averageResponseSeconds}s` : '—'}</p>
              <p className="text-[10px] text-gray-400">Tempo Aceite</p>
            </div>
            <div>
              <p className="text-lg font-black text-gray-900 tabular-nums">{queueAttendances.acceptanceRate}%</p>
              <p className="text-[10px] text-gray-400">Aceites</p>
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block">Últimos Lançamentos</span>
            {queueAttendances.items && queueAttendances.items.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {queueAttendances.items.map((item: any) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-gray-800 capitalize">
                        {item.visitType ? item.visitType.toLowerCase().replace(/_/g, ' ') : 'Cliente Fila'}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {new Date(item.calledAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.responseSeconds && (
                        <span className="text-[10px] text-gray-400 font-medium">{item.responseSeconds}s</span>
                      )}
                      <span className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-extrabold uppercase",
                        item.status === 'FINISHED' ? "bg-emerald-50 text-emerald-700" :
                        item.status === 'IN_ATTENDANCE' || item.status === 'ACCEPTED' ? "bg-blue-50 text-blue-700" :
                        item.status === 'REJECTED' ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-500"
                      )}>
                        {item.status === 'FINISHED' ? 'Finalizado' :
                         item.status === 'IN_ATTENDANCE' ? 'Em Atend.' :
                         item.status === 'ACCEPTED' ? 'Aceito' :
                         item.status === 'REJECTED' ? 'Recusado' :
                         item.status === 'EXPIRED' ? 'Passou' : item.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 py-3 text-center">Nenhum atendimento de fila registrado hoje.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h2 className="text-base font-bold text-gray-900">Ranking Geral</h2>
            </div>
            <Link href="/ranking/geral" className="text-xs font-semibold text-brand-700 hover:underline flex items-center gap-1">
              Ver completo <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center border-b border-gray-100 pb-4">
            <div className="rounded-xl bg-gray-50 p-2.5 border border-gray-100">
              <p className="text-lg font-black text-gray-900 tabular-nums">{ranking.overallPosition ? `${ranking.overallPosition}º` : '—'}</p>
              <p className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">No Geral</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-2.5 border border-gray-100">
              <p className="text-lg font-black text-gray-900 tabular-nums">{ranking.unitPosition ? `${ranking.unitPosition}º` : '—'}</p>
              <p className="text-[9px] text-gray-400 uppercase font-bold tracking-wider">Na Unidade</p>
            </div>
            <div className="rounded-xl bg-brand-50 p-2.5 border border-brand-100 relative group">
              <p className="text-lg font-black text-brand-700 tabular-nums">{ranking.qualityScore}/100</p>
              <p className="text-[9px] text-brand-600 uppercase font-bold tracking-wider flex items-center justify-center gap-0.5">
                Qualidade <Info className="h-2.5 w-2.5" />
              </p>
              <div className="absolute bottom-full left-1/2 z-10 w-48 -translate-x-1/2 mb-2 hidden group-hover:block rounded-lg bg-gray-900 p-2.5 text-[10px] text-white leading-normal shadow-xl border border-gray-800 text-left">
                <p className="font-bold border-b border-gray-800 pb-1 mb-1">Cálculo de Qualidade:</p>
                <ul className="space-y-0.5 list-disc pl-3">
                  <li>30% Taxa de aceite na fila</li>
                  <li>20% Resposta rápida (tempo)</li>
                  <li>20% Sem pendências críticas</li>
                  <li>20% Leads tratados em dia</li>
                  <li>10% Atendimentos finalizados</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block">Top 10 do Período</span>
            {ranking.top && ranking.top.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {ranking.top.map((item: any) => (
                  <div key={item.name} className={cn("py-2 flex items-center justify-between text-xs", item.isMe && "bg-brand-50/40 rounded-lg px-2 -mx-2 font-bold")}>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold",
                        item.rank === 1 ? "bg-amber-100 text-amber-800" :
                        item.rank === 2 ? "bg-slate-200 text-slate-800" :
                        item.rank === 3 ? "bg-amber-50 text-amber-900 border border-amber-200" : "bg-gray-100 text-gray-600"
                      )}>
                        {item.rank}
                      </span>
                      <span className="text-gray-800 truncate max-w-[120px]">{item.name}</span>
                    </div>
                    <div className="text-gray-500 font-medium">
                      {item.sales} vendas <span className="text-[10px] text-gray-400">({item.totalPoints} pts)</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 py-3 text-center">Nenhum vendedor ranqueado neste período.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function GerenteDashboard(props: DashboardRouterProps) {
  return <ManagerDashboard firstName={props.firstName} greeting={props.greeting} />
}

function GerenteGeralDashboard(props: DashboardRouterProps) {
  return <RoleDashboardView {...props} />
}

function AdminDashboard(props: DashboardRouterProps) {
  return <RoleDashboardView {...props} />
}

function FinanceiroDashboard(props: DashboardRouterProps) {
  return <RoleDashboardView {...props} />
}

function MarketingDashboard(props: DashboardRouterProps) {
  return <RoleDashboardView {...props} />
}

function FiDashboard(props: DashboardRouterProps) {
  return <RoleDashboardView {...props} />
}

function SdrDashboard(props: DashboardRouterProps) {
  return <RoleDashboardView {...props} />
}

function ComprasDashboard(props: DashboardRouterProps) {
  return <RoleDashboardView {...props} />
}

function AuxiliarDashboard(props: DashboardRouterProps) {
  return <RoleDashboardView {...props} />
}

const roleComponents: Record<DashboardRoleKind, (props: DashboardRouterProps) => JSX.Element> = {
  MASTER: (props: DashboardRouterProps) => <MasterDashboard firstName={props.firstName} greeting={props.greeting} />,
  VENDEDOR: VendedorDashboard,
  GERENTE: GerenteDashboard,
  GERENTE_GERAL: GerenteGeralDashboard,
  ADMIN: AdminDashboard,
  FINANCEIRO: FinanceiroDashboard,
  MARKETING: MarketingDashboard,
  FI: FiDashboard,
  SDR: SdrDashboard,
  COMPRAS: ComprasDashboard,
  AUXILIAR: AuxiliarDashboard,
  DEFAULT: AuxiliarDashboard,
}

export function DashboardRouter(props: DashboardRouterProps) {
  const Component = roleComponents[props.summary.profile.kind] ?? AuxiliarDashboard
  return <Component {...props} />
}
