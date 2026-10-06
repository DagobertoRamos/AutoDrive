// =============================================================================
// GET /api/finance/center/cashflow?from=&to=&granularity=day|month&accountId=&costCenterId=&includeOverdue=1
// Fluxo de caixa: realizado (data de pagamento) + previsto (vencimento) por
// período. Acumulado parte do saldo histórico no início do período e é
// ancorado no saldo atual no bucket de hoje. Com filtro de centro de custo não
// há saldo de conta: o acumulado é o líquido do filtro a partir de zero.
// No consolidado, transferências entre contas do escopo se anulam e saem.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { ensureFinanceSetup } from '@/lib/finance/setup'
import { loadAccounts, loadPending, loadRealized, type CenterEntry } from '@/lib/finance/ledger-server'
import {
  addDays, addMonths, balanceAsOf, buildCashflow, countsInBalance, diffDays, dropInternalTransfers, inScope, isYmd,
  makeScope, monthEnd, monthStart, r2, realizedYmd, signedAmount, spYmd, type FlowItem, type Granularity,
} from '@/lib/finance/ledger'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const { tenantId } = g

  try {
    await ensureFinanceSetup(tenantId)
    const sp = new URL(req.url).searchParams
    const today = spYmd(new Date())!
    const granularity: Granularity = sp.get('granularity') === 'month' ? 'month' : 'day'
    let from = sp.get('from') ?? ''
    let to = sp.get('to') ?? ''
    const curMonth = today.slice(0, 7)
    if (!isYmd(from)) from = granularity === 'day' ? monthStart(curMonth) : monthStart(addMonths(curMonth, -5))
    if (!isYmd(to)) to = granularity === 'day' ? addDays(today, 30) : monthEnd(addMonths(curMonth, 6))
    if (to < from) [from, to] = [to, from]
    if (granularity === 'day' && diffDays(from, to) > 400) {
      return NextResponse.json({ success: false, error: 'Na visão diária o período máximo é de 400 dias.' }, { status: 400 })
    }
    if (granularity === 'month' && diffDays(from, to) > 366 * 5) {
      return NextResponse.json({ success: false, error: 'Período máximo de 5 anos.' }, { status: 400 })
    }
    const accountId = sp.get('accountId') || 'all'
    const costCenterId = sp.get('costCenterId') || ''
    const includeOverdue = sp.get('includeOverdue') !== '0'

    const [accounts, realized, pending, costCenters] = await Promise.all([
      loadAccounts(tenantId),
      loadRealized(tenantId),
      loadPending(tenantId),
      prisma.financialCostCenter.findMany({ where: { tenantId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ])
    if (accountId !== 'all' && !accounts.some((a) => a.id === accountId)) {
      return NextResponse.json({ success: false, error: 'Conta não encontrada.' }, { status: 404 })
    }
    const scope = makeScope(accounts, accountId)
    const consolidated = accountId === 'all'
    const ccOk = (e: CenterEntry) => !costCenterId || e.costCenterId === costCenterId

    type Item = FlowItem & { g: string | null }
    let realizedItems: Item[] = realized
      .filter((e) => countsInBalance(e, scope) && ccOk(e))
      .map((e) => ({ ymd: realizedYmd(e) ?? today, amount: signedAmount(e), realized: true, g: e.transferGroupId ?? null }))

    const overdue = { count: 0, in: 0, out: 0 }
    let pendingItems: Item[] = []
    for (const e of pending) {
      if (!inScope(e, scope) || !ccOk(e)) continue
      let ymd = spYmd(e.dueDate)!
      const amount = signedAmount(e)
      if (ymd < today) {
        overdue.count++
        if (amount >= 0) overdue.in += amount
        else overdue.out -= amount
        if (!includeOverdue) continue
        ymd = today
      }
      pendingItems.push({ ymd, amount, realized: false, g: e.transferGroupId ?? null })
    }
    if (consolidated) {
      realizedItems = dropInternalTransfers(realizedItems, (x) => x.g, (x) => x.amount)
      pendingItems = dropInternalTransfers(pendingItems, (x) => x.g, (x) => x.amount)
    }

    const anchored = !costCenterId
    const currentBalance = anchored ? balanceAsOf(realized, scope, today) : null
    let startBalance = 0
    if (anchored) {
      startBalance = balanceAsOf(realized, scope, addDays(from, -1))
      for (const p of pendingItems) if (p.ymd < from) startBalance += p.amount
      startBalance = r2(startBalance)
    }

    const buckets = buildCashflow({
      from, to, today, granularity, startBalance, currentBalance,
      items: [...realizedItems, ...pendingItems],
    })
    const sum = (k: 'realizedIn' | 'realizedOut' | 'projectedIn' | 'projectedOut' | 'entradas' | 'saidas') => r2(buckets.reduce((s, b) => s + b[k], 0))
    const totals = {
      entradas: sum('entradas'), saidas: sum('saidas'), saldo: r2(sum('entradas') - sum('saidas')),
      realizedIn: sum('realizedIn'), realizedOut: sum('realizedOut'), projectedIn: sum('projectedIn'), projectedOut: sum('projectedOut'),
      finalBalance: buckets.length ? buckets[buckets.length - 1].acumulado : startBalance,
    }

    return NextResponse.json({
      success: true,
      data: {
        from, to, today, granularity, accountId, costCenterId: costCenterId || null, includeOverdue,
        anchored, startBalance, currentBalance,
        overdue: { count: overdue.count, in: r2(overdue.in), out: r2(overdue.out) },
        totals, buckets,
        filters: {
          accounts: accounts.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name })),
          costCenters,
        },
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
