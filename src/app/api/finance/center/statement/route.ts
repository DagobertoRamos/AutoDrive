// =============================================================================
// GET /api/finance/center/statement?accountId=(id|all)&from=YYYY-MM-DD&to=YYYY-MM-DD
// Extrato: saldo de abertura em `from`, linhas realizadas (data de pagamento)
// com saldo corrente, saldo final e totais. "all" = consolidado (contas ativas
// que entram no total + lançamentos sem conta). Transferências aparecem.
// Padrão: mês corrente.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { ensureFinanceSetup } from '@/lib/finance/setup'
import { loadAccounts, loadRealized } from '@/lib/finance/ledger-server'
import {
  addDays, balanceAsOf, countsInBalance, diffDays, isYmd, makeScope, monthEnd, r2, realizedYmd, runningBalance, signedAmount, spYmd,
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
    let from = sp.get('from') ?? ''
    let to = sp.get('to') ?? ''
    if (!isYmd(from)) from = `${today.slice(0, 7)}-01`
    if (!isYmd(to)) to = monthEnd(from.slice(0, 7))
    if (to < from) [from, to] = [to, from]
    if (diffDays(from, to) > 1830) return NextResponse.json({ success: false, error: 'Período máximo de 5 anos.' }, { status: 400 })

    const accountId = sp.get('accountId') || 'all'
    const accounts = await loadAccounts(tenantId)
    const account = accountId === 'all' ? null : accounts.find((a) => a.id === accountId)
    if (accountId !== 'all' && !account) return NextResponse.json({ success: false, error: 'Conta não encontrada.' }, { status: 404 })

    const scope = makeScope(accounts, accountId)
    const realized = await loadRealized(tenantId)
    const opening = balanceAsOf(realized, scope, addDays(from, -1))

    const inPeriod = realized
      .filter((e) => countsInBalance(e, scope))
      .map((e) => ({ e, ymd: realizedYmd(e) ?? today }))
      .filter((x) => x.ymd >= from && x.ymd <= to)

    const details = inPeriod.length
      ? await prisma.financialEntry.findMany({
        where: { tenantId, id: { in: inPeriod.map((x) => x.e.id) } },
        select: {
          id: true, description: true, counterparty: true, paidDate: true, createdAt: true, documentNumber: true,
          category: { select: { name: true } }, costCenter: { select: { name: true } }, account: { select: { name: true } },
        },
      })
      : []
    const det = new Map(details.map((d) => [d.id, d]))

    type Line = {
      key: string; date: string; description: string; category: string | null; costCenter: string | null; counterparty: string | null
      account: string | null; documentNumber: string | null; type: 'RECEITA' | 'DESPESA' | 'SALDO_INICIAL'; amount: number; status: string
      entryId: string | null; transferGroupId: string | null; sortAt: number
    }
    const lines: Line[] = inPeriod.map(({ e, ymd }) => {
      const d = det.get(e.id)
      return {
        key: e.id, date: ymd, description: d?.description ?? '—', category: d?.category?.name ?? null,
        costCenter: d?.costCenter?.name ?? null, counterparty: d?.counterparty ?? null,
        account: d?.account?.name ?? 'Sem conta', documentNumber: d?.documentNumber ?? null,
        type: e.type, amount: signedAmount(e), status: e.status, entryId: e.id, transferGroupId: e.transferGroupId ?? null,
        sortAt: (d?.paidDate ?? d?.createdAt)?.getTime() ?? 0,
      }
    })
    // Saldo inicial de conta cuja data cai dentro do período vira linha.
    for (const a of scope.accounts) {
      const o = spYmd(a.openingDate)
      if (o && o >= from && o <= to && a.openingBalance) {
        lines.push({
          key: `opening-${a.id}`, date: o, description: 'Saldo inicial', category: null, costCenter: null, counterparty: null,
          account: a.name, documentNumber: null, type: 'SALDO_INICIAL', amount: a.openingBalance, status: 'SALDO_INICIAL',
          entryId: null, transferGroupId: null, sortAt: -Infinity,
        })
      }
    }
    lines.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.sortAt - b.sortAt || a.key.localeCompare(b.key)))

    const run = runningBalance(opening, lines)
    // Totais só de movimento (a linha de saldo inicial não é entrada).
    const moves = lines.filter((l) => l.type !== 'SALDO_INICIAL')
    const totalIn = r2(moves.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0))
    const totalOut = r2(moves.reduce((s, l) => s + (l.amount < 0 ? -l.amount : 0), 0))
    return NextResponse.json({
      success: true,
      data: {
        account: { id: accountId, name: account?.name ?? 'Todas as contas' },
        accounts: accounts.filter((a) => a.active || a.id === accountId).map((a) => ({ id: a.id, name: a.name, includeInTotal: a.includeInTotal, active: a.active })),
        from, to,
        openingBalance: run.opening,
        closingBalance: run.closing,
        totalIn,
        totalOut,
        lines: run.lines.map(({ sortAt: _s, ...l }) => l),
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
