// =============================================================================
// GET /api/crm/leads/[id]/deals/search?q= — busca negociações para vincular ao
// lead: número da negociação, nome/CPF/telefone do cliente, placa ou veículo.
// Mesmo escopo da tela de Negociações (vendedor só vê as dele). Gate: crm.deal.link.
// =============================================================================

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.deal.link')) return forbiddenResponse('Sem permissão para vincular negociações.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80)
  if (q.length < 2) return NextResponse.json({ success: true, data: [] })

  const digits = q.replace(/\D/g, '')
  const plate = q.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const or: Prisma.DealWhereInput[] = [
    { dealNumber: { contains: q, mode: 'insensitive' } },
    { customer: { name: { contains: q, mode: 'insensitive' } } },
    { vehicles: { some: { OR: [
      { brand: { contains: q, mode: 'insensitive' } },
      { model: { contains: q, mode: 'insensitive' } },
      ...(plate.length >= 3 ? [{ plate: { contains: plate, mode: 'insensitive' as const } }, { plate: { contains: plate.length > 3 ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate, mode: 'insensitive' as const } }] : []),
    ] } } },
  ]
  // CPF/telefone: só dígitos (com e sem máscara no cadastro).
  if (digits.length >= 4) {
    or.push({ customer: { cpf: { contains: digits } } })
    or.push({ customer: { phone: { contains: digits.slice(-8) } } })
    if (digits.length === 11) or.push({ customer: { cpf: { contains: `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}` } } })
  }

  const linked = await prisma.crmLeadDeal.findMany({ where: { tenantId, leadId: id }, select: { dealId: true } }).catch(() => [])
  const where = await buildNegotiationAccessWhere(user, { tenantId, OR: or, ...(linked.length ? { id: { notIn: linked.map((l) => l.dealId) } } : {}) })
  const deals = await prisma.deal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      id: true, dealNumber: true, status: true, type: true, createdAt: true,
      customer: { select: { name: true, cpf: true } },
      vehicles: { select: { plate: true, brand: true, model: true, year: true, role: true }, take: 3 },
    },
  })
  return NextResponse.json({
    success: true,
    data: deals.map((d) => {
      const v = d.vehicles.find((x) => x.role === 'VENDIDO') ?? d.vehicles[0]
      return {
        id: d.id, number: d.dealNumber ?? `NEG-${d.id.slice(-8)}`, status: d.status, type: d.type, createdAt: d.createdAt,
        customer: d.customer?.name ?? null,
        // CPF mascarado: só os 2 últimos dígitos (identifica sem expor).
        cpf: d.customer?.cpf ? `•••.•••.•••-${d.customer.cpf.replace(/\D/g, '').slice(-2)}` : null,
        vehicle: v ? [v.brand, v.model, v.year].filter(Boolean).join(' ') || null : null,
        plate: v?.plate ?? null,
      }
    }),
  })
}
