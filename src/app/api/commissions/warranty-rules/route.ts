// =============================================================================
// API: /api/commissions/warranty-rules — AutoDrive
// Regras de desconto por garantias acionadas
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule, canPerformAction } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canPerformAction(session.user.role, 'commissions.rules', 'create')) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ success: false, error: 'Corpo inválido' }, { status: 400 })

    const name               = String(body.name ?? '').trim()
    const warrantyId         = body.warrantyId ? String(body.warrantyId) : ''
    const defaultValue       = Number(body.defaultValue ?? 0)
    const minValue           = Number(body.minValue ?? 0)
    const commissionDefault  = Number(body.commissionDefault ?? 0)
    const commissionDiscount = Number(body.commissionDiscount ?? 0)
    const commissionType     = body.commissionType ? String(body.commissionType) : 'PERCENTUAL'

    if (!name) {
      return NextResponse.json({ success: false, error: 'Nome obrigatório.' }, { status: 400 })
    }
    if (!warrantyId) {
      return NextResponse.json({ success: false, error: 'Garantia obrigatória.' }, { status: 400 })
    }

    const rule = await prisma.warrantyRule.create({
      data: {
        tenantId: session.user.tenantId ?? null,
        warrantyId,
        name,
        defaultValue,
        minValue,
        commissionDefault,
        commissionDiscount,
        commissionType,
        active: true,
      },
    })

    return NextResponse.json({ success: true, data: rule }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/commissions/warranty-rules]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })

    const rules = await prisma.warrantyRule.findMany({
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({ success: true, data: rules })
  } catch (err) {
    console.error('[GET /api/commissions/warranty-rules]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
