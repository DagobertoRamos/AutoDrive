import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'

const VALID_CATEGORIES = ['WARRANTY', 'DOCUMENTATION', 'FINANCING_PAYOFF', 'INSPECTION', 'LICENSING', 'TAX', 'FINE', 'ACCESSORY', 'SERVICE', 'OTHER']

export async function PATCH(req: NextRequest, ctxArg: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'settings.commission')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    const tid = session.user.tenantId
    if (!tid) return NextResponse.json({ success: false, error: 'Tenant não identificado' }, { status: 400 })

    const { id } = await Promise.resolve(ctxArg.params)
    const existing = await prisma.autoconfProductMap.findUnique({ where: { id } })
    if (!existing || existing.tenantId !== tid) return NextResponse.json({ success: false, error: 'Não encontrado' }, { status: 404 })

    const body = await req.json()
    const updates: Record<string, unknown> = {}

    if (typeof body.canonicalCategory === 'string' && VALID_CATEGORIES.includes(body.canonicalCategory)) {
      updates.canonicalCategory = body.canonicalCategory
    }
    if (typeof body.active === 'boolean') {
      updates.active = body.active
    }
    if (body.canonicalCategory || body.active !== undefined) {
      updates.autoMapped = false
    }

    if (!Object.keys(updates).length) return NextResponse.json({ success: false, error: 'Nenhum campo válido' }, { status: 400 })

    const updated = await prisma.autoconfProductMap.update({ where: { id }, data: updates })
    return NextResponse.json({ success: true, data: updated })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Erro interno' }, { status: 500 })
  }
}
