// =============================================================================
// POST /api/crm/duplicates/[id]/dismiss — dispensa um candidato à mesclagem
// (marca DISMISSED). Não apaga nem mescla nada. Gate: gestor+.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModuleForUser } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'crm.settings.manage')) return forbiddenResponse('Sem permissão.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  const cand = await prisma.crmMergeCandidate.findFirst({ where: { id, tenantId }, select: { id: true, status: true } }).catch(() => null)
  if (!cand) return NextResponse.json({ success: false, error: 'Candidato não encontrado.' }, { status: 404 })
  await prisma.crmMergeCandidate.update({ where: { id }, data: { status: 'DISMISSED', resolvedByUserId: user.id, resolvedAt: new Date() } })
  return NextResponse.json({ success: true })
}
