// =============================================================================
// API: /api/commissions/settings — comportamento do motor de comissões
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { prisma } from '@/lib/prisma'
import {
  getCommissionBehaviorSettings,
  setCommissionBehaviorSettings,
} from '@/lib/commission/settings'

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions.rules')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }
    { const gate = await assertModuleEnabled(session.user, 'commissions.rules'); if (gate) return gate }

    const tenantId = session.user.tenantId
    if (!tenantId) return NextResponse.json({ success: false, error: 'Tenant não identificado.' }, { status: 400 })

    const data = await getCommissionBehaviorSettings(tenantId)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[GET /api/commissions/settings]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions.rules')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }
    { const gate = await assertModuleEnabled(session.user, 'commissions.rules'); if (gate) return gate }

    const tenantId = session.user.tenantId
    if (!tenantId) return NextResponse.json({ success: false, error: 'Tenant não identificado.' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const data = await setCommissionBehaviorSettings(tenantId, {
      managerReceivesOnOwnSale: body?.managerReceivesOnOwnSale === true,
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId:    session.user.id,
        userName:  session.user.name,
        userRole:  session.user.role,
        action:    'UPDATE',
        entity:    'CommissionSettings',
        entityId:  tenantId,
        status:    'SUCCESS',
        afterData: data as never,
      },
    }).catch(() => {})

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[PUT /api/commissions/settings]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
