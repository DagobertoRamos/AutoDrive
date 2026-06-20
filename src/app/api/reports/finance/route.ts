// =============================================================================
// /api/reports/finance?view=... — relatórios financeiros (read-only).
// Sobre FinancialEntry/FinancialAccount. Multi-tenant via tenantWhere; gated
// por canAccessModule('logs'). Views:
//   visao-geral, dre, contas, contas-a-pagar, contas-a-receber, fluxo-de-caixa,
//   receitas, despesas, resultado-unidade, resultado-vendedor, resultado-periodo
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { num, entryTextSearch } from '@/lib/finance/finance-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

const VIEWS = ['visao-geral', 'dre', 'contas', 'contas-a-pagar', 'contas-a-receber', 'fluxo-de-caixa', 'receitas', 'despesas', 'resultado-unidade', 'resultado-vendedor', 'resultado-periodo'] as const
type View = (typeof VIEWS)[number]

const monthKey = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : '—')

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'logs')) return forbiddenResponse('Sem acesso a relatórios.')
  { const gate = await assertModuleEnabled(user, 'logs'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const { searchParams } = new URL(req.url)
    const viewParam = (searchParams.get('view') ?? 'visao-geral') as View
    const view: View = VIEWS.includes(viewParam) ? viewParam : 'visao-geral'
    const now = new Date()

    // Filtro de período (de/até). Campo de data por view: fluxo=paidDate,
    // contas a pagar/receber=dueDate, demais=competenceDate. "contas" (saldo
    // acumulado) ignora período.
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const dateRange = from || to
      ? { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}) }
      : null
    const dateField =
      view === 'fluxo-de-caixa' ? 'paidDate'
      : view === 'contas-a-pagar' || view === 'contas-a-receber' ? 'dueDate'
      : view === 'contas' ? null
      : 'competenceDate'
    const base = (extra: Record<string, unknown> = {}) =>
      tenantWhere(user.role, tenantId, dateRange && dateField ? { ...extra, [dateField]: dateRange } : extra)

    // ---- Visão geral -----------------------------------------------------
    if (view === 'visao-geral') {
      const [recAll, despAll, aReceber, aPagar] = await Promise.all([
        prisma.financialEntry.aggregate({ where: base({ type: 'RECEITA', status: { in: ['RECEBIDO', 'PAGO'] } }) as never, _sum: { amount: true } }),
        prisma.financialEntry.aggregate({ where: base({ type: 'DESPESA', status: { in: ['PAGO', 'RECEBIDO'] } }) as never, _sum: { amount: true } }),
        prisma.financialEntry.aggregate({ where: base({ type: 'RECEITA', status: 'PREVISTO' }) as never, _sum: { amount: true } }),
        prisma.financialEntry.aggregate({ where: base({ type: 'DESPESA', status: 'PREVISTO' }) as never, _sum: { amount: true } }),
      ])
      const receitas = num(recAll._sum.amount), despesas = num(despAll._sum.amount)
      return NextResponse.json({ success: true, view, summary: { receitas, despesas, saldo: receitas - despesas, aReceber: num(aReceber._sum.amount), aPagar: num(aPagar._sum.amount) } })
    }

    // ---- Contas (saldo por conta) ----------------------------------------
    if (view === 'contas') {
      const accounts = await prisma.financialAccount.findMany({ where: base() as never, orderBy: { name: 'asc' } })
      const movements = await prisma.financialEntry.groupBy({
        by: ['accountId', 'type'], where: base({ status: { in: ['PAGO', 'RECEBIDO'] } }) as never, _sum: { amount: true },
      })
      const recv = new Map<string, number>(), paid = new Map<string, number>()
      for (const m of movements) {
        if (!m.accountId) continue
        const map = m.type === 'RECEITA' ? recv : paid
        map.set(m.accountId, (map.get(m.accountId) ?? 0) + num(m._sum.amount))
      }
      const data = accounts.map((a) => {
        const r = recv.get(a.id) ?? 0, p = paid.get(a.id) ?? 0
        return { id: a.id, name: a.name, type: a.type, openingBalance: num(a.openingBalance), recebido: r, pago: p, saldo: num(a.openingBalance) + r - p, active: a.active }
      })
      return NextResponse.json({ success: true, view, summary: { contas: data.length, saldoTotal: data.reduce((s, d) => s + d.saldo, 0) }, data })
    }

    // ---- DRE (por categoria, regime de competência) ----------------------
    if (view === 'dre') {
      const grouped = await prisma.financialEntry.groupBy({
        by: ['categoryId', 'type'], where: base({ status: { not: 'CANCELADO' } }) as never, _sum: { amount: true },
      })
      const catIds = [...new Set(grouped.map((g) => g.categoryId).filter(Boolean))] as string[]
      const cats = catIds.length ? await prisma.financialCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } }) : []
      const nameMap = Object.fromEntries(cats.map((c) => [c.id, c.name]))
      const receitas: { categoria: string; total: number }[] = [], despesas: { categoria: string; total: number }[] = []
      for (const g of grouped) {
        const row = { categoria: g.categoryId ? (nameMap[g.categoryId] ?? 'Sem categoria') : 'Sem categoria', total: num(g._sum.amount) }
        ;(g.type === 'RECEITA' ? receitas : despesas).push(row)
      }
      receitas.sort((a, b) => b.total - a.total); despesas.sort((a, b) => b.total - a.total)
      const totalReceitas = receitas.reduce((s, r) => s + r.total, 0), totalDespesas = despesas.reduce((s, d) => s + d.total, 0)
      return NextResponse.json({ success: true, view, receitas, despesas, summary: { totalReceitas, totalDespesas, resultado: totalReceitas - totalDespesas } })
    }

    // ---- Fluxo de caixa (por mês, liquidados) ----------------------------
    if (view === 'fluxo-de-caixa') {
      const rows = await prisma.financialEntry.findMany({
        where: base({ status: { in: ['PAGO', 'RECEBIDO'] }, paidDate: { not: null } }) as never,
        select: { type: true, amount: true, paidDate: true }, take: 5000,
      })
      const agg = new Map<string, { entradas: number; saidas: number }>()
      for (const r of rows) {
        const k = monthKey(r.paidDate)
        const e = agg.get(k) ?? { entradas: 0, saidas: 0 }
        if (r.type === 'RECEITA') e.entradas += num(r.amount); else e.saidas += num(r.amount)
        agg.set(k, e)
      }
      const meses = [...agg.entries()].map(([mes, v]) => ({ mes, ...v, saldo: v.entradas - v.saidas })).sort((a, b) => a.mes.localeCompare(b.mes))
      const entradas = meses.reduce((s, m) => s + m.entradas, 0), saidas = meses.reduce((s, m) => s + m.saidas, 0)
      return NextResponse.json({ success: true, view, meses, summary: { entradas, saidas, saldo: entradas - saidas } })
    }

    // ---- Resultado por unidade/vendedor/período --------------------------
    if (view === 'resultado-unidade' || view === 'resultado-vendedor' || view === 'resultado-periodo') {
      const rows = await prisma.financialEntry.findMany({
        where: base({ status: { not: 'CANCELADO' } }) as never,
        select: { type: true, amount: true, unitId: true, sellerId: true, competenceDate: true, createdAt: true }, take: 5000,
      })
      const keyOf = (r: typeof rows[number]) =>
        view === 'resultado-unidade' ? (r.unitId ?? '__sem__')
        : view === 'resultado-vendedor' ? (r.sellerId ?? '__sem__')
        : monthKey(r.competenceDate ?? r.createdAt)
      const agg = new Map<string, { receitas: number; despesas: number }>()
      for (const r of rows) {
        const k = keyOf(r)
        const e = agg.get(k) ?? { receitas: 0, despesas: 0 }
        if (r.type === 'RECEITA') e.receitas += num(r.amount); else e.despesas += num(r.amount)
        agg.set(k, e)
      }
      const nameMap: Record<string, string> = {}
      const ids = [...agg.keys()].filter((k) => k !== '__sem__')
      if (view === 'resultado-unidade' && ids.length) {
        (await prisma.unit.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).forEach((u) => { nameMap[u.id] = u.name })
      } else if (view === 'resultado-vendedor' && ids.length) {
        (await prisma.seller.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, shortName: true } })).forEach((s) => { nameMap[s.id] = s.shortName || s.fullName })
      }
      const isPeriodo = view === 'resultado-periodo'
      const grouped = [...agg.entries()].map(([k, v]) => ({
        name: isPeriodo ? k : (k === '__sem__' ? '—' : (nameMap[k] ?? '—')),
        receitas: v.receitas, despesas: v.despesas, resultado: v.receitas - v.despesas,
      })).sort((a, b) => isPeriodo ? a.name.localeCompare(b.name) : b.resultado - a.resultado)
      return NextResponse.json({ success: true, view, grouped, summary: { grupos: grouped.length, receitas: grouped.reduce((s, g) => s + g.receitas, 0), despesas: grouped.reduce((s, g) => s + g.despesas, 0) } })
    }

    // ---- Listas (receitas/despesas/contas-a-pagar/contas-a-receber) ------
    const extra: Record<string, unknown> = {}
    if (view === 'receitas') extra.type = 'RECEITA'
    if (view === 'despesas') extra.type = 'DESPESA'
    if (view === 'contas-a-pagar') { extra.type = 'DESPESA'; extra.status = 'PREVISTO' }
    if (view === 'contas-a-receber') { extra.type = 'RECEITA'; extra.status = 'PREVISTO' }
    const searchOr = entryTextSearch(searchParams.get('q'))
    if (searchOr) extra.OR = searchOr
    const where = base(extra)
    const isAging = view === 'contas-a-pagar' || view === 'contas-a-receber'

    const [rows, byCat] = await Promise.all([
      prisma.financialEntry.findMany({
        where: where as never,
        orderBy: isAging ? [{ dueDate: 'asc' }] : [{ competenceDate: 'desc' }, { createdAt: 'desc' }],
        take: 500,
        include: { category: { select: { name: true } }, account: { select: { name: true } } },
      }),
      prisma.financialEntry.groupBy({ by: ['categoryId'], where: where as never, _sum: { amount: true }, _count: { _all: true } }),
    ])
    const catIds = [...new Set(byCat.map((g) => g.categoryId).filter(Boolean))] as string[]
    const cats = catIds.length ? await prisma.financialCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } }) : []
    const catMap = Object.fromEntries(cats.map((c) => [c.id, c.name]))

    const data = rows.map((e) => {
      const venc = isAging && e.dueDate ? e.dueDate < now : false
      return {
        id: e.id, type: e.type, status: e.status, description: e.description, amount: num(e.amount),
        category: e.category?.name ?? '—', account: e.account?.name ?? null, counterparty: e.counterparty,
        dueDate: e.dueDate, competenceDate: e.competenceDate, paidDate: e.paidDate, source: e.source, vencida: venc,
      }
    })
    const byCategory = byCat.map((g) => ({ categoria: g.categoryId ? (catMap[g.categoryId] ?? 'Sem categoria') : 'Sem categoria', total: num(g._sum.amount), count: g._count._all })).sort((a, b) => b.total - a.total)
    const total = data.reduce((s, d) => s + d.amount, 0)
    const summary: Record<string, number> = { count: data.length, total }
    if (isAging) summary.vencidas = data.filter((d) => d.vencida).length
    return NextResponse.json({ success: true, view, summary, byCategory, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
