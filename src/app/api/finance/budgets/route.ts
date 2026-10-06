// =============================================================================
// /api/finance/budgets — orçamento mensal por categoria (e centro de custo opcional).
//   GET : finance  ?month=YYYY-MM | ?year=YYYY  &costCenterId=<id|vazio=geral>
//         → { data: { months, costCenterId, categories (árvore achatada),
//                     budgets {catId:{mês:valor}}, actuals {catId:{mês:valor}} } }
//         Realizado = lançamentos não cancelados por competência (sem transferências);
//         no orçamento geral conta a loja toda, no do centro de custo só os dele.
//   PUT : finance.manage { costCenterId: string|null, items: [{ month, categoryId, amount }] }
//         amount 0 remove a linha.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { financeGuard } from '@/lib/finance/access'
import { ensureFinanceSetup } from '@/lib/finance/setup'
import { competenceYmd } from '@/lib/finance/ledger'
import { buildCategoryTree, type CategoryNode } from '../categories/tree'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const bad = (error: string) => NextResponse.json({ success: false, error }, { status: 400 })
const r2 = (n: number) => Math.round(n * 100) / 100

const putSchema = z.object({
  costCenterId: z.string().nullish(),
  items: z.array(z.object({
    month:      z.string().regex(MONTH, 'Mês inválido.'),
    categoryId: z.string().min(1),
    amount:     z.number({ invalid_type_error: 'Valor inválido.' }).min(0, 'Valor inválido.'),
  })).max(5000),
})

function flatten(nodes: CategoryNode[]) {
  const out: { id: string; name: string; code: string | null; kind: string; parentId: string | null; depth: number; hasChildren: boolean; active: boolean; dreLabel: string | null }[] = []
  const walk = (list: CategoryNode[]) => list.forEach((n) => {
    out.push({ id: n.id, name: n.name, code: n.code, kind: n.kind, parentId: n.parentId, depth: n.depth, hasChildren: n.children.length > 0, active: n.active, dreLabel: n.dreLabel })
    walk(n.children)
  })
  walk(nodes)
  return out
}

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const { tenantId } = g

  try {
    await ensureFinanceSetup(tenantId).catch((e) => console.error('[finance] setup', e))
    const sp = new URL(req.url).searchParams
    const month = sp.get('month')
    const year = sp.get('year')
    let months: string[]
    if (year && /^\d{4}$/.test(year)) months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
    else if (month && MONTH.test(month)) months = [month]
    else return bad('Informe o mês ou o ano.')
    const costCenterId = sp.get('costCenterId') || null

    const first = months[0]
    const last = months[months.length - 1]
    const [ly, lm] = last.split('-').map(Number)
    // Janela folgada (±1 dia) — o mês exato é decidido pela competência em SP.
    const start = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, 0))
    const end = new Date(Date.UTC(ly, lm, 2))

    const entryWhere: Prisma.FinancialEntryWhereInput = {
      tenantId, status: { not: 'CANCELADO' }, transferGroupId: null, categoryId: { not: null },
      ...(costCenterId ? { costCenterId } : {}),
      OR: [
        { competenceDate: { gte: start, lt: end } },
        { competenceDate: null, dueDate: { gte: start, lt: end } },
        { competenceDate: null, dueDate: null, paidDate: { gte: start, lt: end } },
      ],
    }
    const [cats, budgets, entries] = await Promise.all([
      prisma.financialCategory.findMany({ where: { tenantId } }),
      prisma.financialBudget.findMany({ where: { tenantId, month: { in: months }, costCenterId } }),
      prisma.financialEntry.findMany({ where: entryWhere, select: { categoryId: true, type: true, amount: true, competenceDate: true, dueDate: true, paidDate: true } }),
    ])

    const tree = buildCategoryTree(cats, new Map())
    const categories = [...flatten(tree.filter((n) => n.kind === 'DESPESA')), ...flatten(tree.filter((n) => n.kind === 'RECEITA'))]
    const kindOf = new Map(cats.map((c) => [c.id, c.kind]))

    const budgetMap: Record<string, Record<string, number>> = {}
    for (const b of budgets) (budgetMap[b.categoryId] ??= {})[b.month] = r2(Number(b.amount))
    const actuals: Record<string, Record<string, number>> = {}
    const monthSet = new Set(months)
    for (const e of entries) {
      const ym = competenceYmd(e)?.slice(0, 7)
      if (!ym || !monthSet.has(ym) || !e.categoryId) continue
      if (kindOf.get(e.categoryId) !== e.type) continue
      const row = (actuals[e.categoryId] ??= {})
      row[ym] = r2((row[ym] ?? 0) + Number(e.amount))
    }
    return NextResponse.json({ success: true, data: { months, costCenterId, categories, budgets: budgetMap, actuals } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: Request) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { user, tenantId } = g

  try {
    const d = putSchema.parse(await req.json())
    const costCenterId = d.costCenterId || null
    if (costCenterId && !(await prisma.financialCostCenter.findFirst({ where: { id: costCenterId, tenantId }, select: { id: true } }))) {
      return bad('Centro de custo inválido.')
    }
    const catIds = [...new Set(d.items.map((i) => i.categoryId))]
    const valid = await prisma.financialCategory.count({ where: { tenantId, id: { in: catIds } } })
    if (valid !== catIds.length) return bad('Categoria inválida.')

    // NULL em costCenterId não entra no unique do Postgres → upsert manual.
    let saved = 0
    for (const it of d.items) {
      const amount = r2(it.amount)
      const existing = await prisma.financialBudget.findFirst({ where: { tenantId, month: it.month, categoryId: it.categoryId, costCenterId }, select: { id: true } })
      if (amount <= 0) {
        if (existing) await prisma.financialBudget.deleteMany({ where: { tenantId, month: it.month, categoryId: it.categoryId, costCenterId } })
        continue
      }
      if (existing) await prisma.financialBudget.update({ where: { id: existing.id }, data: { amount } })
      else await prisma.financialBudget.create({ data: { tenantId, month: it.month, categoryId: it.categoryId, costCenterId, amount } })
      saved++
    }
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'FinancialBudget', entityId: costCenterId, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { saved } })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
