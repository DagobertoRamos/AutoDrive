'use client'

// Financeiro › Folha e comissões — fechamento do mês por colaborador (salário,
// comissões, benefícios, adiantamentos, líquido), pagamento e recibo.
// GET /api/finance/payroll?month=.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Briefcase, CheckCircle2, ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HelpHint, WithHint } from '@/components/ui/help-hint'
import SearchBox from '@/components/reports/SearchBox'
import { Badge, EmptyState, PageHeader, Toggle, api, brl, currentMonth, iconBtn } from '../config/ui'
import EmployeeDrawer from './EmployeeDrawer'
import PayModal from './PayModal'
import { openPayslip } from './payslip'
import { STATUS_LABEL, STATUS_TONE, type PayrollEmployee, type PayrollMonthData } from './types'

function shift(ym: string, d: number) {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + d
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

export default function PayrollCenter() {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState<PayrollMonthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [onlyWithValues, setOnlyWithValues] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [payId, setPayId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const r = await api<PayrollMonthData>(`/api/finance/payroll?month=${month}`)
    setData(r.data)
    if (!r.ok) setError(r.error)
    setLoading(false)
  }, [month])
  useEffect(() => { load() }, [load])

  const employees = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (data?.employees ?? []).filter((e) =>
      (!onlyWithValues || e.summary.status !== 'SEM_VALORES') &&
      (!term || e.name.toLowerCase().includes(term) || (e.cargo ?? '').toLowerCase().includes(term)))
  }, [data, q, onlyWithValues])

  const detail = data?.employees.find((e) => e.userId === detailId) ?? null
  const paying = data?.employees.find((e) => e.userId === payId) ?? null

  const print = (e: PayrollEmployee) => {
    if (!data) return
    if (!openPayslip(e, data.month, data.tenant)) setMsg('Libere as janelas pop-up para imprimir o recibo.')
  }

  const t = data?.totals
  return (
    <div className="space-y-5">
      <PageHeader
        title="Folha e comissões"
        subtitle={data ? <WithHint term="COMPETENCIA">{`Competência ${data.monthLabel}`}</WithHint> : undefined}
        actions={<>
          <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white">
            <button onClick={() => setMonth((m) => shift(m, -1))} className="p-2 text-gray-500 hover:text-gray-900" aria-label="Mês anterior"><ChevronLeft size={16} /></button>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="min-w-[10.5rem] border-0 bg-transparent px-1 py-1.5 text-sm focus:outline-none focus:ring-0" />
            <button onClick={() => setMonth((m) => shift(m, 1))} className="p-2 text-gray-500 hover:text-gray-900" aria-label="Próximo mês"><ChevronRight size={16} /></button>
          </div>
        </>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Salários', t?.salary],
          ['Comissões', t?.commissions],
          ['Adiantamentos a descontar', t?.advancesToDiscount],
          ['Líquido a pagar', t?.net],
        ].map(([label, v], i) => (
          <div key={label as string} className={cn('rounded-xl border bg-white p-4 shadow-card', i === 3 ? 'border-brand-200' : 'border-gray-200')}>
            <p className="flex items-center gap-1 text-xs text-gray-500">{label}{i === 2 ? <HelpHint size={12} title="Adiantamentos a descontar" text="Vales e adiantamentos já pagos ao colaborador que ainda não foram abatidos. Na hora de pagar, saem do salário (os mais antigos primeiro)." /> : i === 3 ? <HelpHint size={12} title="Líquido a pagar" text="Salário + benefícios + comissões do mês, menos os adiantamentos descontados." /> : null}</p>
            <p className={cn('mt-1 text-lg font-bold tabular-nums', i === 3 ? 'text-brand-700' : 'text-gray-900')}>{loading ? '—' : brl(v as number)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Buscar colaborador" className="w-60" />
        <Toggle checked={onlyWithValues} onChange={setOnlyWithValues} label="Somente com valores" />
      </div>
      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-card">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 text-left">Colaborador</th>
              <th className="px-3 py-3 text-right">Salário</th>
              <th className="px-3 py-3 text-right">Comissões</th>
              <th className="hidden px-3 py-3 text-right md:table-cell">Benefícios</th>
              <th className="px-3 py-3 text-right"><WithHint text="Adiantamentos e vales a descontar do salário neste mês.">Adiant.</WithHint></th>
              <th className="px-3 py-3 text-right">Líquido</th>
              <th className="px-3 py-3 text-left">Situação</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <tr key={i}>{Array.from({ length: 8 }).map((__, j) => <td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>)}</tr>)
            ) : employees.length === 0 ? (
              <tr><td colSpan={8}><EmptyState icon={<Briefcase size={32} strokeWidth={1} />} text="Nenhum colaborador." /></td></tr>
            ) : employees.map((e) => {
              const s = e.summary
              return (
                <tr key={e.userId} className="cursor-pointer hover:bg-gray-50" onClick={() => setDetailId(e.userId)}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{e.name}</p>
                    <p className="text-xs text-gray-500">{[e.cargo, e.unit].filter(Boolean).join(' · ') || '—'}{!e.recurrences.some((r) => r.active && r.kind === 'SALARIO') ? ' · sem salário fixo' : ''}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gray-700">{s.salary.total ? brl(s.salary.total) : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gray-700">{s.commissions.total ? brl(s.commissions.total) : '—'}</td>
                  <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums text-gray-700 md:table-cell">{s.benefits.total ? brl(s.benefits.total) : '—'}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-red-600">{s.deductions ? `− ${brl(s.deductions)}` : <span className="text-gray-300">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-gray-900">{brl(s.net)}</td>
                  <td className="px-3 py-3"><Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge></td>
                  <td className="whitespace-nowrap px-3 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                    {s.net > 0 && <button onClick={() => { setMsg(null); setPayId(e.userId) }} className="mr-1 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"><CheckCircle2 size={14} />Pagar</button>}
                    <button onClick={() => print(e)} className={iconBtn} title="Recibo"><Printer size={15} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {!loading && employees.length > 0 && t && (
            <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <tr>
                <td className="px-4 py-3">Total</td>
                <td className="px-3 py-3 text-right tabular-nums">{brl(t.salary)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{brl(t.commissions)}</td>
                <td className="hidden md:table-cell" />
                <td className="px-3 py-3 text-right tabular-nums text-red-600">{t.deductions ? `− ${brl(t.deductions)}` : '—'}</td>
                <td className="px-3 py-3 text-right tabular-nums">{brl(t.net)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {detail && data && (
        <EmployeeDrawer
          employee={detail}
          data={data}
          onClose={() => setDetailId(null)}
          onChanged={load}
          onPay={() => setPayId(detail.userId)}
          onPrint={() => print(detail)}
        />
      )}
      {paying && data && (
        <PayModal
          employee={paying}
          month={data.month}
          accounts={data.accounts}
          onClose={() => setPayId(null)}
          onPaid={(text) => { setPayId(null); setMsg(text); load() }}
        />
      )}
    </div>
  )
}
