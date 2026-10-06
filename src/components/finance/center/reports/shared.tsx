'use client'

// Peças comuns da DRE e dos relatórios gerenciais do Centro Financeiro.

import { useCallback, useEffect, useState } from 'react'
import { Download, Printer, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addMonths, monthKeySP, monthLabel, toCsv } from '@/lib/finance/reports-core'

export const inputClass = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export const COLORS = {
  receita: '#16a34a',
  despesa: '#dc2626',
  resultado: '#2563eb',
  linha: '#d97706',
  neutro: '#94a3b8',
}
export const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569']

export const fmt = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const fmtShort = (n: number) => {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1_000) return `${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}
export const fmtPct = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n) ? '—' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
export const fmtDate = (s: string | Date | null | undefined) => (s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')
export const signCls = (n: number) => (n < 0 ? 'text-red-600' : n > 0 ? 'text-gray-900' : 'text-gray-400')
export { monthLabel }

export const currentMonth = () => monthKeySP(new Date())
export const monthsBack = (n: number) => addMonths(currentMonth(), -n)

export function downloadCsv(name: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Busca JSON de um endpoint do centro financeiro ({ success, data }). */
export function useFinanceData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!url) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) { setError(json?.error ?? 'Não foi possível carregar.'); setData(null) }
      else setData(json.data as T)
    } catch {
      setError('Erro de rede.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [url])
  useEffect(() => { void load() }, [load])
  return { data, loading, error, reload: load }
}

export interface Option { id: string; name: string }

export function MonthInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
      {label}
      <input type="month" className={cn(inputClass, 'w-full min-w-[11.5rem] sm:w-auto')} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </label>
  )
}

export function SelectInput({ label, value, onChange, options, all }: { label: string; value: string; onChange: (v: string) => void; options: Option[]; all: string }) {
  return (
    <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs font-medium text-gray-600">
      {label}
      <select className={cn(inputClass, 'w-full min-w-[10rem] max-w-full truncate sm:w-auto sm:max-w-[18rem]')} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  )
}

export function RegimeToggle({ value, onChange }: { value: 'competencia' | 'caixa'; onChange: (v: 'competencia' | 'caixa') => void }) {
  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-gray-600">
      Regime
      <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
        {(['competencia', 'caixa'] as const).map((r) => (
          <button key={r} type="button" onClick={() => onChange(r)}
            className={cn('rounded-md px-3 py-1.5 text-sm font-medium', value === r ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>
            {r === 'competencia' ? 'Competência' : 'Caixa'}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Toolbar({ children, onCsv, onReload, loading }: { children?: React.ReactNode; onCsv?: () => void; onReload?: () => void; loading?: boolean }) {
  return (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      {children}
      <div className="ml-auto flex gap-2">
        {onReload && <button type="button" onClick={onReload} className="btn-secondary text-sm" title="Atualizar"><RefreshCw size={14} className={cn(loading && 'animate-spin')} /></button>}
        {onCsv && <button type="button" onClick={onCsv} className="btn-secondary text-sm"><Download size={14} />CSV</button>}
        <button type="button" onClick={() => window.print()} className="btn-secondary text-sm"><Printer size={14} />Imprimir</button>
      </div>
    </div>
  )
}

export function Kpi({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'green' | 'red' | 'amber' | 'blue' }) {
  const toneCls = { default: 'text-gray-900', green: 'text-green-700', red: 'text-red-600', amber: 'text-amber-700', blue: 'text-brand-700' }[tone]
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card print:shadow-none">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn('mt-1 text-xl font-bold tabular-nums', toneCls)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export function Panel({ title, children, className, actions }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card print:break-inside-avoid print:shadow-none', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-gray-800">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function StateBox({ loading, error, empty, emptyText = 'Sem dados no período.' }: { loading: boolean; error: string | null; empty: boolean; emptyText?: string }) {
  if (loading) return <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-5 animate-pulse rounded bg-gray-100" />)}</div>
  if (error) return <p className="p-6 text-center text-sm text-red-600">{error}</p>
  if (empty) return <p className="p-10 text-center text-sm text-gray-400">{emptyText}</p>
  return null
}

export const th = 'whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500'
export const thR = 'whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500'
export const td = 'px-3 py-2 text-gray-700'
export const tdR = 'whitespace-nowrap px-3 py-2 text-right tabular-nums'

export type SortDir = 'asc' | 'desc'
/** Ordenação de tabela por coluna (clique alterna). */
export function useSort<K extends string>(initial: K, dir: SortDir = 'desc') {
  const [sort, setSort] = useState<{ key: K; dir: SortDir }>({ key: initial, dir })
  const toggle = (key: K) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))
  const apply = useCallback(<T,>(rows: T[], get: (r: T, k: K) => number | string | null | undefined) =>
    [...rows].sort((a, b) => {
      const x = get(a, sort.key), y = get(b, sort.key)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')
      return sort.dir === 'asc' ? c : -c
    }), [sort])
  return { sort, toggle, apply }
}

export function SortTh<K extends string>({ k, label, sort, toggle, right }: { k: K; label: string; sort: { key: K; dir: SortDir }; toggle: (k: K) => void; right?: boolean }) {
  return (
    <th className={cn(right ? thR : th, 'cursor-pointer select-none hover:text-gray-800')} onClick={() => toggle(k)}>
      {label}{sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )
}

export function qs(params: Record<string, string | null | undefined>) {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v)
  return s.toString()
}
