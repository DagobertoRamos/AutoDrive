// =============================================================================
// /api/settings/financing/return-config — faixa, ILA mensal e IOF por vigência.
// Tenant-scoped via SystemSetting. Snapshot do cálculo fica em tabela própria.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { isFiAllowed } from '@/lib/finance/fi-permissions'
import { getReturnSettingsBundle, saveReturnSettingsBundle } from '@/lib/finance/return-settings'
import { returnSettingsSchema } from '@/lib/validators/financing'
import { zodErrorResponse } from '@/lib/finance/finance-service'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem acesso às configurações de F&I.')
  { const gate = await assertModuleEnabled(user, 'financing.config'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    const data = await getReturnSettingsBundle(tenantId)
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing.config')) return forbiddenResponse('Sem permissão para configurar retorno.')
  { const gate = await assertModuleEnabled(user, 'financing.config'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  if (!(await isFiAllowed(tenantId, 'alterarRetorno', user.role))) {
    return forbiddenResponse('Seu perfil não pode alterar retorno (Permissões F&I da loja).')
  }

  try {
    const input = returnSettingsSchema.parse(await req.json())
    const before = await getReturnSettingsBundle(tenantId)
    const data = await saveReturnSettingsBundle(tenantId, input, user.id)
    await createSafeAuditLog({
      userId: user.id,
      tenantId,
      action: 'UPDATE',
      entity: 'ReturnSettings',
      entityId: tenantId,
      beforeData: before,
      afterData: data,
      userName: user.name,
      userRole: user.role,
    })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
