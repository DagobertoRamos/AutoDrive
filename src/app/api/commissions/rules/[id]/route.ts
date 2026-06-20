// =============================================================================
// API: /api/commissions/rules/[id] — Editar e excluir regra de comissão
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'

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

    const body = await req.json()
    const {
      name, description, ruleType, commissionType,
      role, positionId, sellerId, managerId, unitId, serviceId, warrantyId, bank,
      fromQuantity, toQuantity, fromValue, toValue,
      fixedValue, percentage, priority, active,
      validFrom, validUntil, notes,
    } = body

    if (!name?.trim())   return NextResponse.json({ success: false, error: 'Nome é obrigatório.' }, { status: 400 })
    if (!ruleType)       return NextResponse.json({ success: false, error: 'Tipo da regra é obrigatório.' }, { status: 400 })

    const updated = await prisma.commissionRule.update({
      where: { id: params.id },
      data: {
        name:           name.trim(),
        description:    description?.trim() || null,
        ruleType,
        commissionType: commissionType ?? rule.commissionType,
        role:           role           || null,
        positionId:     positionId     || null,
        sellerId:       sellerId       || null,
        managerId:      managerId      || null,
        unitId:         unitId         || null,
        serviceId:      serviceId      || null,
        warrantyId:     warrantyId     || null,
        bank:           bank           || null,
        fromQuantity:   fromQuantity != null ? Number(fromQuantity) : null,
        toQuantity:     toQuantity   != null ? Number(toQuantity)   : null,
        fromValue:      fromValue    != null ? Number(fromValue)    : null,
        toValue:        toValue      != null ? Number(toValue)      : null,
        fixedValue:     fixedValue   != null ? Number(fixedValue)   : null,
        percentage:     percentage   != null ? Number(percentage)   : null,
        priority:       priority     != null ? Number(priority)     : rule.priority,
        active:         active !== false,
        validFrom:      validFrom  ? new Date(validFrom)  : null,
        validUntil:     validUntil ? new Date(validUntil) : null,
        notes:          notes?.trim() || null,
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
        afterData: { name, ruleType } as never,
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
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
