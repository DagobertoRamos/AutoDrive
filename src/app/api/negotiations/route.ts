// =============================================================================
// /api/negotiations — Listar e criar negociações
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'

// ── GET — Listar negociações ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const search = searchParams.get('search') ?? ''
  const type   = searchParams.get('type')   ?? ''
  const status = searchParams.get('status') ?? ''

  const where: Record<string, unknown> = {}

  // Isolamento por tenant (exceto MASTER)
  if (session.user.tenantId) {
    where.tenantId = session.user.tenantId
  }

  // Vendedores veem apenas suas próprias negociações
  if (session.user.role === 'VENDEDOR') {
    const seller = await prisma.seller.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (seller) where.sellerId = seller.id
  }

  if (type)   where.type   = type
  if (status) where.status = status

  if (search) {
    where.OR = [
      { person: { nomeCompleto: { contains: search, mode: 'insensitive' } } },
      { seller: { user: { name: { contains: search, mode: 'insensitive' } } } },
    ]
  }

  const deals = await prisma.deal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id:            true,
      type:          true,
      status:        true,
      totalPayments: true,
      createdAt:     true,
      person: { select: { nomeCompleto: true } },
      seller: { select: { user: { select: { name: true } } } },
    },
  })

  return NextResponse.json({ data: deals })
}

// ── POST — Criar negociação ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const body = await req.json()
  const { type, person, vehicle, totalValue, tradeValue, notes } = body

  if (!type || !person?.nomeCompleto) {
    return NextResponse.json({ error: 'Tipo e cliente são obrigatórios' }, { status: 400 })
  }

  // Busca o seller pelo userId
  const seller = await prisma.seller.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  // Cria Person + Deal + DealVehicle em transação
  const result = await prisma.$transaction(async (tx) => {
    // 1. Cria ou busca a Person
    let personRecord = null
    if (person.cpf || person.cnpj) {
      personRecord = await tx.person.findFirst({
        where: {
          tenantId: session.user.tenantId ?? undefined,
          OR: [
            person.cpf  ? { cpf:  person.cpf  } : undefined,
            person.cnpj ? { cnpj: person.cnpj } : undefined,
          ].filter(Boolean) as object[],
        },
      })
    }

    if (!personRecord) {
      personRecord = await tx.person.create({
        data: {
          tenantId:     session.user.tenantId ?? null,
          type:         person.type ?? 'FISICA',
          cpf:          person.cpf  ?? null,
          cnpj:         person.cnpj ?? null,
          nomeCompleto: person.nomeCompleto,
          email:        person.email ?? null,
          phone:        person.phone ?? null,
        },
      })
    }

    // 2. Cria o Deal
    // Deal schema fields: vehicleValue, tradeValue, totalPayments (not totalValue/downPayment/financedValue)
    const deal = await tx.deal.create({
      data: {
        tenantId:     session.user.tenantId ?? null,
        sellerId:     seller?.id ?? null,
        personId:     personRecord.id,
        type:         type,
        status:       'RASCUNHO',
        totalPayments: totalValue  ? Number(totalValue)  : null,
        tradeValue:    tradeValue  ? Number(tradeValue)  : null,
        notes:         notes ?? null,
      },
    })

    // 3. Cria DealVehicle se veículo foi informado
    if (vehicle?.plate) {
      // Busca ou cria veículo
      let vehicleRecord = await tx.vehicle.findFirst({
        where: {
          tenantId: session.user.tenantId ?? undefined,
          plate:    vehicle.plate.toUpperCase(),
        },
      })

      if (!vehicleRecord) {
        vehicleRecord = await tx.vehicle.create({
          data: {
            tenantId: session.user.tenantId ?? null,
            plate:    vehicle.plate.toUpperCase(),
            brand:    vehicle.brand ?? null,
            model:    vehicle.model ?? null,
            year:     vehicle.year  ?? null,
            color:    vehicle.color ?? null,
          },
        })
      }

      // Papel do veículo na negociação
      const roleMap: Record<string, string> = {
        VENDA:       'VENDIDO',
        COMPRA:      'COMPRADO',
        TROCA:       'VENDIDO',
        CONSIGNACAO: 'CONSIGNADO',
      }

      await tx.dealVehicle.create({
        data: {
          dealId:    deal.id,
          vehicleId: vehicleRecord.id,
          role:      roleMap[type] ?? 'VENDIDO',
        },
      })
    }

    // 4. Audit log
    await tx.auditLog.create({
      data: {
        userId:   session.user.id,
        tenantId: session.user.tenantId ?? null,
        action:   'CREATE',
        entity:   'Deal',
        entityId: deal.id,
        userName: session.user.name,
        userRole: session.user.role,
        status:   'SUCCESS',
      },
    })

    return deal
  })

  return NextResponse.json({ data: result }, { status: 201 })
}
