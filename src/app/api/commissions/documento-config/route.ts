// =============================================================================
// API: /api/commissions/documento-config — comissão de DOCUMENTAÇÃO (tiered)
// GET → config atual (faixas + valores gerente/vendedor + loja-paga).
// PUT → salva. Gate: commissions.rules (gestão de comissão).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { getDocumentoConfig, setDocumentoConfig, coerceDocumentoConfig } from '@/lib/finance/documento-config'

export async function GET() {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions.rules')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    if (!session.user.tenantId) return NextResponse.json({ success: false, error: 'Tenant ausente' }, { status: 400 })
    return NextResponse.json({ success: true, data: await getDocumentoConfig(session.user.tenantId) })
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
    const next = coerceDocumentoConfig(body)
    const data = await setDocumentoConfig(session.user.tenantId, next)
    const { prisma } = await import('@/lib/prisma')
    await prisma.auditLog.create({ data: { tenantId: session.user.tenantId, userId: session.user.id, userName: session.user.name, userRole: session.user.role, action: 'UPDATE', entity: 'DocumentoConfig', entityId: null, status: 'SUCCESS', afterData: data as never } }).catch(() => {})
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
