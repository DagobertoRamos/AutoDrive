// =============================================================================
// GET /api/crm/stock-search?q= — carros do estoque à venda para o CRM
// (veículo de interesse do lead). Busca por placa, marca, modelo ou versão.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModuleForUser } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

const FOR_SALE = ['DISPONIVEL', 'EM_PROMOCAO', 'EM_SERVICO', 'EM_PRECIFICACAO', 'PENDENTE_PREPARACAO', 'PENDENTE_DOCUMENTACAO', 'EM_NEGOCIACAO', 'RESERVADO']

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 4)
  const plate = q.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const rows = await prisma.vehicle.findMany({
    where: {
      tenantId, active: true, stockStatus: { in: FOR_SALE as never[] },
      ...(terms.length ? {
        AND: terms.map((t) => ({
          OR: [
            { brand: { contains: t, mode: 'insensitive' as const } },
            { model: { contains: t, mode: 'insensitive' as const } },
            { version: { contains: t, mode: 'insensitive' as const } },
            ...(plate.length >= 3 && terms.length === 1 ? [{ plate: { contains: plate, mode: 'insensitive' as const } }] : []),
          ],
        })),
      } : {}),
    },
    select: { id: true, brand: true, model: true, version: true, modelYear: true, plate: true, salePrice: true, mainPhotoUrl: true },
    orderBy: { createdAt: 'desc' },
    take: 12,
  })
  return NextResponse.json({ success: true, data: rows.map((v) => ({ ...v, salePrice: v.salePrice == null ? null : Number(v.salePrice) })) })
}
