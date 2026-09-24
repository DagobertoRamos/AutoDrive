// =============================================================================
// GET /api/site-admin/financing?days=30|90|365 — pedidos de financiamento que
// vieram do site (formulário de financiamento e "simular" no anúncio), com os
// detalhes da simulação e a situação no CRM. Porta de /admin/financiamentos.
// Gate: site + permissão de ver leads do CRM.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { vehicleTitle } from '@/lib/site/listing-core'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site')) return forbiddenResponse('Sem acesso ao site da loja.')
  // Dados de cliente: exige também acesso aos leads do CRM.
  if (!await canAccessModuleForUser(user, 'crm.view.own')) return forbiddenResponse('Sem acesso aos leads do CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const days = [30, 90, 365].includes(Number(new URL(req.url).searchParams.get('days'))) ? Number(new URL(req.url).searchParams.get('days')) : 30
  const since = new Date(Date.now() - days * 86_400_000)

  try {
    const rows = await prisma.marketingLead.findMany({
      where: {
        tenantId, source: 'SITE', deletedAt: null, createdAt: { gte: since },
        OR: [{ metadata: { path: ['siteKind'], equals: 'financing' } }, { metadata: { path: ['siteKind'], equals: 'private_financing' } }, { metadata: { path: ['intent'], equals: 'simulacao' } }],
      },
      select: { id: true, leadNumber: true, name: true, phone: true, email: true, status: true, createdAt: true, vehicleId: true, assignedToUserId: true, metadata: true },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
    const vIds = [...new Set(rows.map((r) => r.vehicleId).filter((x): x is string => !!x))]
    const uIds = [...new Set(rows.map((r) => r.assignedToUserId).filter((x): x is string => !!x))]
    const [cars, users] = await Promise.all([
      vIds.length ? prisma.vehicle.findMany({ where: { tenantId, id: { in: vIds } }, select: { id: true, brand: true, model: true, version: true, year: true, modelYear: true, salePrice: true } }) : [],
      uIds.length ? prisma.user.findMany({ where: { id: { in: uIds } }, select: { id: true, name: true } }) : [],
    ])
    const car = new Map(cars.map((c) => [c.id, { title: vehicleTitle(c), price: c.salePrice == null ? null : Number(c.salePrice) }]))
    const who = new Map(users.map((u) => [u.id, u.name]))
    const data = rows.map((r) => {
      const m = (r.metadata && typeof r.metadata === 'object' ? r.metadata : {}) as { siteKind?: string; details?: Record<string, string>; tracking?: Record<string, string> }
      const d = m.details ?? {}
      return {
        id: r.id, protocol: r.leadNumber ? `#${r.leadNumber}` : null, name: r.name, phone: r.phone, email: r.email,
        status: r.status, createdAt: r.createdAt, owner: r.assignedToUserId ? who.get(r.assignedToUserId) ?? null : null,
        vehicle: r.vehicleId ? car.get(r.vehicleId) ?? null : null,
        private: (m as { siteKind?: string }).siteKind === 'private_financing',
        privateVehicle: [d.brand, d.model, d.year].filter(Boolean).join(' ') + (d.vehicleValue ? ` · ${d.vehicleValue}` : ''),
        details: { paymentMethod: d.paymentMethod ?? '', downPayment: d.downPayment ?? '', installments: d.installments ?? '', installmentGoal: d.installmentGoal ?? '', hasTrade: d.hasTrade ?? '', tradeVehicle: d.tradeVehicle ?? '', desiredVehicle: d.desiredVehicle ?? '' },
        campaign: [m.tracking?.utmSource, m.tracking?.utmCampaign].filter(Boolean).join(' / '),
      }
    })
    const open = data.filter((x) => !['CONVERTED', 'LOST', 'DISCARDED'].includes(x.status)).length
    const converted = data.filter((x) => x.status === 'CONVERTED').length
    return NextResponse.json({ success: true, data: { days, items: data, totals: { total: data.length, open, converted, withTrade: data.filter((x) => /^s/i.test(x.details.hasTrade)).length } } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
