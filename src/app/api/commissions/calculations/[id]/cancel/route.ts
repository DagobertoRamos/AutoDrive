// =============================================================================
// POST /api/commissions/calculations/:id/cancel — cancela UM lançamento de
// comissão com um MOTIVO (ex.: garantia cortesia que não deve pagar).
// Gate: commissions.adjust (MASTER/ADM). Não apaga — marca CANCELADO + motivo,
// para ficar riscado/registrado no extrato. Não mexe em PAGO. Auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { ownsTenant } from '@/lib/finance/finance-service'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'commissions.adjust')) return forbiddenResponse('Sem permissão para ajustar comissões.')
  { const gate = await assertModuleEnabled(user, 'commissions'); if (gate) return gate }
  const { id } = await params
  try {
    const body = await req.json().catch(() => ({}))
    const reason = String(body?.reason ?? '').trim()
    if (reason.length < 2) return NextResponse.json({ success: false, error: 'Informe o motivo do cancelamento.' }, { status: 400 })

    const calc = await prisma.commissionCalculation.findUnique({ where: { id }, select: { id: true, tenantId: true, status: true, ruleDetails: true } })
    if (!calc) return NextResponse.json({ success: false, error: 'Lançamento não encontrado.' }, { status: 404 })
    if (!ownsTenant(user.role, user.tenantId, calc.tenantId)) return forbiddenResponse('Lançamento de outra loja.')
    if (calc.status === 'PAGO') return NextResponse.json({ success: false, error: 'Não é possível cancelar uma comissão já paga.' }, { status: 409 })
    if (calc.status === 'CANCELADO') return NextResponse.json({ success: false, error: 'Este lançamento já está cancelado.' }, { status: 409 })

    const rd = (calc.ruleDetails && typeof calc.ruleDetails === 'object' && !Array.isArray(calc.ruleDetails)) ? { ...(calc.ruleDetails as Record<string, unknown>) } : {}
    await prisma.commissionCalculation.update({
      where: { id },
      data: { status: 'CANCELADO', ruleDetails: { ...rd, cancelReason: reason, cancelledBy: user.id, cancelledByName: user.name, cancelledAt: new Date().toISOString() } as never },
    })
    await createSafeAuditLog({ userId: user.id, tenantId: calc.tenantId, action: 'COMMISSION_CANCEL_MANUAL', entity: 'CommissionCalculation', entityId: id, userName: user.name, userRole: user.role, afterData: { reason } as never })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
