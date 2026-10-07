'use client'

// =============================================================================
// Centro Financeiro — Painel. Consome /api/finance/center/overview?month=.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight, FileText, LineChart, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WithHint } from '@/components/ui/help-hint'
import { Card, ErrorBox, KpiCard, brl, dateBR, inputClass } from '@/components/finance/center/dashboard/shared'
import { MonthlyFlowChart, type MonthPoint } from '@/components/finance/center/dashboard/MonthlyFlowChart'
import { ProjectionChart, type ProjectionPoint } from '@/components/finance/center/dashboard/ProjectionChart'
import { TopExpensesBars, type TopExpense } from '@/components/finance/center/dashboard/TopExpensesBars'

interface DueWindow { count: number; total: number }
interface Ops { transit: DueWindow; commissions: DueWindow; partners: { toPay: number; count: number }; stock: { count: number; capital: number } }
interface DueSummary { overdue: DueWindow; today: DueWindow; next7: DueWindow; next30: DueWindow }
interface Overview {
  month: string
  today: string
  balance: { total: number; noAccount: number; accounts: { id: string; name: string; type: string; color: string | null; bankName: string | null; includeInTotal: boolean; balance: number }[] }
  receivables: DueSummary
  payables: DueSummary
  result: { revenue: number; expense: number; result: number; realizedIn: number; realizedOut: number; realizedNet: number }
  series: MonthPoint[]
  topExpenses: TopExpense[]
  upcoming: { id: string; type: 'RECEITA' | 'DESPESA'; description: string; amount: number; dueDate: string | null; counterparty: string | null; category: string | null; account: string | null }[]
  projection: ProjectionPoint[]
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
function currentMonth() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}`
}
const ACCOUNT_TYPE: Record<string, string> = { CAIXA: 'Caixa', BANCO: 'Banco', CARTAO: 'Cartão', OUTRO: 'Outro' }

export default function FinancePanelPage() {
  const [month, setMonth] = useState(currentMonth)
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/finance/center/overview?month=${month}`, { credentials: 'include' })
      const json = await res.json()
      if (!res.ok) { setError(json?.error ?? 'Não foi possível carregar o painel.'); return }
      setData(json.data)
    } catch { setError('Erro de rede.') } finally { setLoading(false) }
  }, [month])
  useEffect(() => { void load() }, [load])
  const [ops, setOps] = useState<Ops | null>(null)
  useEffect(() => {
    fetch('/api/finance/center/overview/operations', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json()).then((j) => setOps(j?.success ? j.data : null)).catch(() => {})
  }, [])

  const d = data
  const overdueTotal = (d?.receivables.overdue.count ?? 0) + (d?.payables.overdue.count ?? 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 text-xl font-bold text-gray-900">Painel financeiro</h1>
          <div className="flex items-center gap-1">
            <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50" aria-label="Mês anterior"><ChevronLeft size={16} /></button>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={cn(inputClass, 'min-w-[11.5rem]')} aria-label="Mês" />
            <button onClick={() => setMonth((m) => shiftMonth(m, 1))} className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50" aria-label="Próximo mês"><ChevronRight size={16} /></button>
            <button onClick={() => void load()} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Atualizar"><RefreshCw size={15} className={cn(loading && 'animate-spin')} /></button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/financeiro/extrato" className="btn-secondary text-sm"><FileText size={15} />Extrato</Link>
          <Link href="/financeiro/fluxo-de-caixa" className="btn-secondary text-sm"><LineChart size={15} />Fluxo de caixa</Link>
          <Link href="/financeiro/receber?novo=1" className="btn-secondary text-sm"><ArrowDownCircle size={15} className="text-teal-600" />Nova receita</Link>
          <Link href="/financeiro/pagar?novo=1" className="btn-primary text-sm"><ArrowUpCircle size={15} />Nova despesa</Link>
        </div>
      </div>

      {error && <ErrorBox message={error} onRetry={() => void load()} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Saldo consolidado" helpTerm="SALDO_CONSOLIDADO" loading={loading && !d} value={brl(d?.balance.total)} tone={(d?.balance.total ?? 0) < 0 ? 'alert' : 'default'}
          sub={d && d.balance.noAccount !== 0 ? `Sem conta: ${brl(d.balance.noAccount)}` : `${d?.balance.accounts.length ?? 0} contas`} href="/financeiro/extrato" />
        <KpiCard label="A receber · 30 dias" loading={loading && !d} value={brl(d?.receivables.next30.total)} tone="in"
          sub={d && <>Hoje {brl(d.receivables.today.total)} · 7 dias {brl(d.receivables.next7.total)}</>} href="/financeiro/receber" />
        <KpiCard label="A pagar · 30 dias" loading={loading && !d} value={brl(d?.payables.next30.total)} tone="out"
          sub={d && <>Hoje {brl(d.payables.today.total)} · 7 dias {brl(d.payables.next7.total)}</>} href="/financeiro/pagar" />
        <KpiCard label="Vencidos" helpTerm="VENCIDO" loading={loading && !d} value={overdueTotal} tone={overdueTotal ? 'alert' : 'default'}
          sub={d && <>Receber {brl(d.receivables.overdue.total)}<br />Pagar {brl(d.payables.overdue.total)}</>} />
        <KpiCard label={`Resultado · ${d ? monthName(d.month).split(' ')[0] : ''}`} helpText="Receitas menos despesas do mês pelo regime de competência (pagas ou em aberto)." loading={loading && !d} value={brl(d?.result.result)}
          tone={(d?.result.result ?? 0) < 0 ? 'alert' : 'in'}
          sub={d && <>Receitas {brl(d.result.revenue)}<br />Despesas {brl(d.result.expense)}</>} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Capital em estoque" helpText="Custo lançado dos carros próprios à venda (compra, preparação, documentação)." loading={!ops} value={brl(ops?.stock.capital)} sub={ops && `${ops.stock.count} carros`} href="/financeiro/veiculos" />
        <KpiCard label="Financiamentos a receber" helpText="Vendas financiadas que o banco ainda não pagou." loading={!ops} value={brl(ops?.transit.total)} tone="in" sub={ops && `${ops.transit.count} contrato(s)`} href="/financeiro/relatorios?view=contratos-transito" />
        <KpiCard label="Repasses a parceiros" loading={!ops} value={brl(ops?.partners.toPay)} tone={ops?.partners.toPay ? 'out' : 'default'} sub={ops && `${ops.partners.count} carro(s) vendido(s)`} href="/financeiro/relatorios?view=parceiros" />
        <KpiCard label="Comissões a pagar" loading={!ops} value={brl(ops?.commissions.total)} tone={ops?.commissions.total ? 'out' : 'default'} sub={ops && `${ops.commissions.count} lançamento(s)`} href="/financeiro/folha" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={<WithHint term="FLUXO_CAIXA">Entradas × saídas · 12 meses</WithHint>}
          actions={d && <span className="inline-flex items-center gap-1 text-xs text-gray-500"><WithHint term="REALIZADO">Realizado no mês:</WithHint> <span className="font-medium text-teal-700">{brl(d.result.realizedIn)}</span> · <span className="font-medium text-orange-700">{brl(d.result.realizedOut)}</span></span>}>
          {d ? <MonthlyFlowChart data={d.series} /> : <div className="h-64 animate-pulse rounded-lg bg-gray-100" />}
        </Card>
        <Card title="Contas">
          {!d ? <div className="h-40 animate-pulse rounded-lg bg-gray-100" /> : d.balance.accounts.length === 0 && d.balance.noAccount === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Nenhuma conta cadastrada. <Link href="/financeiro/contas" className="text-brand-700 underline">Cadastrar</Link></p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {d.balance.accounts.map((a) => (
                <li key={a.id}>
                  <Link href={`/financeiro/extrato?accountId=${a.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color ?? '#9ca3af' }} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">{a.name}</span>
                        <span className="block truncate text-xs text-gray-500">{[ACCOUNT_TYPE[a.type] ?? a.type, a.bankName, !a.includeInTotal && 'fora do total'].filter(Boolean).join(' · ')}</span>
                      </span>
                    </span>
                    <span className={cn('shrink-0 text-sm font-semibold tabular-nums', a.balance < 0 ? 'text-red-600' : 'text-gray-900')}>{brl(a.balance)}</span>
                  </Link>
                </li>
              ))}
              {d.balance.noAccount !== 0 && (
                <li className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm text-gray-600"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-gray-400" />Sem conta</span>
                  <span className={cn('text-sm font-semibold tabular-nums', d.balance.noAccount < 0 ? 'text-red-600' : 'text-gray-900')}>{brl(d.balance.noAccount)}</span>
                </li>
              )}
              <li className="flex items-center justify-between gap-3 pt-2.5 text-sm font-semibold text-gray-900"><WithHint term="SALDO_CONSOLIDADO">Total consolidado</WithHint><span className="tabular-nums">{brl(d.balance.total)}</span></li>
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title={<WithHint term="SALDO_PROJETADO">Saldo projetado · 90 dias</WithHint>}
          actions={d && d.projection.length > 0 && <span className="text-xs text-gray-500">Em 90 dias: <span className={cn('font-semibold', d.projection[d.projection.length - 1].balance < 0 ? 'text-red-600' : 'text-gray-900')}>{brl(d.projection[d.projection.length - 1].balance)}</span></span>}>
          {d ? <ProjectionChart data={d.projection} /> : <div className="h-56 animate-pulse rounded-lg bg-gray-100" />}
        </Card>
        <Card title="Maiores despesas do mês">
          {d ? <TopExpensesBars data={d.topExpenses} total={d.result.expense} /> : <div className="h-40 animate-pulse rounded-lg bg-gray-100" />}
        </Card>
      </div>

      <Card title="Próximos vencimentos" actions={<div className="flex gap-3 text-xs"><Link href="/financeiro/receber" className="text-brand-700 hover:underline">A receber</Link><Link href="/financeiro/pagar" className="text-brand-700 hover:underline">A pagar</Link></div>}>
        {!d ? <div className="h-32 animate-pulse rounded-lg bg-gray-100" /> : d.upcoming.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Nenhum vencimento em aberto.</p>
        ) : (
          <ul className="-my-2 divide-y divide-gray-100">
            {d.upcoming.map((u) => (
              <li key={u.id}>
                <Link href={`/financeiro/${u.type === 'RECEITA' ? 'receber' : 'pagar'}?id=${u.id}`} className="flex items-center gap-3 py-2.5 hover:bg-gray-50">
                  <span className={cn('w-14 shrink-0 text-center text-xs font-semibold', u.dueDate === d.today ? 'text-amber-600' : 'text-gray-500')}>
                    {u.dueDate === d.today ? 'Hoje' : dateBR(u.dueDate).slice(0, 5)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{u.description}</span>
                    <span className="block truncate text-xs text-gray-500">{[u.counterparty, u.category, u.account].filter(Boolean).join(' · ') || '—'}</span>
                  </span>
                  <span className={cn('shrink-0 text-sm font-semibold tabular-nums', u.type === 'RECEITA' ? 'text-teal-700' : 'text-orange-700')}>
                    {u.type === 'RECEITA' ? '+' : '−'}{brl(Math.abs(u.amount))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
