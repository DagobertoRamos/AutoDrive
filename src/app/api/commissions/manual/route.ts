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
    const kind = String(b?.kind ?? '').toUpperCase() // CREDITO | DEBITO | VALE | DESCONTO_FOLHA
    const value = Math.abs(Number(b?.value))
    const description = String(b?.description ?? '').trim()
    const reason = String(b?.reason ?? '').trim()

    // Cada tipo: rótulo + sinal no extrato (crédito soma; os demais descontam do
    // que o colaborador recebe). O Financeiro espelha esse valor com sinal.
    const KINDS: Record<string, { label: string; sign: 1 | -1 }> = {
      CREDITO:        { label: 'Crédito',            sign: 1 },
      DEBITO:         { label: 'Débito',             sign: -1 },
      VALE:           { label: 'Vale/Adiantamento',  sign: -1 },
      DESCONTO_FOLHA: { label: 'Desconto em folha',  sign: -1 },
    }
    const meta = KINDS[kind]

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return NextResponse.json({ success: false, error: 'Período inválido (AAAA-MM).' }, { status: 400 })
    if (!meta) return NextResponse.json({ success: false, error: 'Tipo inválido (crédito/débito/vale/desconto).' }, { status: 400 })
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

    const signed = meta.sign * value
    const fullDesc = `${meta.label} — ${description}`
    const item = await prisma.commissionCalculation.create({
      data: {
        tenantId, sellerId, managerId, unitId, period,
        ruleType: 'EXCECAO', description: fullDesc,
        baseValue: 0, commissionValue: signed, status: 'PREVISTO',
        ruleDetails: {
          commissionScope: 'MANUAL_ADJUSTMENT', manualKind: kind, reason: reason || null,
          employeeUserId, createdBy: user.id, createdByName: user.name, createdAt: new Date().toISOString(),
        } as never,
      },
      select: { id: true },
    })

    // Espelha no FINANCEIRO (contas/DRE) — DESPESA de folha, idempotente por
    // commissionCalculationId (mesma convenção do finance-sync). Não bloqueia o
    // lançamento se falhar.
    try {
      const cat = await prisma.financialCategory.findFirst({ where: { tenantId, name: 'Comissões', kind: 'DESPESA' }, select: { id: true } })
        ?? await prisma.financialCategory.create({ data: { tenantId, name: 'Comissões', kind: 'DESPESA' }, select: { id: true } })
      await prisma.financialEntry.create({
        data: {
          tenantId, unitId, sellerId, commissionCalculationId: item.id, source: 'COMISSAO',
          type: 'DESPESA', status: 'PREVISTO', description: `RH · ${fullDesc}`,
          amount: signed, categoryId: cat.id,
          competenceDate: new Date(), dueDate: new Date(),
          createdById: user.id,
        },
      })
    } catch { /* financeiro é best-effort; o extrato já foi lançado */ }

    await createSafeAuditLog({ userId: user.id, tenantId, action: 'COMMISSION_MANUAL', entity: 'CommissionCalculation', entityId: item.id, userName: user.name, userRole: user.role, afterData: { kind, value: signed, description, reason } as never })
    return NextResponse.json({ success: true, data: { id: item.id } }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
