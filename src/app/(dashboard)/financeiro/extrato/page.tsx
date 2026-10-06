'use client'

// =============================================================================
// Centro Financeiro — Extrato por conta (ou consolidado) com saldo corrente.
// Consome /api/finance/center/statement. Exporta CSV e imprime.
// =============================================================================

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, Printer, RefreshCw, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toCsv } from '@/lib/finance/ledger'
import { ErrorBox, KpiCard, brl, dateBR, inputClass } from '@/components/finance/center/dashboard/shared'

interface Line {
  key: string; date: string; description: string; category: string | null; costCenter: string | null; counterparty: string | null
  account: string | null; documentNumber: string | null; type: 'RECEITA' | 'DESPESA' | 'SALDO_INICIAL'; amount: number; balance: number
  status: string; entryId: string | null; transferGroupId: string | null
}
interface Statement {
  account: { id: string; name: string }
  accounts: { id: string; name: string; includeInTotal: boolean; active: boolean }[]
  from: string; to: string
  openingBalance: number; closingBalance: number; totalIn: number; totalOut: number
  lines: Line[]
}

function spToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}`
}
function monthRange(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` }
}
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

function StatementPage() {
  const params = useSearchParams()
  const today = spToday()
  const initial = monthRange(today.slice(0, 7))
  const [accountId, setAccountId] = useState(params.get('accountId') || 'all')
  const [from, setFrom] = useState(params.get('from') || initial.from)
  const [to, setTo] = useState(params.get('to') || initial.to)
  const [data, setData] = useState<Statement | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!from || !to) return
    setLoading(true); setError(null)
    try {
      const qs = new URLSearchParams({ accountId, from, to })
      const res = await fetch(`/api/finance/center/statement?${qs}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Não foi possível carregar o extrato.'); return }
      setData(json.data)
    } catch { setError('Erro de rede.') } finally { setLoading(false) }
  }, [accountId, from, to])
  useEffect(() => { void load() }, [load])

  const consolidated = accountId === 'all'
  const presets = useMemo(() => {
    const cur = today.slice(0, 7)
    return [
      { label: 'Este mês', ...monthRange(cur) },
      { label: 'Mês anterior', ...monthRange(shiftMonth(cur, -1)) },
      { label: '90 dias', from: new Date(Date.parse(`${today}T12:00:00Z`) - 89 * 86_400_000).toISOString().slice(0, 10), to: today },
    ]
  }, [today])

  const exportCsv = () => {
    if (!data) return
    const rows: (string | number | null)[][] = [
      ['Data', 'Descrição', 'Fornecedor/cliente', 'Categoria', 'Centro de custo', 'Conta', 'Documento', 'Entrada', 'Saída', 'Saldo'],
      [dateBR(data.from), 'Saldo anterior', null, null, null, null, null, null, null, data.openingBalance],
      ...data.lines.map((l) => [
        dateBR(l.date), l.description, l.counterparty, l.category, l.costCenter, l.account, l.documentNumber,
        l.amount >= 0 ? l.amount : null, l.amount < 0 ? -l.amount : null, l.balance,
      ]),
      [dateBR(data.to), 'Saldo final', null, null, null, null, null, data.totalIn, data.totalOut, data.closingBalance],
    ]
    const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `extrato-${(data.account.name || 'contas').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}-${data.from}-a-${data.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #fin-statement, #fin-statement * { visibility: visible !important; }
        #fin-statement { position: absolute; inset: 0 auto auto 0; width: 100%; }
        #fin-statement .shadow-card { box-shadow: none; }
      }`}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/financeiro" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Voltar ao painel"><ArrowLeft size={18} /></Link>
          <h1 className="text-xl font-bold text-gray-900">Extrato</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCsv} disabled={!data?.lines.length} className="btn-secondary text-sm"><Download size={15} />CSV</button>
          <button onClick={() => window.print()} disabled={!data} className="btn-secondary text-sm"><Printer size={15} />Imprimir</button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">Conta
          <select className={cn(inputClass, 'min-w-[200px]')} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="all">Todas as contas</option>
            {(data?.accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}{!a.includeInTotal ? ' (fora do total)' : ''}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">De
          <input type="date" className={inputClass} value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">Até
          <input type="date" className={inputClass} value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button key={p.label} onClick={() => { setFrom(p.from); setTo(p.to) }}
              className={cn('rounded-lg border px-3 py-2 text-xs font-medium', from === p.from && to === p.to ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')}>
              {p.label}
            </button>
          ))}
        </div>
        <button onClick={() => void load()} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Atualizar"><RefreshCw size={15} className={cn(loading && 'animate-spin')} /></button>
      </div>

      {error && <ErrorBox message={error} onRetry={() => void load()} />}

      <div id="fin-statement" className="space-y-4">
        <div className="hidden print:block">
          <h2 className="text-lg font-bold text-gray-900">Extrato · {data?.account.name}</h2>
          <p className="text-sm text-gray-600">{dateBR(data?.from)} a {dateBR(data?.to)}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Saldo anterior" loading={loading && !data} value={brl(data?.openingBalance)} />
          <KpiCard label="Entradas" loading={loading && !data} value={brl(data?.totalIn)} tone="in" />
          <KpiCard label="Saídas" loading={loading && !data} value={brl(data?.totalOut)} tone="out" />
          <KpiCard label="Saldo final" loading={loading && !data} value={brl(data?.closingBalance)} tone={(data?.closingBalance ?? 0) < 0 ? 'alert' : 'default'} />
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Data', 'Descrição', 'Categoria', 'Centro de custo', ...(consolidated ? ['Conta'] : []), 'Valor', 'Saldo'].map((h) => (
                    <th key={h} className={cn('whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500', h === 'Valor' || h === 'Saldo' ? 'text-right' : 'text-left')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && !data ? (
                  Array.from({ length: 6 }).map((_, i) => (<tr key={i}>{Array.from({ length: consolidated ? 7 : 6 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
                ) : !data ? null : (
                  <>
                    <tr className="bg-gray-50/60">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">{dateBR(data.from)}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-700" colSpan={consolidated ? 5 : 4}>Saldo anterior</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900">{brl(data.openingBalance)}</td>
                    </tr>
                    {data.lines.length === 0 ? (
                      <tr><td colSpan={consolidated ? 7 : 6} className="py-12 text-center"><Wallet size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Sem movimentação no período.</p></td></tr>
                    ) : data.lines.map((l) => (
                      <tr key={l.key} className={cn(l.type === 'SALDO_INICIAL' && 'bg-brand-50/40')}>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">{dateBR(l.date)}</td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-gray-900">{l.description}</p>
                          {(l.counterparty || l.transferGroupId || l.documentNumber) && (
                            <p className="text-xs text-gray-500">{[l.transferGroupId && 'Transferência', l.counterparty, l.documentNumber && `Doc. ${l.documentNumber}`].filter(Boolean).join(' · ')}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{l.category ?? '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600">{l.costCenter ?? '—'}</td>
                        {consolidated && <td className="px-4 py-2.5 text-gray-600">{l.account ?? 'Sem conta'}</td>}
                        <td className={cn('whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums', l.amount < 0 ? 'text-orange-700' : 'text-teal-700')}>
                          {l.amount < 0 ? '−' : '+'}{brl(Math.abs(l.amount))}
                        </td>
                        <td className={cn('whitespace-nowrap px-4 py-2.5 text-right tabular-nums', l.balance < 0 ? 'text-red-600' : 'text-gray-900')}>{brl(l.balance)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{dateBR(data.to)}</td>
                      <td className="px-4 py-3 text-gray-900" colSpan={consolidated ? 4 : 3}>Saldo final</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-medium tabular-nums">
                        <span className="text-teal-700">+{brl(data.totalIn)}</span><br /><span className="text-orange-700">−{brl(data.totalOut)}</span>
                      </td>
                      <td className={cn('whitespace-nowrap px-4 py-3 text-right tabular-nums', data.closingBalance < 0 ? 'text-red-600' : 'text-gray-900')}>{brl(data.closingBalance)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function FinanceStatementPage() {
  return <Suspense fallback={null}><StatementPage /></Suspense>
}
