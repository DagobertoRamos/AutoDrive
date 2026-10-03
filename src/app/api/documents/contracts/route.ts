// =============================================================================
// API: /api/documents/contracts — AutoDrive
// Listagem de contratos importados
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, type SessionUser } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'

/**
 * Escopo de loja dos contratos. Usuário comum: sempre a própria loja (sem loja
 * → erro). MASTER dentro de uma loja vê só ela; MASTER fora de loja vê tudo.
 */
function contractScope(user: SessionUser, extra: Record<string, unknown> = {}) {
  if (user.role === 'MASTER') return user.tenantId ? { ...extra, tenantId: user.tenantId } : extra
  return tenantWhere(user.role, assertTenantId(user.tenantId, user.role), extra)
}

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(user.role, 'documents')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    { const gate = await assertModuleEnabled(user, 'documents'); if (gate) return gate }

    const { searchParams } = new URL(req.url)
    const page    = Math.max(1, Number(searchParams.get('page')    ?? 1))
    const perPage = Math.min(100, Number(searchParams.get('perPage') ?? 50))
    const search  = searchParams.get('search') || undefined

    let where: Record<string, unknown>
    try { where = contractScope(user) } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error).message }, { status: 403 })
    }
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
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    if (!canAccessModule(user.role, 'documents.pdf')) return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    { const gate = await assertModuleEnabled(user, 'documents'); if (gate) return gate }

    let tenantId: string | null
    try { tenantId = user.role === 'MASTER' ? user.tenantId ?? null : assertTenantId(user.tenantId, user.role) } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error).message }, { status: 403 })
    }

    const body = await req.json()

    // TODO: match customer and vehicle by name/plate if they exist
    const contract = await prisma.contract.create({
      data: {
        tenantId,
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
