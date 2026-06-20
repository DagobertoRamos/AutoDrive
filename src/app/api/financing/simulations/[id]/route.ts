// =============================================================================
// /api/financing/simulations/[id] — detalhe / exclusão de simulação (F&I).
//   GET    : financing (read) — cabeçalho + opções (com nome do banco)
//   DELETE : financing.manage
// Retorno estimado só vai ao cliente quando o papel tem financing.config.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { ownsTenant, num } from '@/lib/finance/finance-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Simulação não encontrada.' }, { status: 404 })

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing')) return forbiddenResponse('Sem acesso ao financiamento.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }
  const canSeeReturn = canAccessModule(user.role, 'financing.config')
  const { id } = await params

  try {
    const sim = await prisma.financeSimulation.findUnique({
      where: { id },
      include: { proponent: { select: { nomeCompleto: true } }, options: { orderBy: { installmentValue: 'asc' } } },
    })
    if (!sim) return notFound()
    if (!ownsTenant(user.role, user.tenantId, sim.tenantId)) return forbiddenResponse('Simulação de outro tenant.')

    const bankIds = [...new Set(sim.options.map((o) => o.bankId).filter(Boolean))] as string[]
    const banks = bankIds.length ? await prisma.financeBank.findMany({ where: { id: { in: bankIds } }, select: { id: true, name: true } }) : []
    const bankMap = Object.fromEntries(banks.map((b) => [b.id, b.name]))

    return NextResponse.json({
      success: true, canSeeReturn,
      data: {
        id: sim.id, vehicle: sim.vehicle, vehicleValue: num(sim.vehicleValue), downPayment: num(sim.downPayment),
        financedAmount: num(sim.financedAmount), installments: sim.installments, notes: sim.notes,
        proponentNome: sim.proponent?.nomeCompleto ?? null, createdAt: sim.createdAt,
        options: sim.options.map((o) => ({
          id: o.id, bankId: o.bankId, bankName: o.bankId ? (bankMap[o.bankId] ?? '—') : '—',
          installments: o.installments, installmentValue: num(o.installmentValue), rate: o.rate == null ? null : num(o.rate),
          estimatedReturn: canSeeReturn ? num(o.estimatedReturn) : null,
        })),
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }
  const { id } = await params
  try {
    const sim = await prisma.financeSimulation.findUnique({ where: { id }, select: { id: true, tenantId: true } })
    if (!sim) return notFound()
    if (!ownsTenant(user.role, user.tenantId, sim.tenantId)) return forbiddenResponse('Simulação de outro tenant.')
    await prisma.financeSimulation.delete({ where: { id } })
    await createSafeAuditLog({ userId: user.id, tenantId: sim.tenantId, action: 'DELETE', entity: 'FinanceSimulation', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
