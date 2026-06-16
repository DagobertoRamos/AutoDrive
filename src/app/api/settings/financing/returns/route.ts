// =============================================================================
// /api/settings/financing/returns — regras de retorno por banco (F&I).
//   GET  : financing.config — lista regras (com nome do banco)
//   POST : financing.config — cria regra (% ou valor fixo, por faixa de parcelas)
// Tenant-scoped, auditado. MASTER não gerencia config da loja.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createReturnRuleSchema } from '@/lib/validators/financing'
import { zodErrorResponse, num } from '@/lib/finance/finance-service'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem acesso às configurações de F&I.')
  if (user.role === 'MASTER' || !user.tenantId) return forbiddenResponse('Retornos são gerenciados pela loja, não pelo MASTER.')

  try {
    const tenantId = user.tenantId
    const rows = await prisma.financeReturnRule.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } })
    const bankIds = [...new Set(rows.map((r) => r.bankId).filter(Boolean))] as string[]
    const banks = bankIds.length ? await prisma.financeBank.findMany({ where: { id: { in: bankIds } }, select: { id: true, name: true } }) : []
    const bankMap = Object.fromEntries(banks.map((b) => [b.id, b.name]))
    return NextResponse.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id, bankId: r.bankId, bankName: r.bankId ? (bankMap[r.bankId] ?? '—') : 'Todos os bancos',
        percent: r.percent == null ? null : num(r.percent), fixedValue: r.fixedValue == null ? null : num(r.fixedValue),
        minInstallments: r.minInstallments, maxInstallments: r.maxInstallments, notes: r.notes, active: r.active,
      })),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem permissão para configurar retornos.')
  if (user.role === 'MASTER' || !user.tenantId) return forbiddenResponse('Retornos são gerenciados pela loja, não pelo MASTER.')

  try {
    const tenantId = user.tenantId
    const d = createReturnRuleSchema.parse(await req.json())
    // Banco (se informado) deve ser da loja.
    if (d.bankId) {
      const ok = await prisma.financeBank.findFirst({ where: { id: d.bankId, tenantId }, select: { id: true } })
      if (!ok) return forbiddenResponse('Banco inválido para esta loja.')
    }
    const rule = await prisma.financeReturnRule.create({
      data: {
        tenantId, bankId: d.bankId ?? null, percent: d.percent ?? null, fixedValue: d.fixedValue ?? null,
        minInstallments: d.minInstallments ?? null, maxInstallments: d.maxInstallments ?? null, notes: d.notes ?? null, active: d.active,
      },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinanceReturnRule', entityId: rule.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: rule.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
