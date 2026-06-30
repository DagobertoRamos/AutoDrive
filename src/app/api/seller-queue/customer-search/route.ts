// =============================================================================
// GET /api/seller-queue/customer-search?q=... — busca anti-duplicação.
// Procura nas bases (Customer + MarketingLead) por nome, telefone ou e-mail e
// devolve os matches para o vendedor REAPROVEITAR o cadastro em vez de duplicar.
// Gate: sellerQueue.view. Tenant-scoped. Mínimo 3 caracteres.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 3) return NextResponse.json({ success: true, data: [] })

  const digits = q.replace(/\D/g, '')
  try {
    const orC: Record<string, unknown>[] = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
    ]
    if (digits.length >= 4) orC.push({ phone: { contains: digits.slice(-8) } }, { cpf: { contains: digits } })

    const orL: Record<string, unknown>[] = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
    ]
    if (digits.length >= 4) orL.push({ phone: { contains: digits.slice(-8) } })

    const [customers, leads] = await Promise.all([
      prisma.customer.findMany({ where: { tenantId, OR: orC }, select: { id: true, name: true, phone: true, email: true }, take: 8, orderBy: { updatedAt: 'desc' } }),
      prisma.marketingLead.findMany({ where: { tenantId, OR: orL }, select: { id: true, name: true, phone: true, email: true, customerId: true, status: true }, take: 8, orderBy: { lastContactAt: 'desc' } }),
    ])

    // Unifica: cliente tem prioridade; lead já vinculado a um cliente listado é omitido.
    const customerIds = new Set(customers.map((c) => c.id))
    const results = [
      ...customers.map((c) => ({ source: 'customer' as const, customerId: c.id, leadId: null as string | null, name: c.name, phone: c.phone, email: c.email, status: null as string | null })),
      ...leads.filter((l) => !(l.customerId && customerIds.has(l.customerId))).map((l) => ({ source: 'lead' as const, customerId: l.customerId, leadId: l.id, name: l.name, phone: l.phone, email: l.email, status: l.status as string | null })),
    ].slice(0, 10)

    return NextResponse.json({ success: true, data: results })
  } catch (err) {
    return handlePrismaError(err)
  }
}
