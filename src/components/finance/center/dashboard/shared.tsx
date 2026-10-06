'use client'

// Peças comuns do Painel / Extrato / Fluxo de caixa do Centro Financeiro.

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { formatBRL } from '@/lib/masks'

/** Paleta dos gráficos (validada p/ daltonismo): entradas, saídas, saldo. */
export const CHART = {
  in: '#0d9488',
  out: '#ea580c',
  balance: '#4f46e5',
  grid: '#e5e7eb',
  axis: '#6b7280',
} as const

export const brl = (v: number | null | undefined) => formatBRL(v ?? 0)

/** Eixo: "R$ 12,5 mil", "R$ 1,2 mi". */
export function brlCompact(v: number): string {
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  if (a >= 1_000_000) return `${sign}R$ ${(a / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1_000) return `${sign}R$ ${(a / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return `${sign}R$ ${a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

export const dateBR = (ymd: string | null | undefined) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '—')

export const inputClass = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-gray-200 bg-white shadow-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-gray-900">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function KpiCard({ label, value, sub, tone = 'default', href, loading }: {
  label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'in' | 'out' | 'alert'; href?: string; loading?: boolean
}) {
  const valueCls = tone === 'in' ? 'text-teal-700' : tone === 'out' ? 'text-orange-700' : tone === 'alert' ? 'text-red-600' : 'text-gray-900'
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      {loading ? <div className="mt-2 h-7 w-32 animate-pulse rounded bg-gray-200" /> : <p className={cn('mt-1 text-xl font-bold tabular-nums sm:text-2xl', valueCls)}>{value}</p>}
      {sub && !loading && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </>
  )
  const cls = 'block rounded-xl border border-gray-200 bg-white p-4 shadow-card'
  return href ? <a href={href} className={cn(cls, 'transition-colors hover:border-brand-300')}>{body}</a> : <div className={cls}>{body}</div>
}

/** Caixa do tooltip dos gráficos. */
export function TipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: number; color?: string; dashed?: boolean }[] }) {
  return (
    <div className="min-w-[180px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-gray-900">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-gray-600">
            {r.color && <span className={cn('inline-block h-2 w-2 rounded-sm', r.dashed && 'opacity-50')} style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-medium tabular-nums text-gray-900">{brl(r.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean; faded?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.line
            ? <span className="inline-block h-0.5 w-4 rounded" style={{ background: i.color }} />
            : <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', i.faded && 'opacity-40')} style={{ background: i.color }} />}
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
      <span>{message}</span>
      {onRetry && <button onClick={onRetry} className="text-xs font-semibold underline">Tentar de novo</button>}
    </div>
  )
}
