// =============================================================================
// API: /api/commissions/garantia-config — comissão de GARANTIA (por produto)
// GET → config atual (produtos + valores gerente/vendedor + loja-paga + default).
// PUT → salva. Gate: commissions.rules (gestão de comissão).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { getGarantiaConfig, setGarantiaConfig, coerceGarantiaConfig } from '@/lib/finance/garantia-config'

export async function GET() {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions.rules')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    if (!session.user.tenantId) return NextResponse.json({ success: false, error: 'Tenant ausente' }, { status: 400 })
    return NextResponse.json({ success: true, data: await getGarantiaConfig(session.user.tenantId) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions.rules')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    { const gate = await assertModuleEnabled(session.user, 'commissions'); if (gate) return gate }
    if (!session.user.tenantId) return NextResponse.json({ success: false, error: 'Tenant ausente' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const next = coerceGarantiaConfig(body)
    const data = await setGarantiaConfig(session.user.tenantId, next)
    const { prisma } = await import('@/lib/prisma')
    await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, userName: session.user.name, userRole: session.user.role, action: 'UPDATE', entity: 'GarantiaConfig', entityId: null, status: 'SUCCESS', afterData: data as never } }).catch(() => {})
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
