// =============================================================================
// /api/financing/simulations — simulação comparativa de F&I. Multi-tenant.
//   GET  : financing (read) — lista simulações (resumo)
//   POST : financing.manage — cria simulação + opções (parcela via Price;
//          retorno estimado pelas regras de retorno da loja)
// O retorno estimado (margem) só é exposto a quem tem financing.config.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createSimulationSchema } from '@/lib/validators/financing'
import { zodErrorResponse, num } from '@/lib/finance/finance-service'
import { financedAmount, computeOption, type ReturnRuleLike } from '@/lib/finance/simulation-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing')) return forbiddenResponse('Sem acesso ao financiamento.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }
  const canSeeReturn = canAccessModule(user.role, 'financing.config')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const sims = await prisma.financeSimulation.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { proponent: { select: { nomeCompleto: true } }, options: { select: { installmentValue: true, estimatedReturn: true } } },
    })
    const data = sims.map((s) => {
      const installments = s.options.map((o) => num(o.installmentValue)).filter((v) => v > 0)
      const returns = s.options.map((o) => num(o.estimatedReturn))
      return {
        id: s.id, vehicle: s.vehicle, vehicleValue: num(s.vehicleValue), downPayment: num(s.downPayment),
        financedAmount: num(s.financedAmount), installmentsCount: s.installments, optionsCount: s.options.length,
        proponentNome: s.proponent?.nomeCompleto ?? null, createdAt: s.createdAt,
        bestInstallment: installments.length ? Math.min(...installments) : null,
        bestReturn: canSeeReturn && returns.length ? Math.max(...returns) : null,
      }
    })
    return NextResponse.json({ success: true, data, canSeeReturn })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.manage')) return forbiddenResponse('Sem permissão para simular.')
  { const gate = await assertModuleEnabled(user, 'financing'); if (gate) return gate }
  const tid = await resolveActingTenant(user, req)
  if (!tid) return forbiddenResponse(actingTenantError(user))

  try {
    const tenantId = tid
    const d = createSimulationSchema.parse(await req.json())

    // Só bancos da loja entram na simulação.
    const bankIds = [...new Set(d.options.map((o) => o.bankId))]
    const banks = await prisma.financeBank.findMany({ where: { tenantId, id: { in: bankIds } }, select: { id: true } })
    const ownedBanks = new Set(banks.map((b) => b.id))
    const options = d.options.filter((o) => ownedBanks.has(o.bankId))
    if (options.length === 0) return forbiddenResponse('Nenhum banco válido para esta loja.')

    // Regras de retorno da loja (para o retorno estimado).
    const rulesRaw = await prisma.financeReturnRule.findMany({ where: { tenantId } })
    const rules: ReturnRuleLike[] = rulesRaw.map((r) => ({
      bankId: r.bankId, percent: r.percent == null ? null : num(r.percent), fixedValue: r.fixedValue == null ? null : num(r.fixedValue),
      minInstallments: r.minInstallments, maxInstallments: r.maxInstallments, active: r.active,
    }))

    const financed = financedAmount(d.vehicleValue ?? 0, d.downPayment ?? 0)
    const computed = options.map((o) => computeOption(financed, d.installments, { bankId: o.bankId, rate: o.rate ?? null }, rules))

    const sim = await prisma.financeSimulation.create({
      data: {
        tenantId, proponentId: d.proponentId ?? null, vehicle: d.vehicle ?? null,
        vehicleValue: d.vehicleValue ?? null, downPayment: d.downPayment ?? null, financedAmount: financed,
        installments: d.installments, notes: d.notes ?? null, createdById: user.id,
        options: { create: computed.map((c) => ({ bankId: c.bankId, installments: c.installments, installmentValue: c.installmentValue, rate: c.rate, estimatedReturn: c.estimatedReturn })) },
      },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinanceSimulation', entityId: sim.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: sim.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
