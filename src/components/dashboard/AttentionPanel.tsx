'use client'

// =============================================================================
// AttentionPanel — "Precisa da sua atenção" + gargalos do período.
// Bloco comum do topo de TODOS os dashboards. Os itens vêm prontos do servidor
// (/api/dashboard/attention), já no escopo e nas permissões do colaborador;
// cada item leva direto à lista dos registros (drill-down).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, Gauge, HeartHandshake, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isSessionAuthFailure } from '@/lib/auth-session'
import type { AttentionBucket, AttentionItem, AttentionSeverity, AttentionSummary } from '@/lib/dashboard/attention-core'
import { BUCKET_LABEL, SEVERITY_LABEL } from '@/lib/dashboard/attention-core'
import { formatInsightValue, type Insight } from '@/lib/dashboard/insights-core'

interface AttentionPayload {
  headline: string
  attention: AttentionSummary & { failedAreas?: string[] }
  insights: Insight[]
  bottleneck: { id: string; message: string; href: string } | null
  team?: Array<{ userId: string; name: string; signals: string[] }>
}

const SEVERITY_DOT: Record<AttentionSeverity, string> = {
  CRITICO: 'bg-red-500',
  IMPORTANTE: 'bg-orange-500',
  ATENCAO: 'bg-amber-400',
  INFO: 'bg-slate-300',
}

const SEVERITY_TEXT: Record<AttentionSeverity, string> = {
  CRITICO: 'text-red-700',
  IMPORTANTE: 'text-orange-700',
  ATENCAO: 'text-amber-700',
  INFO: 'text-slate-500',
}

const CHIP_BUCKETS: AttentionBucket[] = ['CRITICAS', 'ATRASADAS', 'HOJE', 'AGUARDANDO_TERCEIROS']

function brl(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <Link
      href={item.href}
      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
    >
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', SEVERITY_DOT[item.severity])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-800">{item.title}</p>
        <p className="mt-0.5 truncate text-xs text-gray-400">
          <span className={cn('font-semibold', SEVERITY_TEXT[item.severity])}>{SEVERITY_LABEL[item.severity]}</span>
          {' · '}
          {BUCKET_LABEL[item.bucket]}
          {item.helper ? ` · ${item.helper}` : ''}
        </p>
      </div>
      {item.amount != null && item.amount > 0 && (
        <span className="hidden shrink-0 text-sm font-semibold tabular-nums text-gray-700 sm:block">{brl(item.amount)}</span>
      )}
      <ArrowRight size={15} className="shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500" />
    </Link>
  )
}

function InsightRow({ insight }: { insight: Insight }) {
  const hasValue = insight.value != null
  const Trend = insight.change != null && insight.change > 0 ? TrendingUp : TrendingDown
  return (
    <Link href={insight.href} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50">
      <Gauge size={15} className={cn('mt-0.5 shrink-0', insight.worsened ? 'text-orange-500' : 'text-gray-400')} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-700">{insight.label}</p>
        <p className="mt-0.5 text-xs text-gray-400">{insight.message}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn('text-sm font-semibold tabular-nums', hasValue ? 'text-gray-800' : 'text-gray-400')}>
          {hasValue ? formatInsightValue(insight.value!, insight.unit) : '—'}
        </p>
        {insight.change != null && Math.abs(insight.change) >= 0.15 && (
          <p className={cn('mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-semibold', insight.worsened ? 'text-orange-600' : 'text-emerald-600')}>
            <Trend size={11} />
            {Math.round(Math.abs(insight.change) * 100)}%
          </p>
        )}
      </div>
    </Link>
  )
}

export function AttentionPanel({ className }: { className?: string }) {
  const [data, setData] = useState<AttentionPayload | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/dashboard/attention', { cache: 'no-store', credentials: 'include' })
      const json = await res.json().catch(() => null)
      if (isSessionAuthFailure(res.status, json)) return
      if (!res.ok || !json?.success) throw new Error(json?.error ?? 'Falha ao carregar')
      setData(json.data)
      setState('ready')
    } catch {
      setState((prev) => (prev === 'ready' ? 'ready' : 'error'))
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // Primeira carga fora do corpo do efeito (evita render em cascata).
    const first = setTimeout(load, 0)
    // Atualiza sozinho a cada 2 min com a aba visível (sem martelar o banco).
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, 120_000)
    return () => { clearTimeout(first); clearInterval(id) }
  }, [load])

  if (state === 'loading') {
    return (
      <div className={cn('grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]', className)} aria-busy="true">
        <div className="h-56 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-56 animate-pulse rounded-lg bg-gray-100" />
      </div>
    )
  }

  if (state === 'error' || !data) {
    return (
      <div className={cn('flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3', className)}>
        <p className="text-sm text-gray-500">Não foi possível carregar o que precisa da sua atenção agora.</p>
        <button type="button" onClick={load} disabled={refreshing} className="btn-secondary shrink-0 text-xs">
          <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
          Tentar de novo
        </button>
      </div>
    )
  }

  const { attention, insights, bottleneck } = data
  const empty = attention.total === 0
  const team = data.team ?? []
  const hasInsights = insights.length > 0 || team.length > 0

  return (
    <div className={cn('grid gap-4', hasInsights && 'xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]', className)}>
      <section className="card min-w-0 overflow-hidden" aria-labelledby="attention-title">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            {empty
              ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              : <AlertTriangle size={18} className="shrink-0 text-orange-500" />}
            <div className="min-w-0">
              <h2 id="attention-title" className="text-sm font-semibold text-gray-900">Precisa da sua atenção</h2>
              <p className="truncate text-xs text-gray-500">{data.headline}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {CHIP_BUCKETS.filter((b) => attention.byBucket[b] > 0).map((bucket) => (
              <span
                key={bucket}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums',
                  bucket === 'CRITICAS' ? 'bg-red-50 text-red-700'
                    : bucket === 'ATRASADAS' ? 'bg-orange-50 text-orange-700'
                      : bucket === 'HOJE' ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-600',
                )}
              >
                {attention.byBucket[bucket]} {BUCKET_LABEL[bucket].toLowerCase()}
              </span>
            ))}
            <button
              type="button"
              onClick={load}
              disabled={refreshing}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Atualizar"
              title="Atualizar"
            >
              <RefreshCw size={13} className={cn(refreshing && 'animate-spin')} />
            </button>
          </div>
        </div>

        {empty ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            Nenhuma pendência, atraso ou aprovação esperando por você. Bom trabalho!
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {attention.items.map((item) => <AttentionRow key={item.id} item={item} />)}
          </div>
        )}

        {attention.failedAreas && attention.failedAreas.length > 0 && (
          <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">
            Parte das informações não carregou agora e será tentada de novo na próxima atualização.
          </p>
        )}
      </section>

      {hasInsights && (
        <div className="min-w-0 space-y-4">
        {insights.length > 0 && (
        <section className="card overflow-hidden" aria-labelledby="insights-title">
          <div className="border-b border-gray-100 px-4 py-4">
            <h2 id="insights-title" className="text-sm font-semibold text-gray-900">Tempo entre etapas</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {bottleneck ? <>Maior gargalo agora: <Link href={bottleneck.href} className="font-medium text-orange-700 hover:underline">{bottleneck.message}</Link></> : 'Últimos 30 dias comparados aos 30 anteriores.'}
            </p>
          </div>
          <div className="divide-y divide-gray-50">
            {insights.map((insight) => <InsightRow key={insight.id} insight={insight} />)}
          </div>
        </section>
        )}
        {team.length > 0 && (
          <section className="card overflow-hidden" aria-labelledby="team-title">
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-4">
              <HeartHandshake size={16} className="text-brand-700" />
              <div>
                <h2 id="team-title" className="text-sm font-semibold text-gray-900">Quem pode precisar de apoio</h2>
                <p className="mt-0.5 text-xs text-gray-500">Oportunidades de acompanhamento da equipe.</p>
              </div>
            </div>
            <ul className="divide-y divide-gray-50">
              {team.map((member) => (
                <li key={member.userId} className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-800">{member.name}</p>
                  <ul className="mt-1 space-y-0.5">
                    {member.signals.map((signal) => (
                      <li key={signal} className="text-xs text-gray-500">• {signal}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}
        </div>
      )}
    </div>
  )
}
