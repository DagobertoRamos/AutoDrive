// =============================================================================
// GET /api/negotiations/[id]/summary — resumo compacto (somente leitura) da
// negociação para o painel lateral "Resumo da negociação" (DealPeek), aberto a
// partir de qualquer módulo sem sair dele.
//
// Acesso (qualquer um basta, sempre restrito à loja):
//   - módulo negociações + escopo de buildNegotiationAccessWhere (mesmo da tela);
//   - acesso ao financeiro (hasFinanceAccess) — loja efetiva (MASTER: seletor);
//   - comissão própria vinculada à negociação (ruleDetails.dealId).
// Valores pela mesma fonte da tela da negociação (dealBalanceOf + reconciliationOf).
// F&I sensível (retorno, ILA, IOF, IRRF, PLUS) só para quem tem financeiro.
// =============================================================================

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { buildCommissionAccessWhere, buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { hasFinanceAccess } from '@/lib/finance/access'
import { resolveActingTenant } from '@/lib/acting-tenant'
import { dealBalanceOf, reconciliationOf } from '@/lib/negotiation-service'
import { handlePrismaError } from '@/lib/prisma-errors'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

const n = (v: Prisma.Decimal | number | string | null | undefined): number | null => {
  if (v == null) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

function firstPhoto(photos: unknown): string | null {
  if (!Array.isArray(photos)) return null
  for (const p of photos) {
    if (typeof p === 'string' && p) return p
    if (p && typeof p === 'object' && typeof (p as { url?: unknown }).url === 'string') return (p as { url: string }).url
  }
  return null
}

/** Escopo de acesso: where da negociação ou null (sem acesso). */
async function accessWhere(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>, dealId: string, req: Request): Promise<{ where: Prisma.DealWhereInput; finance: boolean } | null> {
  const finance = await hasFinanceAccess(user).catch(() => false)

  if (canAccessModule(user.role, 'negotiations') && !(await assertModuleEnabled(user, 'negotiations'))) {
    const where = await buildNegotiationAccessWhere(user, { id: dealId })
    if (await prisma.deal.count({ where })) return { where, finance }
  }

  if (finance) {
    const tenantId = await resolveActingTenant(user, req) ?? user.tenantId
    if (tenantId) return { where: { id: dealId, tenantId }, finance }
    if (user.role === 'MASTER') return { where: { id: dealId }, finance }
  }

  if (canAccessModule(user.role, 'commissions') && !(await assertModuleEnabled(user, 'commissions'))) {
    const cw = await buildCommissionAccessWhere(user, { ruleDetails: { path: ['dealId'], equals: dealId } as never })
    if (await prisma.commissionCalculation.count({ where: cw })) {
      return { where: user.role === 'MASTER' ? { id: dealId } : { id: dealId, tenantId: user.tenantId ?? '__none__' }, finance }
    }
  }
  return null
}

export async function GET(req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const { id } = await params
  if (!id) return NextResponse.json({ success: false, error: 'ID ausente.' }, { status: 400 })

  try {
    const scope = await accessWhere(user, id, req)
    if (!scope) return NextResponse.json({ success: false, error: 'Negociação não encontrada.' }, { status: 404 })

    const deal = await prisma.deal.findFirst({
      where: scope.where,
      include: {
        person: { select: { nomeCompleto: true, cpf: true, cnpj: true, phone: true, email: true, cidade: true, estado: true } },
        customer: { select: { name: true, cpf: true, phone: true, email: true, city: true, state: true } },
        seller: { select: { fullName: true, shortName: true } },
        manager: { select: { name: true } },
        vehicles: { orderBy: { createdAt: 'asc' }, include: { vehicle: { select: { mainPhotoUrl: true, modelYear: true } } } },
        debts: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'asc' } },
        services: { orderBy: { createdAt: 'asc' } },
        discountRequests: true,
        changes: true,
        warrantySales: { orderBy: { createdAt: 'asc' }, include: { warranty: { select: { name: true } } } },
      },
    })
    if (!deal) return NextResponse.json({ success: false, error: 'Negociação não encontrada.' }, { status: 404 })

    // Mesma conta da tela da negociação (card "Valores Detalhados").
    const { summary } = dealBalanceOf(deal)
    const rec = reconciliationOf(summary)
    const tradeTotal = deal.vehicles.filter((v) => v.role === 'TROCA').reduce((s, v) => s + (n(v.agreedValue ?? v.evaluatedValue) ?? 0), 0) || (n(deal.tradeValue) ?? 0)
    const fin = scope.finance

    const p = deal.person
    const c = deal.customer
    const data = {
      id: deal.id,
      dealNumber: deal.dealNumber,
      type: deal.type,
      status: deal.status,
      source: deal.source,
      dates: {
        createdAt: iso(deal.createdAt),
        approvedAt: iso(deal.approvedAt),
        saleDate: iso(deal.saleDate),
        deliveryDate: iso(deal.deliveryDate),
        finalizedAt: iso(deal.finalizedAt),
        cancelledAt: iso(deal.cancelledAt),
      },
      customer: p || c ? {
        name: p?.nomeCompleto ?? c?.name ?? null,
        document: p?.cpf ?? p?.cnpj ?? c?.cpf ?? null,
        phone: p?.phone ?? c?.phone ?? null,
        email: p?.email ?? c?.email ?? null,
        city: p?.cidade ?? c?.city ?? null,
        state: p?.estado ?? c?.state ?? null,
      } : null,
      seller: deal.seller ? deal.seller.shortName || deal.seller.fullName : deal.sellerNameFromSheet ?? null,
      manager: deal.manager?.name ?? null,
      vehicles: deal.vehicles.map((v) => ({
        id: v.id, vehicleId: v.vehicleId, role: v.role, plate: v.plate, brand: v.brand, model: v.model,
        year: v.year ?? v.vehicle?.modelYear ?? null, color: v.color,
        agreedValue: n(v.agreedValue), evaluatedValue: n(v.evaluatedValue),
        photo: v.vehicle?.mainPhotoUrl ?? firstPhoto(v.photos),
      })),
      values: {
        sale: n(deal.saleAmount ?? deal.purchaseAmount ?? deal.vehicleValue),
        vehicles: summary.vehicleAmount,
        discount: summary.discountApprovedTotal,
        documentation: summary.feeAmount,
        services: summary.serviceAmount,
        debts: summary.debtAmount,
        trade: tradeTotal,
        financed: n(deal.financedAmount),
        total: summary.netTotal,
        paid: summary.paidTotal,
        paidConfirmed: rec.conciliado,
        paidPending: rec.aguardando,
        balance: summary.openBalance,
        change: summary.changeTotal,
        paymentStatus: summary.paymentStatus,
        reconciliation: rec.situacao,
      },
      payments: deal.payments.map((x) => ({
        id: x.id, type: x.type, method: x.method, status: x.status ?? 'PENDENTE', value: n(x.value) ?? 0,
        bank: x.bank, installments: x.installments, installmentValue: n(x.installmentValue),
        dueDate: iso(x.dueDate ?? x.firstDueDate), paidAt: iso(x.paidAt),
        ...(fin ? {
          fi: x.type === 'FINANCIAMENTO' ? {
            returnPct: n(x.returnPct), returnGross: n(x.returnGrossValue), ila: n(x.ilaValue), iof: n(x.iofValue),
            irrf: n(x.irrfValue), returnNet: n(x.returnNetValue), plus: n(x.plusValue), contractNumber: x.contractNumber,
          } : null,
        } : {}),
      })),
      services: deal.services.map((s) => ({ id: s.id, name: s.name, kind: s.kind, value: n(s.value) ?? 0 })),
      warranties: deal.warrantySales.map((w) => ({ id: w.id, name: w.warranty?.name ?? 'Garantia', status: w.status, value: n(w.finalPrice) ?? 0 })),
      debts: deal.debts.map((d) => ({ id: d.id, type: d.type, description: d.description, vehicleRole: d.vehicleRole, responsavel: d.responsavel, value: n(d.value) ?? 0 })),
      fi: fin ? {
        returnPct: n(deal.returnRatePercent), returnGross: n(deal.returnGrossValue),
        ilaPercent: n(deal.ilaPercent), ila: n(deal.ilaValue), iofPercent: n(deal.iofPercent), iof: n(deal.iofValue),
        returnNet: n(deal.returnNetValue),
      } : null,
      canFinance: fin,
    }
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}
