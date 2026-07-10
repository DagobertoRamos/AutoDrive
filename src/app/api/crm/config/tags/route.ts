// =============================================================================
// CRM Config F1 — Etiquetas (tags). GET lista (gate: crm) · POST cria
// (gate: crm.settings.manage). Tenant-scoped. Tolerante a migration pendente.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm')) return forbiddenResponse('Sem acesso ao CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const includeInactive = new URL(req.url).searchParams.get('includeInactive') === '1'
  const data = await prisma.crmTag.findMany({
    where: { tenantId, ...(includeInactive ? {} : { active: true }) },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  }).catch(() => [])
  return NextResponse.json({ success: true, data })
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.settings.manage')) return forbiddenResponse('Sem permissão para configurar o CRM.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const b = await req.json().catch(() => ({}))
    const name = String(b?.name ?? '').trim().slice(0, 60)
    if (!name) return NextResponse.json({ success: false, error: 'Informe o nome da etiqueta.' }, { status: 400 })
    const color = typeof b?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : null
    const tag = await prisma.crmTag.create({
      data: { tenantId, name, color, description: b?.description ? String(b.description).slice(0, 200) : null, category: b?.category ? String(b.category).slice(0, 40) : null, active: true },
    })
    return NextResponse.json({ success: true, data: tag }, { status: 201 })
  } catch (err) {
    return handlePrismaError(err)
  }
}
