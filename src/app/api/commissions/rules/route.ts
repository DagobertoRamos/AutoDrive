// =============================================================================
// API: /api/commissions/rules — Regras de comissionamento
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import {
  CommissionRuleValidationError,
  validateCommissionRulePayload,
} from '@/lib/commission/rule-validation'
import { validateCommissionRuleReferences } from '@/lib/commission/rule-scope'

// ── GET — Listar regras ───────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    { const gate = await assertModuleEnabled(session.user, 'commissions'); if (gate) return gate }

    const rules = await prisma.commissionRule.findMany({
      where:   { tenantId: session.user.tenantId ?? undefined },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: {
        unit:    { select: { id: true, name: true } },
        seller:  { select: { user: { select: { name: true } } } },
        manager: { select: { id: true, fullName: true, user: { select: { name: true } } } },
        service: { select: { name: true } },
        warranty:{ select: { name: true } },
        position:{ select: { id: true, name: true, slug: true, baseRole: true } },
      },
    })

    return NextResponse.json({ success: true, data: rules })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST — Criar regra ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions.rules')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    { const gate = await assertModuleEnabled(session.user, 'commissions.rules'); if (gate) return gate }

    const data = validateCommissionRulePayload(await req.json())
    const tenantId = session.user.tenantId ?? null
    const referenceError = await validateCommissionRuleReferences(data, tenantId)
    if (referenceError) return NextResponse.json({ success: false, error: referenceError }, { status: 400 })

    const rule = await prisma.commissionRule.create({
      data: {
        tenantId,
        ...data,
      } as any,
    })

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId ?? null,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'CREATE',
        entity:   'CommissionRule',
        entityId: rule.id,
        status:   'SUCCESS',
        afterData: { name: data.name, ruleType: data.ruleType, commissionType: data.commissionType } as never,
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: rule }, { status: 201 })
  } catch (err) {
    if (err instanceof CommissionRuleValidationError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    }
    return handlePrismaError(err)
  }
}
