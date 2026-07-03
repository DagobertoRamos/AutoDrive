// =============================================================================
// POST /api/commissions/manual — lançamento MANUAL de comissão (crédito/débito).
// Gate: commissions.adjust (MASTER/ADM). Cria um CommissionCalculation avulso
// (ruleType EXCECAO, escopo MANUAL_ADJUSTMENT) vinculado ao colaborador+período,
// com valor + (crédito) ou − (débito), descrição e motivo. Entra no extrato.
// Ex.: adicionar uma garantia que faltou (crédito) ou descontar um custo (débito).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'commissions.adjust')) return forbiddenResponse('Sem permissão para ajustar comissões.')
  { const gate = await assertModuleEnabled(user, 'commissions'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const b = await req.json().catch(() => ({}))
    const collaborator = String(b?.collaborator ?? '') // "s:<id>" | "m:<id>" | "u:<id>"
    const period = String(b?.period ?? '').trim()
    const kind = String(b?.kind ?? '').toUpperCase() // CREDITO | DEBITO
    const value = Math.abs(Number(b?.value))
    const description = String(b?.description ?? '').trim()
    const reason = String(b?.reason ?? '').trim()

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return NextResponse.json({ success: false, error: 'Período inválido (AAAA-MM).' }, { status: 400 })
    if (!['CREDITO', 'DEBITO'].includes(kind)) return NextResponse.json({ success: false, error: 'Tipo inválido (crédito/débito).' }, { status: 400 })
    if (!Number.isFinite(value) || value <= 0) return NextResponse.json({ success: false, error: 'Informe um valor maior que zero.' }, { status: 400 })
    if (description.length < 2) return NextResponse.json({ success: false, error: 'Informe uma descrição.' }, { status: 400 })

    const [prefix, refId] = collaborator.split(':')
    if (!refId || !['s', 'm', 'u'].includes(prefix)) return NextResponse.json({ success: false, error: 'Colaborador inválido.' }, { status: 400 })

    // Resolve a unidade + valida que o colaborador é do tenant.
    let sellerId: string | null = null, managerId: string | null = null, employeeUserId: string | null = null, unitId: string | null = null
    if (prefix === 's') {
      const s = await prisma.seller.findUnique({ where: { id: refId }, select: { unitId: true, unit: { select: { tenantId: true } }, userId: true } })
      if (!s || s.unit?.tenantId !== tenantId) return NextResponse.json({ success: false, error: 'Vendedor inválido para esta loja.' }, { status: 400 })
      sellerId = refId; unitId = s.unitId; employeeUserId = s.userId
    } else if (prefix === 'm') {
      const m = await prisma.manager.findUnique({ where: { id: refId }, select: { unitId: true, unit: { select: { tenantId: true } }, userId: true } })
      if (!m || m.unit?.tenantId !== tenantId) return NextResponse.json({ success: false, error: 'Gerente inválido para esta loja.' }, { status: 400 })
      managerId = refId; unitId = m.unitId; employeeUserId = m.userId
    } else {
      const u = await prisma.user.findUnique({ where: { id: refId }, select: { tenantId: true, unitId: true } })
      if (!u || u.tenantId !== tenantId) return NextResponse.json({ success: false, error: 'Colaborador inválido para esta loja.' }, { status: 400 })
      employeeUserId = refId; unitId = u.unitId
    }

    const signed = kind === 'DEBITO' ? -value : value
    const item = await prisma.commissionCalculation.create({
      data: {
        tenantId, sellerId, managerId, unitId, period,
        ruleType: 'EXCECAO', description: `${kind === 'CREDITO' ? 'Crédito' : 'Débito'} manual — ${description}`,
        baseValue: 0, commissionValue: signed, status: 'PREVISTO',
        ruleDetails: {
          commissionScope: 'MANUAL_ADJUSTMENT', manualKind: kind, reason: reason || null,
          employeeUserId, createdBy: user.id, createdByName: user.name, createdAt: new Date().toISOString(),
        } as never,
      },
      select: { id: true },
    })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'COMMISSION_MANUAL', entity: 'CommissionCalculation', entityId: item.id, userName: user.name, userRole: user.role, afterData: { kind, value: signed, description, reason } as never })
    return NextResponse.json({ success: true, data: { id: item.id } }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
