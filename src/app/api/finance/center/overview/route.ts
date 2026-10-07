// =============================================================================
// GET /api/finance/center/overview?month=YYYY-MM — Painel financeiro.
// Saldos (consolidado + por conta), a receber/a pagar por janela, resultado do
// mês por competência, série de 12 meses, top despesas, próximos vencimentos e
// saldo projetado de 90 dias. Transferências ficam fora de receitas/despesas.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeCan, financeGuard } from '@/lib/finance/access'
import { ensureFinanceSetup } from '@/lib/finance/setup'
import { spDayEnd, spDayStart } from '@/lib/dashboard/tz'
import { loadAccounts, loadPending, loadRealized } from '@/lib/finance/ledger-server'
import {
  addDays, addMonths, balanceAsOf, balancesByAccount, competenceYmd, dropInternalTransfers, dueSummary, inScope, makeScope,
  monthEnd, monthLabel, monthStart, projectDailyBalance, r2, realizedYmd, signedAmount, spYmd,
} from '@/lib/finance/ledger'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const { tenantId } = g

  try {
    await ensureFinanceSetup(tenantId)
    const canBalances = await financeCan(g.user, 'finance.balances')
    const today = spYmd(new Date())!
    const qMonth = new URL(req.url).searchParams.get('month') ?? ''
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(qMonth) ? qMonth : today.slice(0, 7)
    const mStart = monthStart(month)
    const mEnd = monthEnd(month)

    const [accounts, realized, pending, categories] = await Promise.all([
      loadAccounts(tenantId),
      loadRealized(tenantId),
      loadPending(tenantId),
      prisma.financialCategory.findMany({ where: { tenantId }, select: { id: true, name: true, parentId: true, color: true } }),
    ])
    const scope = makeScope(accounts, 'all')

    // ── Saldos ──
    const total = balanceAsOf(realized, scope, today)
    const { byAccount, noAccount } = balancesByAccount(realized, accounts, today)
    const accountList = accounts
      .filter((a) => a.active)
      .map((a) => ({ id: a.id, name: a.name, type: a.type, color: a.color, bankName: a.bankName, includeInTotal: a.includeInTotal, balance: byAccount.get(a.id) ?? 0 }))

    // ── A receber / a pagar (previstos, sem transferências) ──
    const pend = pending.filter((e) => !e.transferGroupId)
    const due = (type: 'RECEITA' | 'DESPESA') =>
      dueSummary(pend.filter((e) => e.type === type).map((e) => ({ ymd: spYmd(e.dueDate)!, amount: e.amount })), today)
    const receivables = due('RECEITA')
    const payables = due('DESPESA')

    // ── Resultado do mês (competência) ──
    // Margem de 1 dia na consulta; o corte exato por dia de SP é feito em memória.
    const range = { gte: spDayStart(addDays(mStart, -1)), lte: spDayEnd(addDays(mEnd, 1)) }
    const compRows = await prisma.financialEntry.findMany({
      where: {
        tenantId, status: { not: 'CANCELADO' }, transferGroupId: null,
        OR: [
          { competenceDate: range },
          { competenceDate: null, dueDate: range },
          { competenceDate: null, dueDate: null, paidDate: range },
        ],
      },
      select: { type: true, amount: true, competenceDate: true, dueDate: true, paidDate: true, categoryId: true },
    })
    let revenue = 0
    let expense = 0
    const byTop = new Map<string, number>()
    const catById = new Map(categories.map((c) => [c.id, c]))
    const topOf = (id: string | null) => {
      let c = id ? catById.get(id) : undefined
      for (let i = 0; c?.parentId && i < 6; i++) c = catById.get(c.parentId) ?? c
      return c ?? null
    }
    for (const r of compRows) {
      const d = competenceYmd(r)
      if (!d || d < mStart || d > mEnd) continue
      const v = Number(r.amount ?? 0)
      if (r.type === 'RECEITA') revenue += v
      else {
        expense += v
        const key = topOf(r.categoryId)?.id ?? '__none__'
        byTop.set(key, (byTop.get(key) ?? 0) + v)
      }
    }
    const topExpenses = [...byTop.entries()]
      .map(([id, v]) => {
        const c = id === '__none__' ? null : catById.get(id)
        return { categoryId: c?.id ?? null, name: c?.name ?? 'Sem categoria', color: c?.color ?? null, total: r2(v) }
      })
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)

    // ── Fluxo realizado (consolidado, sem transferências internas) ──
    const flows = dropInternalTransfers(
      realized.filter((e) => inScope(e, scope)).map((e) => ({ ymd: realizedYmd(e), amount: signedAmount(e), g: e.transferGroupId })),
      (x) => x.g, (x) => x.amount,
    )
    const flowOfMonth = (ym: string) => {
      let ins = 0, outs = 0
      for (const f of flows) {
        if (!f.ymd || f.ymd.slice(0, 7) !== ym) continue
        if (f.amount >= 0) ins += f.amount
        else outs -= f.amount
      }
      return { entradas: r2(ins), saidas: r2(outs) }
    }
    const cur = flowOfMonth(month)
    const series = Array.from({ length: 12 }, (_, i) => {
      const ym = addMonths(month, i - 11)
      const end = monthEnd(ym)
      return { month: ym, label: monthLabel(ym), ...flowOfMonth(ym), saldo: balanceAsOf(realized, scope, end > today ? today : end) }
    })

    // ── Próximos vencimentos ──
    const upcomingRows = await prisma.financialEntry.findMany({
      where: { tenantId, status: 'PREVISTO', transferGroupId: null, dueDate: { gte: spDayStart(today) } },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 10,
      select: {
        id: true, type: true, description: true, amount: true, dueDate: true, counterparty: true,
        category: { select: { name: true } }, account: { select: { name: true } },
      },
    })
    const upcoming = upcomingRows.map((e) => ({
      id: e.id, type: e.type, description: e.description, amount: Number(e.amount ?? 0), dueDate: spYmd(e.dueDate),
      counterparty: e.counterparty, category: e.category?.name ?? null, account: e.account?.name ?? null,
    }))

    // ── Saldo projetado 90 dias (consolidado) ──
    const pendingFlows = dropInternalTransfers(
      pending.filter((e) => inScope(e, scope)).map((e) => ({ ymd: spYmd(e.dueDate)!, amount: signedAmount(e), g: e.transferGroupId })),
      (x) => x.g, (x) => x.amount,
    )
    const projection = projectDailyBalance(total, today, 90, pendingFlows)

    return NextResponse.json({
      success: true,
      data: {
        month, today,
        // Sem "ver saldos bancários": saldos e projeção não saem do servidor.
        balance: canBalances ? { total, accounts: accountList, noAccount } : { total: 0, accounts: [], noAccount: 0 },
        balanceHidden: !canBalances,
        receivables, payables,
        result: {
          revenue: r2(revenue), expense: r2(expense), result: r2(revenue - expense),
          realizedIn: cur.entradas, realizedOut: cur.saidas, realizedNet: r2(cur.entradas - cur.saidas),
        },
        series, topExpenses, upcoming, projection: canBalances ? projection : [],
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

