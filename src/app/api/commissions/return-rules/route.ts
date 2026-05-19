// =============================================================================
// API: /api/commissions/return-rules — AutoDrive
// Regras de percentual de retorno
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })

    const rules = await prisma.returnPercentRule.findMany({
      orderBy: { percentualInformado: 'asc' },
    })

    return NextResponse.json({ success: true, data: rules })
  } catch (err) {
    console.error('[GET /api/commissions/return-rules]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
