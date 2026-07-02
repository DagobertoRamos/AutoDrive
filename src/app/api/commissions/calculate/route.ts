// =============================================================================
// API: /api/commissions/calculate — Cálculo de comissões
//
// Recebe uma lista de itens (cada item descreve um valor a comissionar e o
// "employee" responsável). Para cada item, resolve a CommissionRule aplicável
// usando o matcher central (`findCommissionRule`) e devolve o valor calculado.
//
// Não persiste em CommissionCalculation aqui — esta rota é de cálculo/preview.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { findCommissionRule, computeCommissionValue, type EmployeeKind } from '@/lib/commission-matcher'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

interface CalculateItem {
  ruleType:     string
  employeeKind: EmployeeKind
  employeeId:   string
  baseValue:    number
  unitId?:      string | null
  serviceId?:   string | null
  warrantyId?:  string | null
  bank?:        string | null
  quantityInPeriod?: number | null
  commissionKind?: 'REGULAR' | 'BONUS' | 'ALL'
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }
    if (!canAccessModule(session.user.role, 'commissions.calculate')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }
    { const gate = await assertModuleEnabled(session.user, 'commissions.calculate'); if (gate) return gate }

    const tenantId = session.user.tenantId ?? null
    const body = await req.json().catch(() => ({}))
    const items: CalculateItem[] = Array.isArray(body?.items) ? body.items : []

    if (items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Informe ao menos um item para calcular.' },
        { status: 400 },
      )
    }

    const results = await Promise.all(items.map(async (item) => {
      // Carrega o "employee" para obter positionId + role
      let positionId: string | null = null
      let role: import('@prisma/client').UserRole | null = null

      if (item.employeeKind === 'SELLER') {
        const s = await prisma.seller.findUnique({
          where:  { id: item.employeeId },
          select: { positionId: true, user: { select: { role: true } } },
        })
        positionId = s?.positionId ?? null
        role = s?.user?.role ?? null
      } else if (item.employeeKind === 'MANAGER') {
        const m = await prisma.manager.findUnique({
          where:  { id: item.employeeId },
          select: { positionId: true, user: { select: { role: true } } },
        })
        positionId = m?.positionId ?? null
        role = m?.user?.role ?? null
      } else {
        const u = await prisma.user.findUnique({
          where:  { id: item.employeeId },
          select: { positionId: true, role: true },
        })
        positionId = u?.positionId ?? null
        role = u?.role ?? null
      }

      const matched = await findCommissionRule({
        tenantId,
        ruleType: item.ruleType,
        employee: {
          kind:       item.employeeKind,
          id:         item.employeeId,
          positionId,
          role,
        },
        unitId:     item.unitId     ?? null,
        serviceId:  item.serviceId  ?? null,
        warrantyId: item.warrantyId ?? null,
        bank:       item.bank       ?? null,
        baseValue:  Number(item.baseValue ?? 0),
        quantityInPeriod: item.quantityInPeriod != null ? Number(item.quantityInPeriod) : undefined,
        commissionKind: item.commissionKind ?? 'ALL',
      })

      const commissionValue = matched
        ? computeCommissionValue(matched.rule, Number(item.baseValue ?? 0))
        : 0

      return {
        ...item,
        matched: matched
          ? {
              ruleId:          matched.rule.id,
              ruleName:        matched.rule.name,
              matchedBy:       matched.matchedBy,
              commissionValue,
            }
          : null,
      }
    }))

    return NextResponse.json({ success: true, items: results })
  } catch (err) {
    console.error('[POST /api/commissions/calculate]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
