// =============================================================================
// API: /api/customers — AutoDrive
// Listagem e criação de clientes
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'registrations')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const page    = Math.max(1, Number(searchParams.get('page')    ?? 1))
    const perPage = Math.min(100, Number(searchParams.get('perPage') ?? 50))
    const search  = searchParams.get('search') || undefined

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { cpf:   { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ]
    }

    const [total, data] = await Promise.all([
      prisma.customer.count({ where: where as any }),
      prisma.customer.findMany({
        where:   where as any,
        orderBy: { name: 'asc' },
        skip:    (page - 1) * perPage,
        take:    perPage,
      }),
    ])

    return NextResponse.json({
      success: true,
      data,
      meta: { total, page, perPage, totalPages: Math.ceil(total / perPage) },
    })
  } catch (err) {
    console.error('[GET /api/customers]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
