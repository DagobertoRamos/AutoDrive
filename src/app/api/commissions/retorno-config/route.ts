// =============================================================================
// API: /api/commissions/retorno-config — Cadastro GLOBAL de retorno (Parte A)
// GET  → config atual (faixa + ILA% + IOF% + % padrão + ativo)
// PUT  → salva a config. Gate: negotiations.financing (ILA/IOF = financeiro/admin).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { getRetornoConfig, setRetornoConfig } from '@/lib/finance/retorno-config'

export async function GET() {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'negotiations.financing')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }
    if (!session.user.tenantId) return NextResponse.json({ success: false, error: 'Tenant ausente' }, { status: 400 })
    const data = await getRetornoConfig(session.user.tenantId)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'negotiations.financing')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }
    { const gate = await assertModuleEnabled(session.user, 'commissions'); if (gate) return gate }
    if (!session.user.tenantId) return NextResponse.json({ success: false, error: 'Tenant ausente' }, { status: 400 })

    const body = await req.json().catch(() => ({}))
    const num = (v: unknown): number | undefined => {
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    const data = await setRetornoConfig(session.user.tenantId, {
      active: body?.active === true,
      ilaPercent: num(body?.ilaPercent),
      iofPercent: num(body?.iofPercent),
      minReturnPercent: num(body?.minReturnPercent),
      maxReturnPercent: num(body?.maxReturnPercent),
      defaultReturnPercent: body?.defaultReturnPercent == null || body?.defaultReturnPercent === '' ? null : num(body?.defaultReturnPercent),
    })

    await prismaAudit(session.user, data).catch(() => {})
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}

async function prismaAudit(user: { id: string; name?: string | null; role: string; tenantId?: string | null }, data: unknown) {
  const { prisma } = await import('@/lib/prisma')
  await prisma.auditLog.create({
    data: {
      tenantId: user.tenantId ?? null,
      userId: user.id,
      userName: user.name ?? null,
      userRole: user.role,
      action: 'UPDATE',
      entity: 'RetornoConfig',
      entityId: null,
      status: 'SUCCESS',
      afterData: data as never,
    },
  })
}
