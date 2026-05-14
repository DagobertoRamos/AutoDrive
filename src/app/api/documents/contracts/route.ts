// =============================================================================
// API: /api/documents/contracts — AutoDrive
// Listagem de contratos importados
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'documents')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const page    = Math.max(1, Number(searchParams.get('page')    ?? 1))
    const perPage = Math.min(100, Number(searchParams.get('perPage') ?? 50))
    const search  = searchParams.get('search') || undefined

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { number:   { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { vehicle:  { plate: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [total, data] = await Promise.all([
      prisma.contract.count({ where: where as any }),
      prisma.contract.findMany({
        where:   where as any,
        include: {
          customer: { select: { name: true } },
          vehicle:  { select: { plate: true, brand: true, model: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * perPage,
        take:    perPage,
      }),
    ])

    // Map to the format the page expects
    const mapped = data.map((c) => ({
      id:             c.id,
      contractNumber: c.number,
      customerName:   c.customer?.name ?? 'Desconhecido',
      plate:          c.vehicle?.plate ?? null,
      vehicle:        c.vehicle ? `${c.vehicle.brand ?? ''} ${c.vehicle.model ?? ''}`.trim() : null,
      value:          c.saleValue,
      contractDate:   c.saleDate,
      type:           c.type,
      status:         c.status ?? 'ATIVO',
      createdAt:      c.createdAt,
    }))

    return NextResponse.json({
      success: true,
      data:    mapped,
      meta: { total, page, perPage, totalPages: Math.ceil(total / perPage) },
    })
  } catch (err) {
    console.error('[GET /api/documents/contracts]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(session.user.role, 'documents.pdf')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })

    const body = await req.json()

    // TODO: match customer and vehicle by name/plate if they exist
    const contract = await prisma.contract.create({
      data: {
        number:  body.contractNumber ?? null,
        type:    'VENDA',
        status:  'ATIVO',
        rawData: body,
      },
    })

    return NextResponse.json({ success: true, data: contract }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/documents/contracts]', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
