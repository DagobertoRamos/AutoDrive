// =============================================================================
// /api/suppliers — fornecedores/prestadores (oficinas, funilaria, estética,
// despachante, peças, laudos…). GET ?ativos=1&q=  ·  POST { name, kind, ... }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, tenantWhere, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModule } from '@/lib/permissions'
import { supplierData } from '@/lib/stock/suppliers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock') && !canAccessModule(user.role, 'finance')) return forbiddenResponse()
  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    const sp = req.nextUrl.searchParams
    const q = (sp.get('q') ?? '').trim()
    const rows = await prisma.supplier.findMany({
      where: {
        ...tenantWhere(user.role, tenantId),
        ...(sp.get('ativos') === '1' ? { active: true } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { city: { contains: q, mode: 'insensitive' as const } }] } : {}),
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { services: { where: { status: 'EM_SERVICO' } } } } },
    })
    return NextResponse.json({ success: true, data: rows })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'stock.manage') && !canAccessModule(user.role, 'finance')) return forbiddenResponse('Sem permissão para cadastrar fornecedores.')
  try {
    const tenantId = assertTenantId(user.tenantId, user.role)
    if (!tenantId) return NextResponse.json({ success: false, error: 'Entre na loja para cadastrar fornecedores.' }, { status: 400 })
    const parsed = supplierData(await req.json().catch(() => ({})))
    if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 })
    const dup = await prisma.supplier.findFirst({ where: { tenantId, name: { equals: parsed.data.name, mode: 'insensitive' } }, select: { id: true } })
    if (dup) return NextResponse.json({ success: false, error: 'Já existe um fornecedor com esse nome.' }, { status: 409 })
    const row = await prisma.supplier.create({ data: { ...parsed.data, tenantId } })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'Supplier', entityId: row.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: row }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
