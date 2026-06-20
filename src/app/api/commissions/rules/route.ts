// =============================================================================
// API: /api/commissions/rules — Regras de comissionamento
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'

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
        unit:    { select: { name: true } },
        seller:  { select: { user: { select: { name: true } } } },
        service: { select: { name: true } },
        warranty:{ select: { name: true } },
        position:{ select: { id: true, name: true, slug: true } },
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

    const body = await req.json()
    const {
      name, description, ruleType, commissionType,
      role, positionId, sellerId, managerId, unitId, serviceId, warrantyId, bank,
      fromQuantity, toQuantity, fromValue, toValue,
      fixedValue, percentage, priority, active,
      validFrom, validUntil, notes,
    } = body

    if (!name?.trim())    return NextResponse.json({ success: false, error: 'Nome é obrigatório.' }, { status: 400 })
    if (!ruleType)        return NextResponse.json({ success: false, error: 'Tipo da regra é obrigatório.' }, { status: 400 })
    if (!commissionType)  return NextResponse.json({ success: false, error: 'Tipo de comissão é obrigatório.' }, { status: 400 })

    const rule = await prisma.commissionRule.create({
      data: {
        tenantId:       session.user.tenantId ?? null,
        name:           name.trim(),
        description:    description?.trim() || null,
        ruleType,
        commissionType: commissionType ?? 'PERCENTUAL',
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
        priority:       priority     != null ? Number(priority)     : 0,
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
        action:   'CREATE',
        entity:   'CommissionRule',
        entityId: rule.id,
        status:   'SUCCESS',
        afterData: { name, ruleType } as never,
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data: rule }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
