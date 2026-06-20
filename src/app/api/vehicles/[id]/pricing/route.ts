// =============================================================================
// /api/vehicles/[id]/pricing
//
// GET   — retorna precificação atual + últimos 20 eventos de histórico.
//         Permissão: stock.view (todos com acesso ao estoque).
// PATCH — atualiza precificação. Permissão: gerente+ (stock.manage).
//         Para cada campo alterado grava VehiclePricingHistory + AuditLog.
//         Se isAvailableForSale=true, ativa o veículo e marca stockStatus=
//         DISPONIVEL automaticamente.
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
import { assertModuleEnabled } from '@/lib/tenant-modules'

// ── helpers ───────────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number'
    ? v
    : Number(String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function toDate(v: unknown): Date | null {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

function decToNum(v: unknown): number | null {
  if (v == null) return null
  // Prisma Decimal has toString
  const n = Number(String(v))
  return Number.isFinite(n) ? n : null
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.view')) return forbiddenResponse()
  { const gate = await assertModuleEnabled(user, 'stock.view'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: params.id, ...tenantWhere(user.role, tenantId) },
       
      select: {
        id:                 true,
        salePrice:          true,
        purchasePrice:      true,
        fipeValue:          true,
        promoPrice:         true,
        isPromo:            true,
        promoStartsAt:      true,
        promoEndsAt:        true,
        isAvailableForSale: true,
        pricingNotes:       true,
        pricedById:         true,
        pricedAt:           true,
        stockStatus:        true,
        active:             true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    })

    if (!vehicle) {
      return NextResponse.json({ success: false, error: 'Veículo não encontrado.' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const history = await (prisma as any).vehiclePricingHistory.findMany({
      where:   { vehicleId: params.id },
      orderBy: { createdAt: 'desc' },
      take:    20,
    })

    // Resolve nomes dos usuários que alteraram
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userIds = Array.from(new Set(history.map((h: any) => h.changedById).filter(Boolean)))
    const users = userIds.length > 0
      ? await prisma.user.findMany({
          where:  { id: { in: userIds as string[] } },
          select: { id: true, name: true },
        })
      : []
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const historyOut = history.map((h: any) => ({
      ...h,
      changedByName: userMap[h.changedById] ?? null,
    }))

    return NextResponse.json({ success: true, data: { vehicle, history: historyOut } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.manage')) {
    return forbiddenResponse('Apenas gerência pode alterar a precificação de venda.')
  }
  { const gate = await assertModuleEnabled(user, 'stock.view'); if (gate) return gate }

  try {
    const tenantId = assertTenantId(user.tenantId, user.role)

    const existing = await prisma.vehicle.findFirst({
      where: { id: params.id, ...tenantWhere(user.role, tenantId) },
    })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Veículo não encontrado.' }, { status: 404 })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex = existing as any

    const body = await req.json().catch(() => ({}))

    const salePrice          = body.salePrice          !== undefined ? toNum(body.salePrice)          : undefined
    const promoPrice         = body.promoPrice         !== undefined ? toNum(body.promoPrice)         : undefined
    const isPromo            = body.isPromo            !== undefined ? Boolean(body.isPromo)          : undefined
    const promoStartsAt      = body.promoStartsAt      !== undefined ? toDate(body.promoStartsAt)     : undefined
    const promoEndsAt        = body.promoEndsAt        !== undefined ? toDate(body.promoEndsAt)       : undefined
    const isAvailableForSale = body.isAvailableForSale !== undefined ? Boolean(body.isAvailableForSale) : undefined
    const pricingNotes       = body.pricingNotes       !== undefined ? (String(body.pricingNotes).trim() || null) : undefined
    const reason             = typeof body.reason === 'string' ? body.reason.trim() : null

    // Validações monetárias
    if (salePrice  !== undefined && salePrice  !== null && salePrice  <= 0) {
      return NextResponse.json({ success: false, error: 'Preço de venda deve ser maior que zero.' }, { status: 400 })
    }
    if (promoPrice !== undefined && promoPrice !== null && promoPrice <= 0) {
      return NextResponse.json({ success: false, error: 'Preço promocional deve ser maior que zero.' }, { status: 400 })
    }
    if (isPromo === true && (promoPrice == null && ex.promoPrice == null)) {
      return NextResponse.json({ success: false, error: 'Para ativar promoção, informe um preço promocional.' }, { status: 400 })
    }

    // ── Monta diff de campos alterados ──────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = {
      pricedById: user.id,
      pricedAt:   new Date(),
    }
    if (salePrice          !== undefined) updates.salePrice          = salePrice
    if (promoPrice         !== undefined) updates.promoPrice         = promoPrice
    if (isPromo            !== undefined) updates.isPromo            = isPromo
    if (promoStartsAt      !== undefined) updates.promoStartsAt      = promoStartsAt
    if (promoEndsAt        !== undefined) updates.promoEndsAt        = promoEndsAt
    if (isAvailableForSale !== undefined) updates.isAvailableForSale = isAvailableForSale
    if (pricingNotes       !== undefined) updates.pricingNotes       = pricingNotes

    // Side-effect: ao publicar, ativa o veículo e marca como DISPONIVEL
    let activatedNow = false
    if (isAvailableForSale === true && !ex.active) {
      updates.active = true
      activatedNow = true
    }
    if (isAvailableForSale === true && (ex.stockStatus === 'EM_PRECIFICACAO' || ex.stockStatus == null)) {
      updates.stockStatus = isPromo === true ? 'EM_PROMOCAO' : 'DISPONIVEL'
    }
    if (isAvailableForSale === false && ex.stockStatus === 'DISPONIVEL') {
      // volta para pré-publicação se for despublicado
      updates.stockStatus = 'EM_PRECIFICACAO'
    }

    const updated = await prisma.vehicle.update({
      where: { id: params.id },
      data:  updates,
    })

    // ── Grava VehiclePricingHistory para cada campo alterado ───────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const histRecords: any[] = []

    const oldSale  = decToNum(ex.salePrice)
    const newSale  = salePrice  !== undefined ? salePrice  : oldSale
    const oldPromo = decToNum(ex.promoPrice)
    const newPromo = promoPrice !== undefined ? promoPrice : oldPromo
    const oldAvail = !!ex.isAvailableForSale
    const newAvail = isAvailableForSale !== undefined ? isAvailableForSale : oldAvail
    const oldIsPromo = !!ex.isPromo
    const newIsPromo = isPromo !== undefined ? isPromo : oldIsPromo

    if (salePrice !== undefined && oldSale !== newSale) {
      histRecords.push({
        vehicleId:    params.id,
        tenantId,
        changedById:  user.id,
        action:       oldSale == null ? 'SET_PRICE' : 'UPDATE_PRICE',
        oldSalePrice: oldSale,
        newSalePrice: newSale,
        reason,
      })
    }
    if (promoPrice !== undefined && oldPromo !== newPromo) {
      histRecords.push({
        vehicleId:     params.id,
        tenantId,
        changedById:   user.id,
        action:        'UPDATE_PRICE',
        oldPromoPrice: oldPromo,
        newPromoPrice: newPromo,
        reason,
      })
    }
    if (isPromo !== undefined && oldIsPromo !== newIsPromo) {
      histRecords.push({
        vehicleId:   params.id,
        tenantId,
        changedById: user.id,
        action:      newIsPromo ? 'PROMO_START' : 'PROMO_END',
        oldIsPromo,
        newIsPromo,
        reason,
      })
    }
    if (isAvailableForSale !== undefined && oldAvail !== newAvail) {
      histRecords.push({
        vehicleId:      params.id,
        tenantId,
        changedById:    user.id,
        action:         newAvail ? 'AVAILABILITY_ON' : 'AVAILABILITY_OFF',
        oldIsAvailable: oldAvail,
        newIsAvailable: newAvail,
        reason,
      })
    }
    if (pricingNotes !== undefined && (ex.pricingNotes ?? null) !== (pricingNotes ?? null)) {
      histRecords.push({
        vehicleId:   params.id,
        tenantId,
        changedById: user.id,
        action:      'NOTES_UPDATE',
        reason,
      })
    }

    if (histRecords.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).vehiclePricingHistory.createMany({ data: histRecords })
    }

    await createSafeAuditLog({
      userId:   user.id,
      tenantId,
      action:   'VEHICLE_PRICING_UPDATE',
      entity:   'Vehicle',
      entityId: params.id,
      userName: user.name,
      userRole: user.role,
    })

    return NextResponse.json({ success: true, data: updated, activated: activatedNow })
  } catch (err) {
    return handlePrismaError(err)
  }
}
