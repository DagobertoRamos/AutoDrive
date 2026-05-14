// =============================================================================
// API: /api/commissions/calculate — AutoDrive
// Simula o cálculo de comissões para um período
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'commissions.calculate')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })

    const { period, unitId } = await req.json()
    if (!period) return NextResponse.json({ success: false, error: 'Período obrigatório.' }, { status: 400 })

    // Busca vendedores ativos
    const where: Record<string, unknown> = { active: true }
    if (unitId) where.unitId = unitId

    const sellers = await prisma.seller.findMany({
      where:  where as any,
      select: { id: true, fullName: true, shortName: true },
    })

    // Cálculo simplificado (placeholder)
    // Numa implementação real, buscaria as vendas do período e aplicaria as regras
    const results = sellers.map((s) => ({
      sellerId:   s.id,
      sellerName: s.shortName ?? s.fullName,
      period,
      baseValue:    0,
      adjustments:  0,
      finalValue:   0,
    }))

    return NextResponse.json({ success: true, data: results })
  } catch (err) {
    console.error('[POST /api/commissions/calculate]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
