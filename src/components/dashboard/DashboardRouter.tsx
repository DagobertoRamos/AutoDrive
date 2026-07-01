'use client'

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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GoalsPanel } from '@/components/goals/GoalsPanel'
import { RankingPositionCard } from '@/components/ranking/RankingPositionCard'
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.highlights.map((metric) => <MetricCard key={metric.id} metric={metric} />)}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
        <GoalsPanel />
        {summary.profile.canSeeRanking ? <RankingPositionCard /> : <SectionCard section={summary.commonSection} />}
      </div>

      {summary.profile.canSeeRanking && <SectionCard section={summary.commonSection} />}

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {summary.sections.map((dashboardSection) => (
          <SectionCard key={dashboardSection.id} section={dashboardSection} />
        ))}
      </div>
    </div>
  )
}

function VendedorDashboard(props: DashboardRouterProps) {
  return <RoleDashboardView {...props} />
}

function GerenteDashboard(props: DashboardRouterProps) {
  return <RoleDashboardView {...props} />
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
