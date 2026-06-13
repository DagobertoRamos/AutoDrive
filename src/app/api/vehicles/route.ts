// =============================================================================
// /api/vehicles — Listagem e criação de veículos em estoque (multi-tenant)
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

// Status que NÃO finalizaram a negociação — veículo está em negociação ativa
const OPEN_DEAL_STATUSES = ['RASCUNHO', 'AGUARDANDO_LIBERACAO', 'LIBERADA', 'EM_ANDAMENTO', 'REABERTA']

// ── GET — Listar estoque com filtros e paginação ──────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.view')) return forbiddenResponse('Sem acesso ao módulo de estoque.')

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const { searchParams } = new URL(req.url)

    // Paginação
    const page  = Math.max(1, Number(searchParams.get('page')  ?? 1))
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 24)))

    // Filtros
    const search        = searchParams.get('search')?.trim()        ?? ''
    const unitId        = searchParams.get('unitId')                ?? ''
    const stockStatus   = searchParams.get('stockStatus')           ?? ''
    const stockLocation = searchParams.get('stockLocation')         ?? ''
    const vehicleType   = searchParams.get('vehicleType')           ?? ''
    const stockType     = searchParams.get('stockType')             ?? ''
    const conditionType = searchParams.get('conditionType')         ?? ''
    const pendencyIds   = searchParams.get('pendencyIds')           ?? ''
    const cautelarStatus = searchParams.get('cautelarStatus')       ?? ''
    const includeInactive = searchParams.get('includeInactive') === 'true'

    // Base where com isolamento de tenant
    const baseWhere = tenantWhere(user.role, tenantId)
    const where: Record<string, unknown> = {
      ...baseWhere,
      ...(includeInactive ? {} : { active: true }),
    }

    // Filtro de unidade — valida que pertence ao tenant se não for MASTER
    if (unitId) {
      if (user.role !== 'MASTER') {
        await assertUnitBelongsToTenant(unitId, tenantId, user.role)
      }
      where.unitId = unitId
    }

    if (stockStatus)   where.stockStatus   = stockStatus
    if (stockLocation) where.stockLocation = stockLocation
    if (vehicleType)   where.vehicleType   = vehicleType
    if (stockType)     where.stockType     = stockType
    if (conditionType) where.conditionType = conditionType
    if (cautelarStatus) where.cautelarStatus = cautelarStatus

    // Filtro por pendências ativas
    if (pendencyIds) {
      const ids = pendencyIds.split(',').filter(Boolean)
      if (ids.length > 0) {
        where.stockPendencies = {
          some: { optionId: { in: ids }, resolved: false },
        }
      }
    }

    // Busca textual
    if (search) {
      where.OR = [
        { plate:   { contains: search, mode: 'insensitive' } },
        { brand:   { contains: search, mode: 'insensitive' } },
        { model:   { contains: search, mode: 'insensitive' } },
        { version: { contains: search, mode: 'insensitive' } },
        { chassi:  { contains: search, mode: 'insensitive' } },
        { renavam: { contains: search, mode: 'insensitive' } },
        { color:   { contains: search, mode: 'insensitive' } },
        { fuel:    { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { unit:     { name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [total, vehicles] = await Promise.all([
      prisma.vehicle.count({ where: where as never }),
      prisma.vehicle.findMany({
        where:   where as never,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
        select: {
          id:           true,
          tenantId:     true,
          unitId:       true,
          plate:        true,
          brand:        true,
          model:        true,
          version:      true,
          year:         true,
          modelYear:    true,
          km:           true,
          color:        true,
          fuel:         true,
          transmission: true,
          doors:        true,
          vehicleType:  true,
          conditionType: true,
          stockType:    true,
          stockLocation: true,
          stockStatus:  true,
          salePrice:    true,
          purchasePrice: true,
          fipeValue:    true,
          cautelarStatus: true,
          mainPhotoUrl: true,
          active:       true,
          entryDate:    true,
          exitDate:     true,
          notes:        true,
          createdAt:    true,
          updatedAt:    true,
          unit: {
            select: { id: true, name: true },
          },
          customer: {
            select: { id: true, name: true },
          },
          photos: {
            orderBy: { order: 'asc' },
            select: { id: true, url: true, isMain: true, caption: true },
          },
          stockPendencies: {
            where: { resolved: false },
            select: {
              id: true,
              notes: true,
              option: { select: { id: true, label: true, category: true } },
            },
          },
          // Verificar negociações abertas via DealVehicle → Deal
          // Inclui vendedor e unidade para exibir tag "Em negociação por X da unidade Y"
          dealVehicles: {
            where: {
              deal: { status: { in: OPEN_DEAL_STATUSES as never } },
            },
            select: {
              dealId: true,
              deal: {
                select: {
                  id:         true,
                  dealNumber: true,
                  status:     true,
                  unitId:     true,
                  seller: {
                    select: {
                      id:       true,
                      fullName: true,
                      user:     { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
            take: 1,
          },
          _count: { select: { photos: true, stockPendencies: true } },
        },
      }),
    ])

    // ── A relação dealVehicles vem do select via Prisma mas o TS pode perder
    // o tipo após `as never` no `status: { in: ... }`. Tratamos como `any[]`
    // só nessa transformação para evitar TS2339 spurious.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vehiclesAny = vehicles as any[]

    // Buscar nomes de unidades referenciadas pelas negociações abertas (em batch)
    const dealUnitIds = Array.from(new Set(
      vehiclesAny
        .map((v) => v.dealVehicles?.[0]?.deal?.unitId as string | undefined)
        .filter((id): id is string => !!id),
    ))
    const dealUnits = dealUnitIds.length > 0
      ? await prisma.unit.findMany({
          where:  { id: { in: dealUnitIds } },
          select: { id: true, name: true },
        })
      : []
    const unitNameMap = Object.fromEntries(dealUnits.map((u) => [u.id, u.name]))

    // ── displayPhotos: fotos do marketing PRIMEIRO; fallback fotos das
    //    avaliações vinculadas (FOTO_SECAO) pra cobrir veículos recém-liberados
    //    que ainda não passaram pelo marketing. Top 6 imagens.
    const vehicleIds = vehiclesAny.map((v) => v.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let evalPhotosByVehicle: Record<string, string[]> = {}
    if (vehicleIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const evals: any[] = await prisma.vehicleEvaluation.findMany({
        where:  { vehicleId: { in: vehicleIds } },
        select: { id: true, vehicleId: true },
      })
      const evalIdToVeh = new Map<string, string>(
        evals.filter((e) => e.vehicleId).map((e) => [e.id, e.vehicleId as string]),
      )
      const evalIds = Array.from(evalIdToVeh.keys())
      if (evalIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const atts: any[] = await (prisma as any).evaluationAttachment.findMany({
          where:   { evaluationId: { in: evalIds }, fileType: 'image' },
          orderBy: { createdAt: 'asc' },
          select:  { evaluationId: true, publicUrl: true, itemId: true, category: true },
        })
        for (const a of atts) {
          if (!a.publicUrl) continue
          // Prefere fotos sem itemId (foto geral da seção) sobre fotos de itens
          const vehId = evalIdToVeh.get(a.evaluationId)
          if (!vehId) continue
          if (!evalPhotosByVehicle[vehId]) evalPhotosByVehicle[vehId] = []
          // Ordena: FOTO_SECAO sem itemId primeiro
          const isSection = !a.itemId
          if (isSection) evalPhotosByVehicle[vehId].unshift(a.publicUrl)
          else evalPhotosByVehicle[vehId].push(a.publicUrl)
        }
      }
    }

    // Computa hasOpenNegotiation com info de vendedor e unidade da negociação
    const data = vehiclesAny.map((v) => {
      const openDealRow = v.dealVehicles?.[0]
      const openDeal    = openDealRow?.deal
      const sellerName  = openDeal?.seller?.fullName
                        ?? openDeal?.seller?.user?.name
                        ?? null
      const unitName    = openDeal?.unitId ? (unitNameMap[openDeal.unitId] ?? null) : null

      // displayPhotos: prioriza VehiclePhoto (marketing) → fallback fotos da avaliação
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const marketingPhotos: string[] = (v.photos ?? [])
        .sort((a: any, b: any) => (b.isMain ? 1 : 0) - (a.isMain ? 1 : 0)) // main primeiro
        .map((p: any) => p.url)
        .filter((u: string | null): u is string => !!u)
      const fallbackPhotos = marketingPhotos.length === 0
        ? (evalPhotosByVehicle[v.id] ?? [])
        : []
      const displayPhotos = [...marketingPhotos, ...fallbackPhotos].slice(0, 6)

      return {
        ...v,
        displayPhotos,
        hasOpenNegotiation:    !!openDeal,
        openNegotiationId:     openDeal?.id          ?? null,
        openNegotiationNumber: openDeal?.dealNumber ?? null,
        openNegotiationStatus: openDeal?.status      ?? null,
        openNegotiationSeller: sellerName,
        openNegotiationUnit:   unitName,
      }
    })

    return NextResponse.json({
      success: true,
      data,
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

// ── POST — Criar veículo no estoque ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.manage')) {
    return forbiddenResponse('Apenas gerentes e administradores podem cadastrar veículos.')
  }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const body = await req.json()

    const {
      plate, chassi, renavam,
      brand, model, version, year, modelYear, km, color, fuel, transmission, doors,
      vehicleType, conditionType, stockType, stockLocation, stockStatus,
      salePrice, purchasePrice, fipeValue,
      cautelarStatus, cautelarNumber, cautelarNotes,
      mainPhotoUrl, notes, unitId, customerId, entryDate,
    } = body

    if (!brand?.trim() || !model?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Marca e modelo são obrigatórios.' },
        { status: 400 },
      )
    }

    // Valida unitId
    const resolvedUnitId = unitId?.trim() || null
    if (resolvedUnitId) {
      await assertUnitBelongsToTenant(resolvedUnitId, tenantId, user.role)
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId,
        unitId:       resolvedUnitId,
        customerId:   customerId    ? String(customerId)   : null,
        plate:        plate?.trim() ? String(plate).trim().toUpperCase() : null,
        chassi:       chassi?.trim()  ? String(chassi).trim().toUpperCase()  : null,
        renavam:      renavam?.trim() ? String(renavam).trim()               : null,
        brand:        String(brand).trim(),
        model:        String(model).trim(),
        version:      version?.trim() ? String(version).trim() : null,
        year:         year        ? Number(year)        : null,
        modelYear:    modelYear   ? Number(modelYear)   : null,
        km:           km          ? Number(km)          : null,
        color:        color?.trim()  ? String(color).trim()   : null,
        fuel:         fuel?.trim()   ? String(fuel).trim()    : null,
        transmission: transmission?.trim() ? String(transmission).trim() : null,
        doors:        doors       ? Number(doors)       : null,
        vehicleType:  vehicleType   ?? null,
        conditionType: conditionType ?? null,
        stockType:    stockType     ?? null,
        stockLocation: stockLocation ?? null,
        stockStatus:  stockStatus    ?? 'DISPONIVEL',
        salePrice:    salePrice    != null ? salePrice    : null,
        purchasePrice: purchasePrice != null ? purchasePrice : null,
        fipeValue:    fipeValue    != null ? fipeValue    : null,
        cautelarStatus:  cautelarStatus  ?? 'SEM_CAUTELAR',
        cautelarNumber:  cautelarNumber?.trim()  || null,
        cautelarNotes:   cautelarNotes?.trim()   || null,
        mainPhotoUrl:    mainPhotoUrl?.trim()    || null,
        notes:           notes?.trim()           || null,
        entryDate:    entryDate ? new Date(entryDate) : new Date(),
        active:       true,
      },
    })

    await createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'CREATE',
      entity:   'Vehicle',
      entityId: vehicle.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json(
      { success: true, data: vehicle, message: 'Veículo cadastrado com sucesso.' },
      { status: 201 },
    )
  } catch (err) {
    return handlePrismaError(err)
  }
}
