// =============================================================================
// GET  /api/evaluations         — Listar avaliações (filtros por tenant/unit/status)
// POST /api/evaluations         — Criar nova avaliação (DRAFT). Opcionalmente
//                                  faz seed dos itens predefinidos do catálogo.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { requireModule }        from '@/lib/permissions'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { prisma }               from '@/lib/prisma'
import { ITEMS, type SectionKey } from '@/lib/evaluation/catalog'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'stock.evaluate') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  try {
    const { searchParams } = req.nextUrl
    const status   = searchParams.get('status')   ?? ''
    const unitId   = searchParams.get('unitId')   ?? ''
    const negotId  = searchParams.get('negotiationId') ?? ''
    const search   = searchParams.get('search')   ?? ''
    const page     = Math.max(1, Number(searchParams.get('page') ?? 1))
    const take     = 50

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}
    if (session.user.tenantId) where.tenantId = session.user.tenantId
    if (status)  where.status = status
    if (unitId)  where.unitId = unitId
    if (negotId) where.negotiationId = negotId

    if (search) {
      where.OR = [
        { plate:     { contains: search, mode: 'insensitive' } },
        { brand:     { contains: search, mode: 'insensitive' } },
        { model:     { contains: search, mode: 'insensitive' } },
        { ownerName: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [data, total] = await Promise.all([
      prisma.vehicleEvaluation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * take,
        take,
        select: {
          id: true, status: true, plate: true, brand: true, model: true,
          modelYear: true, km: true, fipeValue: true, evaluatedValue: true,
          suggestedSalePrice: true, totalExpenses: true,
          ownerName: true, unitId: true, evaluatedById: true,
          negotiationId: true, createdAt: true, updatedAt: true,
          result: true,
        },
      }),
      prisma.vehicleEvaluation.count({ where }),
    ])

    return NextResponse.json({
      data,
      pagination: { page, total, totalPages: Math.ceil(total / take), limit: take },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'stock.evaluate') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  try {
    const body = await req.json()
    const {
      plate, brand, model, version, manufactureYear, modelYear, km,
      color, fuel, transmission, chassi, renavam, vehicleType, conditionType,
      fipeCode, fipeReferenceMonth, fipeValue, evaluatedValue, desiredValue,
      minimumValue, suggestedSalePrice, evaluationNotes,
      ownerName, ownerCpf, ownerPhone, ownerEmail,
      unitId, negotiationId, vehicleId,
      seedItems,  // boolean — se true, cria os itens predefinidos do catálogo
    } = body

    // Valida unit pertence ao tenant
    let resolvedUnitId: string | null = session.user.unitId ?? null
    if (unitId && typeof unitId === 'string') {
      const u = await prisma.unit.findFirst({
        where:  { id: unitId, tenantId: session.user.tenantId ?? undefined },
        select: { id: true },
      })
      if (u) resolvedUnitId = u.id
    }

    const safeNum = (v: unknown): number | null => {
      if (v == null || v === '') return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    const ev = await prisma.vehicleEvaluation.create({
      data: {
        tenantId:        session.user.tenantId ?? null,
        unitId:          resolvedUnitId,
        vehicleId:       vehicleId ?? null,
        plate:           plate?.toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
        brand:           brand ?? null,
        model:           model ?? null,
        version:         version ?? null,
        manufactureYear: safeNum(manufactureYear),
        modelYear:       safeNum(modelYear),
        km:              safeNum(km),
        color:           color ?? null,
        fuel:            fuel  ?? null,
        transmission:    transmission ?? null,
        chassi:          chassi  ?? null,
        renavam:         renavam ?? null,
        vehicleType:     vehicleType   ?? null,
        conditionType:   conditionType ?? null,
        fipeCode:           fipeCode ?? null,
        fipeReferenceMonth: fipeReferenceMonth ?? null,
        fipeValue:          safeNum(fipeValue),
        evaluatedValue:     safeNum(evaluatedValue),
        desiredValue:       safeNum(desiredValue),
        minimumValue:       safeNum(minimumValue),
        suggestedSalePrice: safeNum(suggestedSalePrice),
        evaluationNotes:    evaluationNotes    ?? null,
        ownerName:          ownerName  ?? null,
        ownerCpf:           ownerCpf   ?? null,
        ownerPhone:         ownerPhone ?? null,
        ownerEmail:         ownerEmail ?? null,
        evaluatedById:      session.user.id,
        evaluatedAt:        new Date(),
        result:             'PENDENTE',
        // Novos campos:
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        status:             'DRAFT' as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        totalExpenses:      0 as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        negotiationId:      negotiationId ?? null as any,
      },
    })

    // Seed dos itens canônicos de checklist (apenas seções de inspeção)
    if (seedItems) {
      const sections: SectionKey[] = ['INTERIOR', 'FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA', 'TEST_DRIVE']
      const rows = sections.flatMap((sec) =>
        ITEMS[sec].map((it) => ({
          tenantId:     session.user.tenantId ?? null,
          evaluationId: ev.id,
          section:      sec,
          catalogKey:   it.key,
          name:         it.name,
          status:       'PENDING',
          totalExpenses: 0,
        })),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).evaluationItem.createMany({ data: rows }).catch(() => {})
    }

    await prisma.auditLog.create({
      data: {
        userId:   session.user.id,
        tenantId: session.user.tenantId ?? null,
        action:   'CREATE',
        entity:   'VehicleEvaluation',
        entityId: ev.id,
        userName: session.user.name,
        userRole: session.user.role,
        status:   'SUCCESS',
      },
    }).catch(() => {})

    return NextResponse.json({ data: ev }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
