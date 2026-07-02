// =============================================================================
// API: /api/commissions/rules/[id] — Editar e excluir regra de comissão
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

// ── PUT — Editar ──────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions.rules')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    { const gate = await assertModuleEnabled(session.user, 'commissions.rules'); if (gate) return gate }

    const rule = await prisma.commissionRule.findUnique({ where: { id: params.id } })
    if (!rule) return NextResponse.json({ success: false, error: 'Regra não encontrada.' }, { status: 404 })

    if (session.user.tenantId && rule.tenantId !== session.user.tenantId) {
      return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
    }

    const data = validateCommissionRulePayload(await req.json())
    const referenceError = await validateCommissionRuleReferences(data, session.user.tenantId ?? null)
    if (referenceError) return NextResponse.json({ success: false, error: referenceError }, { status: 400 })

    const updated = await prisma.commissionRule.update({
      where: { id: params.id },
      data: {
        ...data,
      } as any,
    })

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId ?? null,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'UPDATE',
        entity:   'CommissionRule',
        entityId: params.id,
        status:   'SUCCESS',
        beforeData: { name: rule.name, ruleType: rule.ruleType, commissionType: rule.commissionType } as never,
        afterData:  { name: data.name, ruleType: data.ruleType, commissionType: data.commissionType } as never,
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    if (err instanceof CommissionRuleValidationError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    }
    return handlePrismaError(err)
  }
}

// ── DELETE — Excluir ──────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions.rules')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    { const gate = await assertModuleEnabled(session.user, 'commissions.rules'); if (gate) return gate }

    const rule = await prisma.commissionRule.findUnique({ where: { id: params.id } })
    if (!rule) return NextResponse.json({ success: false, error: 'Regra não encontrada.' }, { status: 404 })

    if (session.user.tenantId && rule.tenantId !== session.user.tenantId) {
      return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
    }

    const linkedCalculations = await prisma.commissionCalculation.count({
      where: { ruleId: params.id },
    })

    if (linkedCalculations > 0) {
      await prisma.commissionRule.update({
        where: { id: params.id },
        data:  { active: false },
      })

      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId ?? null,
          userId:   session.user.id,
          userName: session.user.name,
          userRole: session.user.role,
          action:   'DEACTIVATE',
          entity:   'CommissionRule',
          entityId: params.id,
          status:   'SUCCESS',
          afterData: { reason: 'Regra preservada por possuir comissões calculadas.', linkedCalculations } as never,
        },
      }).catch(() => {})

      return NextResponse.json({
        success: true,
        deactivated: true,
        message: 'A regra já tinha histórico de comissão e foi inativada.',
      })
    }

    await prisma.commissionRule.delete({ where: { id: params.id } })

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId ?? null,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'DELETE',
        entity:   'CommissionRule',
        entityId: params.id,
        status:   'SUCCESS',
      },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
