// =============================================================================
// API: /api/commissions/rules — AutoDrive
// Regras base de comissionamento
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })

    // TODO: implementar model CommissionRule no schema e buscar do banco
    return NextResponse.json({ success: true, data: [] })
  } catch (err) {
    console.error('[GET /api/commissions/rules]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
