// =============================================================================
// /api/vehicles/evaluations — Listagem e criação de avaliações de veículos
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  assertTenantId,
  tenantWhere,
  unauthorizedResponse,
  forbiddenResponse,
  assertUnitBelongsToTenant,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'

// ── GET — Listar avaliações ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.evaluate')) return forbiddenResponse('Sem acesso às avaliações.')
  { const gate = await assertModuleEnabled(user, 'stock.evaluate'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const { searchParams } = new URL(req.url)
    const page      = Math.max(1, Number(searchParams.get('page')  ?? 1))
    const limit     = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 20)))
    const vehicleId = searchParams.get('vehicleId') ?? ''
    const unitId    = searchParams.get('unitId')    ?? ''
    const result    = searchParams.get('result')    ?? ''
    const search    = searchParams.get('search')?.trim() ?? ''

    const where: Record<string, unknown> = {
      ...tenantWhere(user.role, tenantId),
    }

    if (vehicleId) where.vehicleId = vehicleId
    if (result)    where.result    = result

    if (unitId) {
      if (user.role !== 'MASTER') {
        await assertUnitBelongsToTenant(unitId, tenantId, user.role)
      }
      where.unitId = unitId
    }

    if (search) {
      where.OR = [
        { ownerName:  { contains: search, mode: 'insensitive' } },
        { ownerPhone: { contains: search, mode: 'insensitive' } },
        { ownerCpf:   { contains: search, mode: 'insensitive' } },
        { plate:      { contains: search, mode: 'insensitive' } },
        { brand:      { contains: search, mode: 'insensitive' } },
        { model:      { contains: search, mode: 'insensitive' } },
        { chassi:     { contains: search, mode: 'insensitive' } },
      ]
    }

    const [total, evaluations] = await Promise.all([
      prisma.vehicleEvaluation.count({ where: where as never }),
      prisma.vehicleEvaluation.findMany({
        where:   where as never,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
        include: {
          evaluatedBy: { select: { id: true, name: true } },
          unit:        { select: { id: true, name: true } },
          vehicle:     { select: { id: true, brand: true, model: true, plate: true, mainPhotoUrl: true } },
        },
      }),
    ])

    return NextResponse.json({
      success: true,
      data: evaluations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── POST — Criar avaliação ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.evaluate')) {
    return forbiddenResponse('Sem permissão para criar avaliações.')
  }
  { const gate = await assertModuleEnabled(user, 'stock.evaluate'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const body = await req.json()

    const {
      vehicleId,
      unitId,
      // Dados do veículo snapshot
      plate, chassi, renavam, brand, model, version,
      year, modelYear, km, color, fuel, transmission,
      vehicleType, conditionType,
      // Dados técnicos adicionais
      doors, engine, displacement, power, bodyType,
      // FIPE
      fipeCode, fipeReferenceMonth,
      // Valores
      fipeValue, evaluatedValue, desiredValue, minimumValue, suggestedSalePrice,
      // Resultado
      result, intention, notes, stockType,
      // Cautelar
      cautelarStatus, cautelarNumber, cautelarNotes,
      // Dados do proprietário
      ownerName, ownerPhone, ownerCpf, ownerEmail,
      // Metadados de lookup
      lookupSource,
    } = body

    // Validações básicas
    if (!brand?.trim() || !model?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Marca e modelo são obrigatórios.' },
        { status: 400 },
      )
    }

    // Valida unitId se fornecido
    const resolvedUnitId = unitId?.trim() || null
    if (resolvedUnitId && user.role !== 'MASTER') {
      await assertUnitBelongsToTenant(resolvedUnitId, tenantId, user.role)
    }

    // Valida vehicleId se fornecido (pertence ao tenant)
    const resolvedVehicleId = vehicleId?.trim() || null
    if (resolvedVehicleId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { id: resolvedVehicleId, ...tenantWhere(user.role, tenantId) },
        select: { id: true },
      })
      if (!vehicle) {
        return NextResponse.json(
          { success: false, error: 'Veículo não encontrado.' },
          { status: 404 },
        )
      }
    }

    const evaluation = await prisma.vehicleEvaluation.create({
      data: {
        tenantId,
        vehicleId:     resolvedVehicleId,
        unitId:        resolvedUnitId,
        evaluatedById: user.id,
        // Vehicle snapshot
        plate:           plate?.trim()?.toUpperCase()   || null,
        chassi:          chassi?.trim()?.toUpperCase()  || null,
        renavam:         renavam?.trim()                || null,
        brand:           String(brand).trim(),
        model:           String(model).trim(),
        version:         version?.trim()               || null,
        manufactureYear: year      ? Number(year)      : null,
        modelYear:       modelYear ? Number(modelYear) : null,
        km:              km        ? Number(km)        : null,
        color:           color?.trim()                 || null,
        fuel:            fuel?.trim()                  || null,
        transmission:    transmission?.trim()          || null,
        vehicleType:     vehicleType   ?? null,
        conditionType:   conditionType ?? null,
        // Dados técnicos
        doors:           doors       ? Number(doors)   : null,
        engine:          engine?.trim()                || null,
        displacement:    displacement?.trim()          || null,
        power:           power?.trim()                 || null,
        bodyType:        bodyType?.trim()              || null,
        // FIPE
        fipeCode:           fipeCode?.trim()          || null,
        fipeReferenceMonth: fipeReferenceMonth?.trim() || null,
        // Valores
        fipeValue:          fipeValue       != null ? fipeValue          : null,
        evaluatedValue:     evaluatedValue  != null ? evaluatedValue     : null,
        desiredValue:       desiredValue    != null ? desiredValue       : null,
        minimumValue:       minimumValue    != null ? minimumValue       : null,
        suggestedSalePrice: suggestedSalePrice != null ? suggestedSalePrice : null,
        // Resultado
        result:          result    ?? 'PENDENTE',
        intention:       intention ?? 'APENAS_AVALIACAO',
        evaluationNotes: notes?.trim()         || null,
        stockType:       stockType             || null,
        // Cautelar
        cautelarStatus: cautelarStatus?.trim() || 'SEM_CAUTELAR',
        cautelarNumber: cautelarNumber?.trim() || null,
        cautelarNotes:  cautelarNotes?.trim()  || null,
        // Owner data
        ownerName:  ownerName?.trim()  || null,
        ownerPhone: ownerPhone?.trim() || null,
        ownerCpf:   ownerCpf?.trim()   || null,
        ownerEmail: ownerEmail?.trim() || null,
        // Metadados
        lookupSource: lookupSource?.trim() || 'manual',
      },
      include: {
        evaluatedBy: { select: { id: true, name: true } },
        unit:        { select: { id: true, name: true } },
      },
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'CREATE',
      entity:   'VehicleEvaluation',
      entityId: evaluation.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json(
      { success: true, data: evaluation, message: 'Avaliação registrada com sucesso.' },
      { status: 201 },
    )
  } catch (err) {
    return handlePrismaError(err)
  }
}
