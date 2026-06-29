// =============================================================================
// GET /api/seller-queue/reasons — motivos cadastrados (Configurações da Fila)
// para uso em outras telas (ex.: negociação). Retorna apenas rótulos (não
// sensível). Qualquer usuário autenticado da loja/unidade pode ler.
// { leadCloseReasons: string[], negotiationReasons: string[] }
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { unitFromRequest, getUnitConfig } from '@/lib/seller-queue/queue'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: true, data: { leadCloseReasons: [], negotiationReasons: [] } })
  try {
    const cfg = await getUnitConfig(tenantId, unitId)
    const c = (cfg?.config as Record<string, unknown> | undefined) ?? {}
    return NextResponse.json({
      success: true,
      data: {
        leadCloseReasons: Array.isArray(c.leadCloseReasons) ? (c.leadCloseReasons as string[]) : [],
        negotiationReasons: Array.isArray(c.negotiationReasons) ? (c.negotiationReasons as string[]) : [],
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
