// =============================================================================
// /api/negotiations/[id]/warranty-sales — Vender garantia dentro da negociação
//   GET  : lista as garantias vendidas na negociação
//   POST : registra a venda (tipo cheio/reduzido + adicional prêmio) — vendedor
// Preço e comissão são calculados no service layer a partir do cadastro.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { createDealAudit } from '@/lib/negotiation-service'
import { recalculateNegotiationCommissions } from '@/lib/commission-generator'
import { syncTenantFinance } from '@/lib/finance/finance-sync'
import { calculateWarrantyCommission, calculateWarrantySale, calculateWarrantySaleBySoldPrice } from '@/lib/warranty/warranty-calc'
import { warrantySaleSchema } from '@/lib/validators/warranty'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { id } = await params

  try {
    const deal = await prisma.deal.findFirst({
      where: await buildNegotiationAccessWhere(session.user, { id }),
      select: { tenantId: true },
    })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
    const sales = await prisma.warrantySale.findMany({
      where: { dealId: id },
      include: { warranty: { select: { name: true, coverageType: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ success: true, data: sales })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try {
    requireModule(session.user.role, 'negotiations')
    { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  const { id } = await params

  try {
    const input = warrantySaleSchema.parse(await req.json())

    const deal = await prisma.deal.findFirst({
      where: await buildNegotiationAccessWhere(session.user, { id }),
      select: { id: true, tenantId: true, unitId: true, sellerId: true },
    })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

    const warranty = await prisma.warranty.findUnique({ where: { id: input.warrantyId } })
    if (!warranty || (deal.tenantId && warranty.tenantId && warranty.tenantId !== deal.tenantId)) {
      return NextResponse.json({ error: 'Garantia inválida' }, { status: 400 })
    }
    if (!warranty.active) {
      return NextResponse.json({ error: 'Garantia inativa' }, { status: 400 })
    }

    const calc = input.soldPrice != null
      ? calculateWarrantySaleBySoldPrice(warranty, input.soldPrice, input.clientBoughtPremium)
      : calculateWarrantySale(warranty, input.saleType ?? 'FULL', input.clientBoughtPremium)
    const commission = calculateWarrantyCommission({
      warrantyFullPrice:       warranty.fullPrice,
      warrantyDiscountPrice:   warranty.reducedPrice,
      soldPrice:               calc.finalPrice,
      fullPriceCommission:     warranty.fullSaleCommissionValue,
      discountPriceCommission: warranty.reducedSaleCommissionValue,
      premiumCommissionValue:  input.clientBoughtPremium && warranty.hasPremiumAddon ? warranty.premiumAddonCommissionValue : 0,
    })
    const persistedSaleType = input.saleType
      ?? (commission.status === 'FULL_PRICE_COMMISSION' ? 'FULL' : 'REDUCED')

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.warrantySale.create({
        data: {
          tenantId:          deal.tenantId,
          dealId:            deal.id,
          warrantyId:        warranty.id,
          sellerId:          deal.sellerId,
          saleType:          persistedSaleType,
          basePrice:         calc.basePrice,
          hasPremiumAddon:   input.clientBoughtPremium && warranty.hasPremiumAddon,
          premiumAddonValue: calc.premiumAddonValue,
          finalPrice:        calc.finalPrice,
          createdBy:         session.user.id,
        },
      })
      await createDealAudit(tx as never, {
        dealId:   deal.id,
        tenantId: deal.tenantId,
        unitId:   deal.unitId,
        userId:   session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
        action:   'VENDER_GARANTIA',
        field:    'warrantySale',
        newValue: {
          warranty: warranty.name,
          saleType: persistedSaleType,
          finalPrice: calc.finalPrice,
          commissionStatus: commission.status,
          commissionValue: commission.totalCommissionValue,
        },
        reason:   commission.commissionable
          ? `Garantia vendida: ${warranty.name}`
          : `Garantia vendida sem comissão: valor abaixo do desconto (${warranty.name})`,
      })
      return created
    })

    // Recalcula comissões PREVISTAS da negociação (inclui a comissão de garantia).
    await recalculateNegotiationCommissions({
      dealId:      deal.id,
      tenantId:    deal.tenantId,
      triggeredBy: session.user.id,
    }).catch(() => { /* recálculo não bloqueia a venda */ })
    await syncTenantFinance(deal.tenantId ?? null).catch(() => {})

    return NextResponse.json({ success: true, data: sale }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? 'Dados inválidos.' }, { status: 400 })
    }
    return handlePrismaError(err)
  }
}
