// =============================================================================
// CRM Config F1 — Etiqueta: PATCH (editar/ativar) · DELETE (desativar, não
// apaga se já usada). Gate: crm.settings.manage. Tenant-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { canAccessModuleForUser } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

async function guard(req: Request) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() }
  if (!await canAccessModuleForUser(user, 'crm.settings.manage')) return { error: forbiddenResponse('Sem permissão para configurar o CRM.') }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return { error: forbiddenResponse(actingTenantError(user)) }
  return { user, tenantId }
}

export async function PATCH(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const g = await guard(req); if ('error' in g) return g.error
  try {
    const existing = await prisma.crmTag.findFirst({ where: { id, tenantId: g.tenantId }, select: { id: true } })
    if (!existing) return NextResponse.json({ success: false, error: 'Etiqueta não encontrada.' }, { status: 404 })
    const b = await req.json().catch(() => ({}))
    const data: Record<string, unknown> = {}
    if (typeof b?.name === 'string' && b.name.trim()) data.name = b.name.trim().slice(0, 60)
    if (typeof b?.color === 'string') data.color = /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : null
    if ('description' in b) data.description = b.description ? String(b.description).slice(0, 200) : null
    if ('category' in b) data.category = b.category ? String(b.category).slice(0, 40) : null
    if (typeof b?.active === 'boolean') data.active = b.active
    const tag = await prisma.crmTag.update({ where: { id }, data })
    return NextResponse.json({ success: true, data: tag })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const g = await guard(req); if ('error' in g) return g.error
  try {
    const tag = await prisma.crmTag.findFirst({ where: { id, tenantId: g.tenantId }, select: { id: true } })
    if (!tag) return NextResponse.json({ success: false, error: 'Etiqueta não encontrada.' }, { status: 404 })
    // Não apaga se já usada — apenas desativa (preserva histórico).
    const used = await prisma.crmLeadTag.count({ where: { tagId: id } })
    if (used > 0) {
      await prisma.crmTag.update({ where: { id }, data: { active: false } })
      return NextResponse.json({ success: true, data: { deactivated: true } })
    }
    await prisma.crmTag.delete({ where: { id } })
    return NextResponse.json({ success: true, data: { deleted: true } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
