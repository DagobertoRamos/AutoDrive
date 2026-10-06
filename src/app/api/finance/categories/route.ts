// =============================================================================
// /api/finance/categories — plano de contas (categorias de receita/despesa). Por loja.
//   GET  : finance  → lista plana (compatível: ?kind=, ?active=true), agora com
//                     code, parentId, dreGroup; ?tree=1 → { RECEITA: Node[], DESPESA: Node[] }
//                     com contagem de lançamentos e linha da DRE herdada.
//   POST : finance.manage → cria no topo ou como subcategoria (tipo herdado do pai;
//                     código sugerido quando não informado).
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { financeGuard } from '@/lib/finance/access'
import { ensureFinanceSetup } from '@/lib/finance/setup'
import { DRE_GROUP_BY_KEY } from '@/lib/finance/dre-core'
import { buildCategoryTree, compareCode, nextCode } from './tree'

const createSchema = z.object({
  name:      z.string().trim().min(2, 'Informe o nome.').max(120),
  kind:      z.enum(['RECEITA', 'DESPESA']).optional(),
  parentId:  z.string().nullish(),
  code:      z.string().trim().max(20).nullish(),
  dreGroup:  z.string().max(40).nullish(),
  color:     z.string().max(20).nullish(),
  active:    z.boolean().default(true),
})

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const { tenantId } = g

  try {
    await ensureFinanceSetup(tenantId).catch((e) => console.error('[finance] setup', e))
    const { searchParams } = new URL(req.url)
    const where: Record<string, unknown> = { tenantId }
    const kind = searchParams.get('kind')
    if (kind === 'RECEITA' || kind === 'DESPESA') where.kind = kind
    if (searchParams.get('active') === 'true') where.active = true

    const rows = await prisma.financialCategory.findMany({ where, orderBy: [{ kind: 'asc' }, { name: 'asc' }] })
    if (searchParams.get('tree') === '1') {
      const counts = await prisma.financialEntry.groupBy({ by: ['categoryId'], where: { tenantId, categoryId: { not: null } }, _count: { _all: true } })
      const countMap = new Map(counts.map((c) => [c.categoryId as string, c._count._all]))
      const tree = buildCategoryTree(rows, countMap)
      return NextResponse.json({
        success: true,
        data: { RECEITA: tree.filter((n) => n.kind === 'RECEITA'), DESPESA: tree.filter((n) => n.kind === 'DESPESA') },
      })
    }
    const data = [...rows].sort((a, b) => a.kind.localeCompare(b.kind) || compareCode(a.code, b.code) || a.name.localeCompare(b.name, 'pt-BR'))
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { user, tenantId } = g

  try {
    const d = createSchema.parse(await req.json())
    let kind = d.kind
    let parentCode: string | null = null
    if (d.parentId) {
      const parent = await prisma.financialCategory.findFirst({ where: { id: d.parentId, tenantId }, select: { kind: true, code: true } })
      if (!parent) return NextResponse.json({ success: false, error: 'Categoria pai inválida.' }, { status: 400 })
      kind = parent.kind
      parentCode = parent.code
    }
    if (!kind) return NextResponse.json({ success: false, error: 'Informe o tipo.' }, { status: 400 })
    if (d.dreGroup && !DRE_GROUP_BY_KEY[d.dreGroup]) return NextResponse.json({ success: false, error: 'Linha da DRE inválida.' }, { status: 400 })

    let code = d.code?.trim() || null
    if (!code && (!d.parentId || parentCode)) {
      const siblings = await prisma.financialCategory.findMany({ where: { tenantId, parentId: d.parentId ?? null }, select: { code: true } })
      code = nextCode(parentCode, siblings.map((s) => s.code))
    }
    const sortOrder = await prisma.financialCategory.count({ where: { tenantId, parentId: d.parentId ?? null } })
    const category = await prisma.financialCategory.create({
      data: { tenantId, name: d.name, kind, parentId: d.parentId ?? null, code, dreGroup: d.dreGroup || null, color: d.color || null, active: d.active, sortOrder },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinancialCategory', entityId: category.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: category }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
