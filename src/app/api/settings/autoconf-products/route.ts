import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'settings.commission')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    const tid = session.user.tenantId
    if (!tid) return NextResponse.json({ success: false, error: 'Tenant não identificado' }, { status: 400 })

    const items = await prisma.autoconfProductMap.findMany({
      where: { tenantId: tid },
      orderBy: [{ canonicalCategory: 'asc' }, { externalLabel: 'asc' }],
    })
    return NextResponse.json({ success: true, data: items })
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Erro interno' }, { status: 500 })
  }
}
