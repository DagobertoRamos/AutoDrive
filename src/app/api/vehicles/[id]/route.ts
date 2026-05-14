// =============================================================================
// /api/vehicles/[id] — Detalhes, edição e exclusão de veículo do estoque
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getSessionUser,
  assertTenantId,
  tenantWhere,
  unauthorizedResponse,
  forbiddenResponse,
  createSafeAuditLog,
} from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'

const OPEN_DEAL_STATUSES = ['RASCUNHO', 'AGUARDANDO_LIBERACAO', 'LIBERADA', 'EM_ANDAMENTO', 'REABERTA']

// ── GET — Detalhes completos do veículo ───────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.view')) return forbiddenResponse()

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const vehicle = await prisma.vehicle.findFirst({
      where: {
        id: params.id,
        ...tenantWhere(user.role, tenantId),
      },
      include: {
        unit: { select: { id: true, name: true, city: true, state: true } },
        customer: { select: { id: true, name: true, phone: true, email: true, cpf: true } },
        photos: { orderBy: { order: 'asc' } },
        stockPendencies: {
          include: {
            option: true,
            resolvedBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        evaluations: {
          orderBy: { createdAt: 'desc' },
          include: {
            evaluatedBy: { select: { id: true, name: true } },
            unit: { select: { id: true, name: true } },
          },
        },
        dealVehicles: {
          where: {
            deal: { status: { in: OPEN_DEAL_STATUSES } },
          },
          select: {
            dealId: true,
            role: true,
            deal: { select: { id: true, status: true, type: true, createdAt: true } },
          },
          take: 1,
        },
        _count: { select: { photos: true, stockPendencies: true, evaluations: true } },
      },
    })

    if (!vehicle) {
      return NextResponse.json(
        { success: false, error: 'Veículo não encontrado.' },
        { status: 404 },
      )
    }

    const openDeal = vehicle.dealVehicles[0]
    const data = {
      ...vehicle,
      hasOpenNegotiation: !!openDeal,
      openNegotiationId:  openDeal?.dealId ?? null,
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── PATCH — Editar veículo ────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.manage')) {
    return forbiddenResponse('Sem permissão para editar veículos.')
  }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    // Verifica se o veículo pertence ao tenant
    const existing = await prisma.vehicle.findFirst({
      where: { id: params.id, ...tenantWhere(user.role, tenantId) },
    })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Veículo não encontrado.' }, { status: 404 })
    }

    const body = await req.json()

    // Whitelist de campos editáveis
    const {
      plate, chassi, renavam,
      brand, model, version, year, modelYear, km, color, fuel, transmission, doors,
      vehicleType, conditionType, stockType, stockLocation, stockStatus,
      salePrice, purchasePrice, fipeValue,
      cautelarStatus, cautelarNumber, cautelarNotes,
      mainPhotoUrl, notes, unitId, active, exitDate, entryDate,
    } = body

    const updated = await prisma.vehicle.update({
      where: { id: params.id },
      data: {
        ...(plate        != null && { plate:        plate?.trim()?.toUpperCase() || null }),
        ...(chassi       != null && { chassi:       chassi?.trim()?.toUpperCase() || null }),
        ...(renavam      != null && { renavam:      renavam?.trim() || null }),
        ...(brand        != null && { brand:        String(brand).trim() }),
        ...(model        != null && { model:        String(model).trim() }),
        ...(version      != null && { version:      version?.trim() || null }),
        ...(year         != null && { year:         Number(year) }),
        ...(modelYear    != null && { modelYear:    Number(modelYear) }),
        ...(km           != null && { km:           Number(km) }),
        ...(color        != null && { color:        color?.trim() || null }),
        ...(fuel         != null && { fuel:         fuel?.trim() || null }),
        ...(transmission != null && { transmission: transmission?.trim() || null }),
        ...(doors        != null && { doors:        Number(doors) }),
        ...(vehicleType  != null && { vehicleType }),
        ...(conditionType != null && { conditionType }),
        ...(stockType    != null && { stockType }),
        ...(stockLocation != null && { stockLocation }),
        ...(stockStatus  != null && { stockStatus }),
        ...(salePrice    != null && { salePrice }),
        ...(purchasePrice != null && { purchasePrice }),
        ...(fipeValue    != null && { fipeValue }),
        ...(cautelarStatus  != null && { cautelarStatus }),
        ...(cautelarNumber  != null && { cautelarNumber:  cautelarNumber?.trim()  || null }),
        ...(cautelarNotes   != null && { cautelarNotes:   cautelarNotes?.trim()   || null }),
        ...(mainPhotoUrl    != null && { mainPhotoUrl:    mainPhotoUrl?.trim()    || null }),
        ...(notes           != null && { notes:           notes?.trim()           || null }),
        ...(unitId          != null && { unitId:          unitId?.trim()          || null }),
        ...(active          != null && { active:          Boolean(active) }),
        ...(entryDate       != null && { entryDate: entryDate ? new Date(entryDate) : null }),
        ...(exitDate        != null && { exitDate:  exitDate  ? new Date(exitDate)  : null }),
      },
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'UPDATE',
      entity:   'Vehicle',
      entityId: params.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── DELETE — Desativar veículo (soft delete) ──────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.manage')) {
    return forbiddenResponse('Sem permissão para remover veículos.')
  }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const existing = await prisma.vehicle.findFirst({
      where: { id: params.id, ...tenantWhere(user.role, tenantId) },
      include: {
        dealVehicles: {
          where: { deal: { status: { in: ['RASCUNHO', 'AGUARDANDO_LIBERACAO', 'LIBERADA', 'EM_ANDAMENTO', 'REABERTA'] } } },
          take: 1,
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Veículo não encontrado.' }, { status: 404 })
    }

    if (existing.dealVehicles.length > 0) {
      return NextResponse.json(
        { success: false, error: 'Este veículo está vinculado a uma negociação em aberto e não pode ser removido.' },
        { status: 409 },
      )
    }

    // Soft delete — preserva histórico
    await prisma.vehicle.update({
      where: { id: params.id },
      data:  { active: false },
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'DELETE',
      entity:   'Vehicle',
      entityId: params.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, message: 'Veículo removido do estoque.' })
  } catch (err) {
    return handlePrismaError(err)
  }
}
