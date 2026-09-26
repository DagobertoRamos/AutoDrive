// =============================================================================
// /api/partner-stores — Lojas parceiras da loja (origem PARTNER do veículo).
//   GET  ?ativos=1&q=   lista (com contagem de carros ativos)
//   POST { name, ... }  cria  (gate: registrations.vehicles)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { partnerStoreData } from '@/lib/stock/partner-stores'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock')) return forbiddenResponse()
  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const onlyActive = req.nextUrl.searchParams.get('ativos') === '1'
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
    const rows = await prisma.partnerStore.findMany({
      where: {
        ...tenantWhere(user.role, tenantId),
        ...(onlyActive ? { active: true } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { city: { contains: q, mode: 'insensitive' as const } }] } : {}),
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { vehicles: { where: { active: true } } } } },
    })
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'registrations.vehicles')) return forbiddenResponse('Sem permissão para cadastrar lojas parceiras.')
  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    if (!tenantId) return NextResponse.json({ success: false, error: 'Entre na loja para cadastrar parceiros.' }, { status: 400 })
    const parsed = partnerStoreData(await req.json().catch(() => ({})))
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    const dup = await prisma.partnerStore.findFirst({ where: { tenantId, name: { equals: parsed.data.name, mode: 'insensitive' } }, select: { id: true } })
    if (dup) return NextResponse.json({ success: false, error: 'Já existe uma loja parceira com esse nome.' }, { status: 409 })
    const row = await prisma.partnerStore.create({ data: { ...parsed.data, tenantId } })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'PartnerStore', entityId: row.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
