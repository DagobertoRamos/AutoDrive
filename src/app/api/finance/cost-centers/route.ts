// =============================================================================
// /api/finance/cost-centers — centros de custo da loja.
//   GET  : finance (?active=true) → { data: [{ id, name, code, parentId, active, entryCount, parentName }] }
//   POST : finance.manage { name*, code?, parentId?, active? }
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError, z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { financeGuard } from '@/lib/finance/access'
import { ensureFinanceSetup } from '@/lib/finance/setup'
import { compareCode } from '../categories/tree'

const costCenterSchema = z.object({
  name:     z.string().trim().min(2, 'Informe o nome.').max(120),
  code:     z.string().trim().max(20).nullish(),
  parentId: z.string().nullish(),
  active:   z.boolean().default(true),
})

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const { tenantId } = g

  try {
    await ensureFinanceSetup(tenantId).catch((e) => console.error('[finance] setup', e))
    const onlyActive = new URL(req.url).searchParams.get('active') === 'true'
    const [rows, counts] = await Promise.all([
      prisma.financialCostCenter.findMany({ where: { tenantId, ...(onlyActive ? { active: true } : {}) } }),
      prisma.financialEntry.groupBy({ by: ['costCenterId'], where: { tenantId, costCenterId: { not: null } }, _count: { _all: true } }),
    ])
    const countMap = new Map(counts.map((c) => [c.costCenterId as string, c._count._all]))
    const nameOf = new Map(rows.map((r) => [r.id, r.name]))
    const data = rows
      .map((r) => ({ ...r, entryCount: countMap.get(r.id) ?? 0, parentName: r.parentId ? nameOf.get(r.parentId) ?? null : null }))
      .sort((a, b) => Number(b.active) - Number(a.active) || compareCode(a.code, b.code) || a.name.localeCompare(b.name, 'pt-BR'))
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
    const d = costCenterSchema.parse(await req.json())
    if (d.parentId && !(await prisma.financialCostCenter.findFirst({ where: { id: d.parentId, tenantId }, select: { id: true } }))) {
      return NextResponse.json({ success: false, error: 'Centro de custo pai inválido.' }, { status: 400 })
    }
    const cc = await prisma.financialCostCenter.create({ data: { tenantId, name: d.name, code: d.code || null, parentId: d.parentId || null, active: d.active } })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinancialCostCenter', entityId: cc.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: cc }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
