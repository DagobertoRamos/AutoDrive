'use client'

// =============================================================================
// Dashboard — AutoDrive
// Central administrativa com cards de KPIs e atalhos rápidos
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  RefreshCw,
  Send,
  TrendingUp,
  Upload,
  AlertTriangle,
  Activity,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { canAccessModule } from '@/lib/permissions'
import type { UserRole } from '@/lib/permissions'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface DashboardStats {
  pendenciasAbertas:    number
  pendenciasUrgentes:   number
  pendenciasFinalizadas:number
  aguardandoResposta:   number
  comissoesPrevistos:   string
  comissoesAprovados:   string
  importacoesHoje:      number
  contratosLidosHoje:   number
  loaded: boolean
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label:       string
  value:       string | number
  description: string
  icon:        React.ElementType
  colorClass:  string
  bgClass:     string
  borderClass: string
  href?:       string
}

function KpiCard({ label, value, description, icon: Icon, colorClass, bgClass, borderClass, href }: KpiCardProps) {
  const content = (
    <div
      className={cn(
        'group relative flex items-center gap-4 rounded-xl border bg-white p-5 shadow-card',
        'transition-all duration-200',
        href ? 'cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5' : '',
        borderClass,
      )}
    >
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', bgClass)}>
        <Icon size={20} className={colorClass} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-bold text-gray-900 tabular-nums leading-tight">
          {value}
        </p>
        <p className="text-sm font-medium text-gray-600 truncate">{label}</p>
        <p className="mt-0.5 text-xs text-gray-400 truncate">{description}</p>
      </div>
      {href && (
        <ArrowRight
          size={16}
          className="shrink-0 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-gray-500"
        />
      )}
    </div>
  )

  if (href) return <Link href={href}>{content}</Link>
  return content
}

// ── Quick Action ─────────────────────────────────────────────────────────────

interface QuickActionProps {
  label:       string
  description: string
  icon:        React.ElementType
  href:        string
  colorClass:  string
  bgClass:     string
}

function QuickAction({ label, description, icon: Icon, href, colorClass, bgClass }: QuickActionProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3 rounded-xl p-4 transition-all duration-150',
        bgClass,
        'hover:opacity-90',
      )}
    >
      <Icon size={18} className={cn('shrink-0', colorClass)} />
      <div className="min-w-0">
        <p className={cn('text-sm font-semibold', colorClass)}>{label}</p>
        <p className="mt-0.5 text-xs text-gray-500 truncate">{description}</p>
      </div>
      <ArrowRight size={14} className={cn('ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity', colorClass)} />
    </Link>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: session } = useSession()
  const userRole = session?.user?.role as UserRole | undefined
  const firstName = session?.user?.name?.split(' ')[0] ?? 'usuário'

  const [stats, setStats] = useState<DashboardStats>({
    pendenciasAbertas:    0,
    pendenciasUrgentes:   0,
    pendenciasFinalizadas:0,
    aguardandoResposta:   0,
    comissoesPrevistos:   '—',
    comissoesAprovados:   '—',
    importacoesHoje:      0,
    contratosLidosHoje:   0,
    loaded: false,
  })
  const [isRefreshing, setIsRefreshing] = useState(false)

  const loadStats = useCallback(async () => {
    setIsRefreshing(true)
    try {
      // Busca pendências abertas
      const [abertas, urgentes, finalizadas, aguardando] = await Promise.allSettled([
        fetch('/api/pendencies?perPage=1&status=ABERTA',             { credentials: 'include' }),
        fetch('/api/pendencies?perPage=1&status=ABERTA&priority=URGENTE', { credentials: 'include' }),
        fetch('/api/pendencies?perPage=1&status=FINALIZADA',         { credentials: 'include' }),
        fetch('/api/pendencies?perPage=1&status=AGUARDANDO_RESPOSTA',{ credentials: 'include' }),
      ])

      const getTotal = async (res: PromiseSettledResult<Response>) => {
        if (res.status === 'fulfilled' && res.value.ok) {
          const j = await res.value.json()
          return j?.meta?.total ?? 0
        }
        return 0
      }

      const [a, u, f, aw] = await Promise.all([
        getTotal(abertas),
        getTotal(urgentes),
        getTotal(finalizadas),
        getTotal(aguardando),
      ])

      setStats((prev) => ({
        ...prev,
        pendenciasAbertas:    a,
        pendenciasUrgentes:   u,
        pendenciasFinalizadas:f,
        aguardandoResposta:   aw,
        loaded: true,
      }))
    } catch {
      setStats((prev) => ({ ...prev, loaded: true }))
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  const canSeeCommissions  = canAccessModule(userRole, 'commissions')
  const canManagePendencies = canAccessModule(userRole, 'pendencies.manage')
  const canImport          = canAccessModule(userRole, 'documents.import')
  const canReadPdf         = canAccessModule(userRole, 'documents.pdf')
  const canDispatch        = canAccessModule(userRole, 'communication.dispatch')
  const canSeeSettings     = canAccessModule(userRole, 'settings')

  // ── KPIs ────────────────────────────────────────────────────────────────────

  const kpis: KpiCardProps[] = [
    {
      label:       'Pendências Abertas',
      value:       stats.loaded ? stats.pendenciasAbertas : '—',
      description: 'Aguardando resolução',
      icon:        AlertCircle,
      colorClass:  'text-amber-600',
      bgClass:     'bg-amber-50',
      borderClass: 'border-l-4 border-l-amber-400 border-gray-100',
      href:        '/pendencias/minhas',
    },
    {
      label:       'Urgentes',
      value:       stats.loaded ? stats.pendenciasUrgentes : '—',
      description: 'Atenção imediata',
      icon:        AlertTriangle,
      colorClass:  'text-red-600',
      bgClass:     'bg-red-50',
      borderClass: 'border-l-4 border-l-red-500 border-gray-100',
      href:        '/pendencias/minhas',
    },
    {
      label:       'Finalizadas',
      value:       stats.loaded ? stats.pendenciasFinalizadas : '—',
      description: 'Concluídas no período',
      icon:        CheckCircle2,
      colorClass:  'text-brand-700',
      bgClass:     'bg-brand-50',
      borderClass: 'border-l-4 border-l-brand-600 border-gray-100',
    },
    {
      label:       'Aguardando Resposta',
      value:       stats.loaded ? stats.aguardandoResposta : '—',
      description: 'Retorno do cliente',
      icon:        Clock,
      colorClass:  'text-blue-600',
      bgClass:     'bg-blue-50',
      borderClass: 'border-l-4 border-l-blue-400 border-gray-100',
    },
  ]

  // ── Atalhos rápidos ──────────────────────────────────────────────────────────

  const quickActions: QuickActionProps[] = [
    ...(canManagePendencies ? [{
      label:       'Gerenciar Pendências',
      description: 'Acompanhe toda a equipe',
      icon:        Activity,
      href:        '/pendencias/gerencia',
      colorClass:  'text-amber-700',
      bgClass:     'bg-amber-50 hover:bg-amber-100',
    }] : []),
    ...(canDispatch ? [{
      label:       'Disparo Manual',
      description: 'Envie mensagem agora',
      icon:        Send,
      href:        '/comunicacao/disparo',
      colorClass:  'text-blue-700',
      bgClass:     'bg-blue-50 hover:bg-blue-100',
    }] : []),
    ...(canSeeCommissions ? [{
      label:       'Extrato de Comissões',
      description: 'Veja seus ganhos',
      icon:        DollarSign,
      href:        '/comissoes/extrato',
      colorClass:  'text-brand-800',
      bgClass:     'bg-brand-50 hover:bg-brand-100',
    }] : []),
    ...(canReadPdf ? [{
      label:       'Leitura de Contrato',
      description: 'Importe um PDF de contrato',
      icon:        FileText,
      href:        '/documentos/pdf',
      colorClass:  'text-purple-700',
      bgClass:     'bg-purple-50 hover:bg-purple-100',
    }] : []),
    ...(canImport ? [{
      label:       'Importar Planilha',
      description: 'Sincronizar Google Sheets',
      icon:        Upload,
      href:        '/documentos/importacao',
      colorClass:  'text-teal-700',
      bgClass:     'bg-teal-50 hover:bg-teal-100',
    }] : []),
    ...(canSeeSettings ? [{
      label:       'Configurações',
      description: 'Ajuste parâmetros do sistema',
      icon:        TrendingUp,
      href:        '/configuracoes/sistema',
      colorClass:  'text-gray-700',
      bgClass:     'bg-gray-50 hover:bg-gray-100',
    }] : []),
  ]

  return (
    <div className="max-w-screen-2xl space-y-6">
      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Bom dia, {firstName}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Aqui está o resumo da sua operação.
          </p>
        </div>
        <button
          type="button"
          onClick={loadStats}
          disabled={isRefreshing}
          className="btn-secondary self-start sm:self-auto text-xs"
        >
          <RefreshCw size={13} className={cn(isRefreshing && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {/* ── KPI Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* ── Linha principal ──────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Central de Pendências */}
        <div className="lg:col-span-2 card">
          <div className="section-header">
            <AlertCircle size={16} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-800">Central de Pendências</h2>
          </div>
          <div className="p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <QuickAction
                label="Minhas Pendências"
                description="Veja suas pendências abertas"
                icon={AlertCircle}
                href="/pendencias/minhas"
                colorClass="text-amber-700"
                bgClass="bg-amber-50 hover:bg-amber-100"
              />
              {canManagePendencies && (
                <QuickAction
                  label="Gerência"
                  description="Visão da equipe"
                  icon={Activity}
                  href="/pendencias/gerencia"
                  colorClass="text-blue-700"
                  bgClass="bg-blue-50 hover:bg-blue-100"
                />
              )}
              {canAccessModule(userRole, 'pendencies.central') && (
                <QuickAction
                  label="Central Geral"
                  description="Todas as pendências"
                  icon={TrendingUp}
                  href="/pendencias/central"
                  colorClass="text-purple-700"
                  bgClass="bg-purple-50 hover:bg-purple-100"
                />
              )}
            </div>

            {/* Métricas rápidas */}
            <div className="mt-4 divide-y divide-gray-50 rounded-lg border border-gray-100">
              {[
                { label: 'Pendências abertas',          value: stats.pendenciasAbertas,     color: 'text-amber-700 bg-amber-50' },
                { label: 'Urgentes',                    value: stats.pendenciasUrgentes,     color: 'text-red-700 bg-red-50' },
                { label: 'Aguardando resposta',         value: stats.aguardandoResposta,     color: 'text-blue-700 bg-blue-50' },
                { label: 'Finalizadas no período',      value: stats.pendenciasFinalizadas,  color: 'text-brand-700 bg-brand-50' },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-sm text-gray-600">{row.label}</p>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums min-w-[2rem] text-center', row.color)}>
                    {stats.loaded ? row.value : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Atalhos rápidos */}
        <div className="card">
          <div className="section-header">
            <TrendingUp size={16} className="text-brand-700" />
            <h2 className="text-sm font-semibold text-gray-800">Atalhos Rápidos</h2>
          </div>
          <div className="p-4 space-y-2">
            {quickActions.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                Nenhum atalho disponível para seu perfil.
              </p>
            ) : (
              quickActions.map((action) => (
                <QuickAction key={action.href} {...action} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Alertas ──────────────────────────────────────────────────────── */}
      {stats.loaded && stats.pendenciasUrgentes > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4 animate-fade-in">
          <AlertTriangle size={18} className="shrink-0 text-red-500 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800">
              {stats.pendenciasUrgentes} pendência{stats.pendenciasUrgentes > 1 ? 's' : ''} urgente{stats.pendenciasUrgentes > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              Requer atenção imediata. Clique para visualizar.
            </p>
          </div>
          <Link
            href="/pendencias/minhas"
            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
          >
            Ver agora
          </Link>
        </div>
      )}
    </div>
  )
}
