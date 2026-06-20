// =============================================================================
// API: /api/commissions/return-rules — AutoDrive
// Regras de percentual de retorno
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule, canPerformAction } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canPerformAction(session.user.role, 'commissions.rules', 'create')) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ success: false, error: 'Corpo inválido' }, { status: 400 })

    const name = String(body.name ?? '').trim()
    const percentualInformado = Number(body.percentualInformado)
    const percentualAplicado  = Number(body.percentualAplicado)
    const bank        = body.bank        ? String(body.bank).trim()        : null
    const tipoRetorno = body.tipoRetorno ? String(body.tipoRetorno).trim() : null

    if (!name) {
      return NextResponse.json({ success: false, error: 'Nome obrigatório.' }, { status: 400 })
    }
    if (!Number.isFinite(percentualInformado) || !Number.isFinite(percentualAplicado)) {
      return NextResponse.json({ success: false, error: 'Percentuais inválidos.' }, { status: 400 })
    }

    const rule = await prisma.returnPercentRule.create({
      data: {
        tenantId: session.user.tenantId ?? null,
        name,
        percentualInformado,
        percentualAplicado,
        bank,
        tipoRetorno,
        active: true,
      },
    })

    return NextResponse.json({ success: true, data: rule }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/commissions/return-rules]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    { const gate = await assertModuleEnabled(session.user, 'commissions'); if (gate) return gate }

    const rules = await prisma.returnPercentRule.findMany({
      orderBy: { percentualInformado: 'asc' },
    })

    return NextResponse.json({ success: true, data: rules })
  } catch (err) {
    console.error('[GET /api/commissions/return-rules]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
