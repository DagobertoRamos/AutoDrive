// =============================================================================
// /api/finance/categories/[id] — editar / mover / inativar / excluir categoria. finance.manage
//   PATCH  : name, code, parentId (mover; mesmo tipo, sem ciclo), dreGroup, color, active, sortOrder
//   DELETE : exclui só se a categoria não tem lançamentos, despesas fixas, orçamento
//            nem subcategorias; caso contrário inativa. ?mode=inactivate força inativar.
//            → { success, deleted: boolean }
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { financeGuard } from '@/lib/finance/access'
import { DRE_GROUP_BY_KEY } from '@/lib/finance/dre-core'
import { isDescendant } from '../tree'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Categoria não encontrada.' }, { status: 404 })
const bad = (error: string) => NextResponse.json({ success: false, error }, { status: 400 })

const updateSchema = z.object({
  name:      z.string().trim().min(2, 'Informe o nome.').max(120).optional(),
  code:      z.string().trim().max(20).nullish(),
  parentId:  z.string().nullish(),
  dreGroup:  z.string().max(40).nullish(),
  color:     z.string().max(20).nullish(),
  active:    z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  kind:      z.enum(['RECEITA', 'DESPESA']).optional(),
})

export async function PATCH(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { user, tenantId } = g
  const { id } = await params

  try {
    const existing = await prisma.financialCategory.findFirst({ where: { id, tenantId } })
    if (!existing) return notFound()
    const d = updateSchema.parse(await req.json())
    const data: Record<string, unknown> = {}
    if (d.name !== undefined) data.name = d.name
    if (d.code !== undefined) data.code = d.code || null
    if (d.color !== undefined) data.color = d.color || null
    if (d.active !== undefined) data.active = d.active
    if (d.sortOrder !== undefined) data.sortOrder = d.sortOrder
    if (d.dreGroup !== undefined) {
      if (d.dreGroup && !DRE_GROUP_BY_KEY[d.dreGroup]) return bad('Linha da DRE inválida.')
      data.dreGroup = d.dreGroup || null
    }
    // Tipo só muda em categoria de topo sem lançamentos (subcategoria segue o pai).
    if (d.kind && d.kind !== existing.kind) {
      if (existing.parentId && d.parentId !== null) return bad('O tipo vem da categoria pai.')
      const used = await prisma.financialEntry.count({ where: { categoryId: id } })
      if (used) return bad('Categoria com lançamentos não muda de tipo.')
      data.kind = d.kind
    }
    if (d.parentId !== undefined && (d.parentId || null) !== existing.parentId) {
      if (d.parentId) {
        if (d.parentId === id) return bad('Escolha outra categoria pai.')
        const parent = await prisma.financialCategory.findFirst({ where: { id: d.parentId, tenantId }, select: { kind: true } })
        if (!parent) return bad('Categoria pai inválida.')
        if (parent.kind !== (data.kind ?? existing.kind)) return bad('A categoria pai precisa ser do mesmo tipo.')
        const all = await prisma.financialCategory.findMany({ where: { tenantId }, select: { id: true, parentId: true } })
        if (isDescendant(all, id, d.parentId)) return bad('Não é possível mover para dentro de uma subcategoria dela.')
      }
      data.parentId = d.parentId || null
    }

    const category = await prisma.financialCategory.update({ where: { id }, data })
    // Subcategorias acompanham o tipo do pai.
    if (data.kind) await prisma.financialCategory.updateMany({ where: { tenantId, parentId: id }, data: { kind: data.kind as 'RECEITA' | 'DESPESA' } })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'FinancialCategory', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: category })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { user, tenantId } = g
  const { id } = await params

  try {
    const existing = await prisma.financialCategory.findFirst({ where: { id, tenantId } })
    if (!existing) return notFound()
    const forceInactivate = new URL(req.url).searchParams.get('mode') === 'inactivate'
    const [entries, recurrences, budgets, children] = await Promise.all([
      prisma.financialEntry.count({ where: { categoryId: id } }),
      prisma.financialRecurrence.count({ where: { categoryId: id } }),
      prisma.financialBudget.count({ where: { categoryId: id } }),
      prisma.financialCategory.count({ where: { parentId: id } }),
    ])
    const inUse = entries + recurrences + budgets + children > 0
    if (inUse || forceInactivate) {
      await prisma.financialCategory.update({ where: { id }, data: { active: false } })
      await createSafeAuditLog({ userId: user.id, tenantId, action: 'UPDATE', entity: 'FinancialCategory', entityId: id, userName: user.name, userRole: user.role })
      return NextResponse.json({ success: true, deleted: false })
    }
    await prisma.financialCategory.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'DELETE', entity: 'FinancialCategory', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, deleted: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
