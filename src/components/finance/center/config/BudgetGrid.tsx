'use client'

// Financeiro › Orçamento — orçado × realizado por categoria, no mês ou no ano
// (12 meses), geral ou por centro de custo. Edita só as categorias finais; os
// grupos somam os filhos. /api/finance/budgets (GET/PUT) e /copy.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Save, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MoneyInput } from '@/components/ui/money-input'
import { EmptyState, PageHeader, api, brl, currentMonth, smallInputClass } from './ui'

type Kind = 'DESPESA' | 'RECEITA'
interface CatRow { id: string; name: string; code: string | null; kind: Kind; parentId: string | null; depth: number; hasChildren: boolean; active: boolean }
interface BudgetData { months: string[]; categories: CatRow[]; budgets: Record<string, Record<string, number>>; actuals: Record<string, Record<string, number>> }
interface CostCenter { id: string; name: string; active: boolean }

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const monthName = (ym: string) => `${MONTHS_PT[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`
function shift(ym: string, d: number) {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + d
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const key = (cat: string, month: string) => `${cat}|${month}`
const r2 = (n: number) => Math.round(n * 100) / 100

export default function BudgetGrid() {
  const [view, setView] = useState<'month' | 'year'>('month')
  const [month, setMonth] = useState(currentMonth())
  const [kind, setKind] = useState<Kind>('DESPESA')
  const [costCenterId, setCostCenterId] = useState('')
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [data, setData] = useState<BudgetData | null>(null)
  const [edits, setEdits] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const year = month.slice(0, 4)

  useEffect(() => {
    api<CostCenter[]>('/api/finance/cost-centers?active=true').then((r) => setCostCenters(r.data ?? []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams(view === 'year' ? { year } : { month })
    if (costCenterId) qs.set('costCenterId', costCenterId)
    const r = await api<BudgetData>(`/api/finance/budgets?${qs}`)
    setData(r.data)
    setEdits(new Map())
    setLoading(false)
  }, [view, year, month, costCenterId])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => (data?.categories ?? []).filter((c) => c.kind === kind && (c.active || hasAnyValue(c.id))), [data, kind]) // eslint-disable-line react-hooks/exhaustive-deps
  function hasAnyValue(id: string) {
    return !!data && (Object.keys(data.budgets[id] ?? {}).length > 0 || Object.keys(data.actuals[id] ?? {}).length > 0)
  }
  const months = data?.months ?? []

  // Filhos diretos por categoria (para somar os grupos).
  const childrenOf = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const c of data?.categories ?? []) if (c.parentId) m.set(c.parentId, [...(m.get(c.parentId) ?? []), c.id])
    return m
  }, [data])

  const ownBudget = useCallback((cat: string, ym: string) => {
    const k = key(cat, ym)
    return edits.has(k) ? edits.get(k)! : data?.budgets[cat]?.[ym] ?? 0
  }, [edits, data])

  const budgetOf = useCallback((cat: string, ym: string): number => {
    const kids = childrenOf.get(cat) ?? []
    return r2(ownBudget(cat, ym) + kids.reduce((s, k) => s + budgetOf(k, ym), 0))
  }, [childrenOf, ownBudget])

  const actualOf = useCallback((cat: string, ym: string): number => {
    const kids = childrenOf.get(cat) ?? []
    return r2((data?.actuals[cat]?.[ym] ?? 0) + kids.reduce((s, k) => s + actualOf(k, ym), 0))
  }, [childrenOf, data])

  const roots = rows.filter((c) => c.depth === 0)
  const totalBudget = (ym: string) => r2(roots.reduce((s, c) => s + budgetOf(c.id, ym), 0))
  const totalActual = (ym: string) => r2(roots.reduce((s, c) => s + actualOf(c.id, ym), 0))

  const setCell = (cat: string, ym: string, v: number | null) => setEdits((m) => new Map(m).set(key(cat, ym), v ?? 0))

  const save = async () => {
    if (!edits.size) return
    setSaving(true); setMsg(null)
    const items = [...edits.entries()].map(([k, amount]) => { const [categoryId, m] = k.split('|'); return { categoryId, month: m, amount } })
    const r = await api('/api/finance/budgets', { method: 'PUT', body: { costCenterId: costCenterId || null, items } })
    setSaving(false)
    if (!r.ok) { setMsg({ ok: false, text: r.error ?? 'Erro ao salvar.' }); return }
    setMsg({ ok: true, text: 'Orçamento salvo.' })
    load()
  }

  const copyPrevious = async () => {
    if (edits.size && !confirm('Descartar as alterações não salvas?')) return
    const r = await api<{ copied: number }>('/api/finance/budgets/copy', { method: 'POST', body: { fromMonth: shift(month, -1), toMonth: month, costCenterId: costCenterId || null, overwrite: false } })
    if (!r.ok) { setMsg({ ok: false, text: r.error ?? 'Erro ao copiar.' }); return }
    setMsg({ ok: true, text: r.data?.copied ? `${r.data.copied} valores copiados de ${monthName(shift(month, -1))}.` : 'Nada a copiar: o mês já tem esses valores.' })
    load()
  }

  const step = (d: number) => setMonth((m) => (view === 'year' ? shift(m, d * 12) : shift(m, d)))
  const ym = months[0] ?? month

  return (
    <div className="space-y-5">
      <PageHeader
        title="Orçamento"
        subtitle={view === 'year' ? `Ano ${year}` : monthName(month)}
        actions={<>
          {view === 'month' && <button onClick={copyPrevious} className="btn-secondary text-sm"><Copy size={15} />Copiar do mês anterior</button>}
          <button onClick={save} disabled={saving || !edits.size} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button>
        </>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {(['month', 'year'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium', view === v ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>{v === 'month' ? 'Mês' : 'Ano'}</button>
          ))}
        </div>
        <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white">
          <button onClick={() => step(-1)} className="p-2 text-gray-500 hover:text-gray-900" aria-label="Anterior"><ChevronLeft size={16} /></button>
          {view === 'month'
            ? <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="border-0 bg-transparent px-1 py-1.5 text-sm focus:outline-none focus:ring-0" />
            : <span className="px-3 text-sm font-medium text-gray-800">{year}</span>}
          <button onClick={() => step(1)} className="p-2 text-gray-500 hover:text-gray-900" aria-label="Próximo"><ChevronRight size={16} /></button>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {(['DESPESA', 'RECEITA'] as Kind[]).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium', kind === k ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50')}>{k === 'DESPESA' ? 'Despesas' : 'Receitas'}</button>
          ))}
        </div>
        <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          <option value="">Geral (loja toda)</option>
          {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {edits.size > 0 && <span className="text-xs text-amber-600">{edits.size} alteração(ões) não salva(s)</span>}
      </div>

      {msg && <p className={cn('text-sm', msg.ok ? 'text-green-700' : 'text-red-600')}>{msg.text}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-card">
        {loading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-6 animate-pulse rounded bg-gray-100" />)}</div>
        ) : !rows.length ? (
          <EmptyState icon={<Target size={32} strokeWidth={1} />} text="Nenhuma categoria." />
        ) : view === 'month' ? (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left">Categoria</th>
                <th className="w-44 px-3 py-3 text-right">Orçado</th>
                <th className="px-3 py-3 text-right">Realizado</th>
                <th className="px-3 py-3 text-right">Diferença</th>
                <th className="w-40 px-4 py-3 text-left">Consumo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((c) => {
                const b = budgetOf(c.id, ym)
                const a = actualOf(c.id, ym)
                const diff = r2(b - a)
                const pct = b > 0 ? Math.round((a / b) * 100) : a > 0 ? 100 : 0
                const over = kind === 'DESPESA' ? a > b && b > 0 : a < b
                return (
                  <tr key={c.id} className={cn(c.depth === 0 && 'bg-gray-50/60')}>
                    <td className="sticky left-0 bg-inherit px-4 py-2">
                      <span style={{ paddingLeft: c.depth * 16 }} className={cn('inline-flex gap-2', c.hasChildren ? 'font-semibold text-gray-900' : 'text-gray-700')}>
                        {c.code && <span className="font-mono text-xs text-gray-400">{c.code}</span>}{c.name}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {c.hasChildren
                        ? <span className="font-semibold tabular-nums text-gray-900">{brl(b)}</span>
                        : <MoneyInput className={cn(smallInputClass, 'text-right')} value={ownBudget(c.id, ym) || null} onChange={(v) => setCell(c.id, ym, v)} />}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">{brl(a)}</td>
                    <td className={cn('whitespace-nowrap px-3 py-2 text-right tabular-nums', b === 0 && a === 0 ? 'text-gray-300' : diff < 0 === (kind === 'DESPESA') ? 'text-red-600' : 'text-green-700')}>{brl(diff)}</td>
                    <td className="px-4 py-2">
                      {b > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className={cn('h-full rounded-full', over ? 'bg-red-500' : 'bg-brand-500')} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                          <span className="w-10 text-right text-xs tabular-nums text-gray-500">{pct}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <tr>
                <td className="sticky left-0 bg-gray-50 px-4 py-3">Total</td>
                <td className="px-3 py-3 text-right tabular-nums">{brl(totalBudget(ym))}</td>
                <td className="px-3 py-3 text-right tabular-nums">{brl(totalActual(ym))}</td>
                <td className="px-3 py-3 text-right tabular-nums">{brl(r2(totalBudget(ym) - totalActual(ym)))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="sticky left-0 z-10 min-w-[220px] bg-gray-50 px-4 py-3 text-left">Categoria</th>
                {months.map((m) => <th key={m} className="min-w-[128px] px-2 py-3 text-right">{MONTHS_PT[Number(m.slice(5, 7)) - 1]}</th>)}
                <th className="min-w-[120px] px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((c) => {
                const rowTotal = r2(months.reduce((s, m) => s + budgetOf(c.id, m), 0))
                const rowActual = r2(months.reduce((s, m) => s + actualOf(c.id, m), 0))
                return (
                  <tr key={c.id} className={cn(c.depth === 0 ? 'bg-gray-50' : 'bg-white')}>
                    <td className="sticky left-0 z-10 bg-inherit px-4 py-2">
                      <span style={{ paddingLeft: c.depth * 14 }} className={cn('inline-flex gap-2 whitespace-nowrap', c.hasChildren ? 'font-semibold text-gray-900' : 'text-gray-700')}>
                        {c.code && <span className="font-mono text-xs text-gray-400">{c.code}</span>}{c.name}
                      </span>
                    </td>
                    {months.map((m) => (
                      <td key={m} className="px-2 py-1.5 text-right align-top">
                        {c.hasChildren
                          ? <span className="font-semibold tabular-nums text-gray-900">{brl(budgetOf(c.id, m))}</span>
                          : <MoneyInput className={cn(smallInputClass, 'text-right')} value={ownBudget(c.id, m) || null} onChange={(v) => setCell(c.id, m, v)} />}
                        <div className="mt-0.5 text-[10px] tabular-nums text-gray-400" title="Realizado">{actualOf(c.id, m) ? brl(actualOf(c.id, m)) : ''}</div>
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-4 py-2 text-right align-top">
                      <div className="font-semibold tabular-nums text-gray-900">{brl(rowTotal)}</div>
                      <div className="text-[10px] tabular-nums text-gray-400">{rowActual ? brl(rowActual) : ''}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <tr>
                <td className="sticky left-0 z-10 bg-gray-50 px-4 py-3">Total</td>
                {months.map((m) => (
                  <td key={m} className="px-2 py-3 text-right">
                    <div className="tabular-nums">{brl(totalBudget(m))}</div>
                    <div className="text-[10px] font-normal tabular-nums text-gray-400">{brl(totalActual(m))}</div>
                  </td>
                ))}
                <td className="px-4 py-3 text-right tabular-nums">{brl(r2(months.reduce((s, m) => s + totalBudget(m), 0)))}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      {view === 'year' && !loading && rows.length > 0 && <p className="text-xs text-gray-400">Valor menor abaixo de cada mês: realizado por competência.</p>}
    </div>
  )
}
