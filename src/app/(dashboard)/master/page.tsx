'use client'

// =============================================================================
// /master — Painel de Controle Master SaaS (MASTER only)
// Dashboard completo com métricas globais da plataforma
// =============================================================================

import { useEffect, useState } from 'react'
import { useSession }          from 'next-auth/react'
import { useRouter }           from 'next/navigation'
import Link                    from 'next/link'
import {
  Building2, Users, Package, ShieldCheck, TrendingUp, AlertTriangle,
  CheckCircle2, Clock, Activity, Globe, Flag, Construction, Mail,
  Plug, Palette, XCircle, Ban, PauseCircle, BadgeAlert, UserCheck,
  Car, Handshake, Bell, BarChart3, Crown, ExternalLink,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PlatformStats {
  tenants: {
    total:        number
    active:       number
    trial:        number
    suspended:    number
    blocked:      number
    banned:       number
    cancelled:    number
    inadimplente: number
    paused:       number
    newThisMonth: number
  }
  users: {
    total:        number
    active:       number
    newThisMonth: number
  }
  operational: {
    totalDeals:      number
    totalVehicles:   number
    totalPendencies: number
    openPendencies:  number
  }
  platform: {
    activeFlagsCount:       number
    activeNoticesCount:     number
    maintenanceActive:      boolean
    totalAuditLogs:         number
    masterActionsThisMonth: number
  }
  planDistribution: Array<{ plan: string; count: number }>
  recentTenants: Array<{
    id:       string
    publicId: string
    name:     string
    plan:     string
    status:   string
    createdAt:string
    _count:   { users: number }
  }>
}

// ── Labels e cores ────────────────────────────────────────────────────────────

const PLAN_LABEL: Record<string, string> = {
  BASICO: 'Básico', PRO: 'Pro', VIP: 'VIP', CUSTOM: 'Custom',
}

const STATUS_BADGE: Record<string, string> = {
  ATIVO:       'text-emerald-700 bg-emerald-50  border-emerald-200',
  SUSPENSO:    'text-amber-700   bg-amber-50    border-amber-200',
  BLOQUEADO:   'text-red-700     bg-red-50      border-red-200',
  BANIDO:      'text-rose-800    bg-rose-100    border-rose-200',
  CANCELADO:   'text-gray-500    bg-gray-50     border-gray-200',
  TESTE:       'text-blue-700    bg-blue-50     border-blue-200',
  INADIMPLENTE:'text-orange-700  bg-orange-50   border-orange-200',
  PAUSADO:     'text-violet-700  bg-violet-50   border-violet-200',
}

// ── Componentes ───────────────────────────────────────────────────────────────

function MetricCard({
  label, value, icon: Icon, color = 'gray', href, alert = false,
}: {
  label:  string
  value:  number | string
  icon:   React.ElementType
  color?: 'brand' | 'blue' | 'amber' | 'red' | 'purple' | 'emerald' | 'rose' | 'orange' | 'slate' | 'gray'
  href?:  string
  alert?: boolean
}) {
  const colors = {
    brand:   'bg-brand-50   text-brand-700  border-brand-100',
    blue:    'bg-blue-50    text-blue-700   border-blue-100',
    amber:   'bg-amber-50   text-amber-700  border-amber-100',
    red:     'bg-red-50     text-red-700    border-red-100',
    purple:  'bg-purple-50  text-purple-700 border-purple-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    rose:    'bg-rose-50    text-rose-700   border-rose-100',
    orange:  'bg-orange-50  text-orange-700 border-orange-100',
    slate:   'bg-slate-100  text-slate-700  border-slate-200',
    gray:    'bg-gray-100   text-gray-600   border-gray-200',
  }

  const inner = (
    <div className={`card flex items-center gap-4 transition-all hover:shadow-md ${alert && Number(value) > 0 ? 'border-amber-200 bg-amber-50/50' : ''}`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${colors[color]}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="mt-0.5 text-xs text-gray-500 truncate">{label}</p>
      </div>
    </div>
  )

  return href ? <Link href={href}>{inner}</Link> : inner
}

function ShortcutCard({ label, href, icon: Icon, desc, color }: {
  label: string; href: string; icon: React.ElementType; desc: string; color: string
}) {
  return (
    <Link
      href={href}
      className="card flex flex-col items-center gap-2 p-4 text-center hover:shadow-md transition-all border-2 border-transparent hover:border-brand-100 group"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color} transition-transform group-hover:scale-110`}>
        <Icon size={18} className="text-white" />
      </div>
      <p className="font-semibold text-gray-800 text-sm">{label}</p>
      <p className="text-xs text-gray-400 leading-tight">{desc}</p>
    </Link>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function MasterPage() {
  const { data: session, status } = useSession()
  const router  = useRouter()
  const [stats,   setStats]   = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'MASTER') {
      router.replace('/inicio')
    }
  }, [session, status, router])

  useEffect(() => {
    if (session?.user?.role !== 'MASTER') return
    fetch('/api/master/stats')
      .then(r => r.json())
      .then(d => setStats(d.data ?? null))
      .catch(() => setError('Erro ao carregar estatísticas.'))
      .finally(() => setLoading(false))
  }, [session])

  if (status === 'loading' || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-gray-400">{error || 'Sem dados disponíveis.'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-7xl">

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-700 to-purple-500 shadow-lg">
          <Crown size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Painel Master</h1>
          <p className="text-sm text-gray-500">Torre de controle da plataforma AutoDrive</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {stats.platform.maintenanceActive && (
            <div className="flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1.5 border border-amber-300">
              <Construction size={14} className="text-amber-600" />
              <span className="text-xs font-semibold text-amber-700">MANUTENÇÃO ATIVA</span>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 border border-emerald-200">
            <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-700">Sistema operacional</span>
          </div>
        </div>
      </div>

      {/* ── Tenants ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Tenants da plataforma</h2>
          <Link href="/master/tenants" className="text-xs text-brand-700 hover:underline flex items-center gap-1">
            Ver todos <ExternalLink size={10} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <MetricCard label="Total"        value={stats.tenants.total}        icon={Building2}  color="brand"   href="/master/tenants" />
          <MetricCard label="Ativos"       value={stats.tenants.active}       icon={CheckCircle2} color="emerald" />
          <MetricCard label="Em teste"     value={stats.tenants.trial}        icon={Clock}      color="blue"   />
          <MetricCard label="Suspensos"    value={stats.tenants.suspended}    icon={AlertTriangle} color="amber" alert />
          <MetricCard label="Inadimplentes"value={stats.tenants.inadimplente} icon={BadgeAlert} color="orange" alert />
          <MetricCard label="Bloqueados"   value={stats.tenants.blocked}      icon={XCircle}    color="red"    alert />
          <MetricCard label="Banidos"      value={stats.tenants.banned}       icon={Ban}        color="rose"   alert />
          <MetricCard label="Pausados"     value={stats.tenants.paused}       icon={PauseCircle} color="purple" />
          <MetricCard label="Cancelados"   value={stats.tenants.cancelled}    icon={XCircle}    color="gray"   />
          <MetricCard label="Novos este mês" value={stats.tenants.newThisMonth} icon={TrendingUp} color="brand" />
        </div>
      </section>

      {/* ── Usuários + Operacional ── */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Usuários</h2>
            <Link href="/master/users" className="text-xs text-brand-700 hover:underline flex items-center gap-1">Ver todos <ExternalLink size={10} /></Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MetricCard label="Total"        value={stats.users.total}        icon={Users}     color="blue" href="/master/users" />
            <MetricCard label="Ativos"       value={stats.users.active}       icon={UserCheck} color="emerald" />
            <MetricCard label="Novos este mês" value={stats.users.newThisMonth} icon={TrendingUp} color="brand" />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Operacional</h2>
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Negociações" value={stats.operational.totalDeals}      icon={Handshake}    color="purple" />
            <MetricCard label="Veículos"    value={stats.operational.totalVehicles}    icon={Car}          color="slate"  />
            <MetricCard label="Pendências"  value={stats.operational.totalPendencies}  icon={Activity}     color="blue"   />
            <MetricCard label="Em aberto"   value={stats.operational.openPendencies}   icon={AlertTriangle} color="amber" alert />
          </div>
        </section>
      </div>

      {/* ── Plataforma ── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Plataforma</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCard label="Feature Flags ativas"   value={stats.platform.activeFlagsCount}       icon={Flag}       color="purple" href="/master/feature-flags" />
          <MetricCard label="Avisos internos ativos" value={stats.platform.activeNoticesCount}      icon={Bell}       color="amber"  href="/master/communication" />
          <MetricCard label="Ações master este mês"  value={stats.platform.masterActionsThisMonth}  icon={ShieldCheck} color="purple" href="/master/audit" />
          <MetricCard label="Total de logs auditoria" value={stats.platform.totalAuditLogs}         icon={BarChart3}   color="slate"  href="/master/audit" />
        </div>
      </section>

      {/* ── Distribuição de planos ── */}
      {stats.planDistribution.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Distribuição por Plano</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.planDistribution.map(p => (
              <div key={p.plan} className="card flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 border border-purple-100">
                  <Globe size={16} className="text-purple-600" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{p.count}</p>
                  <p className="text-xs text-gray-400">{PLAN_LABEL[p.plan] ?? p.plan}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Atalhos ── */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Gestão da Plataforma</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <ShortcutCard label="Tenants"       href="/master/tenants"       icon={Building2}  desc="Gerenciar lojas"        color="bg-brand-600"  />
          <ShortcutCard label="Usuários"      href="/master/users"         icon={Users}      desc="Todos os usuários"      color="bg-blue-600"   />
          <ShortcutCard label="Planos"        href="/master/plans"         icon={Globe}      desc="Configurar planos"      color="bg-purple-600" />
          <ShortcutCard label="Módulos"       href="/master/modules"       icon={Package}    desc="Ativar/desativar"       color="bg-indigo-600" />
          <ShortcutCard label="Comunicação"   href="/master/communication" icon={Mail}       desc="Email, WA, Avisos"      color="bg-violet-600" />
          <ShortcutCard label="Integrações"   href="/master/integrations"  icon={Plug}       desc="APIs externas"          color="bg-orange-600" />
          <ShortcutCard label="Feature Flags" href="/master/feature-flags" icon={Flag}       desc="Flags e rollout"        color="bg-cyan-600"   />
          <ShortcutCard label="Manutenção"    href="/master/maintenance"   icon={Construction} desc="Janelas de manutenção" color="bg-amber-600"  />
          <ShortcutCard label="Identidade"    href="/master/identity"      icon={Palette}    desc="Marca e cores"          color="bg-rose-600"   />
          <ShortcutCard label="Segurança"     href="/master/security"      icon={ShieldCheck} desc="Políticas globais"     color="bg-slate-700"  />
          <ShortcutCard label="Auditoria"     href="/master/audit"         icon={BarChart3}  desc="Logs completos"         color="bg-gray-700"   />
        </div>
      </section>

      {/* ── Tenants recentes ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Tenants Recentes</h2>
          <Link href="/master/tenants" className="text-xs text-brand-700 hover:underline">
            Ver todos →
          </Link>
        </div>
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Nome</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Plano</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Usuários</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Criado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.recentTenants.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{t.publicId}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/master/tenants/${t.id}`} className="hover:text-brand-700 hover:underline flex items-center gap-1">
                      {t.name} <ExternalLink size={10} />
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-purple-50 border border-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                      {PLAN_LABEL[t.plan] ?? t.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status] ?? ''}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{t._count.users}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
