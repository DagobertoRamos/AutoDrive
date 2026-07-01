// =============================================================================
// /api/pendencies/open-to-all — chavinha "liberar a Central de Pendências para
// todos os colaboradores da loja". Por padrão o painel é gerente+; ligando aqui,
// aparece para qualquer papel. Gate: gerente geral+ (MASTER/ADM/GERENTE_GERAL).
//   GET  → { open: boolean }
//   POST → { open: boolean }
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { getOpenModules, setModuleOpenToAll } from '@/lib/tenant-modules'

const MODULE = 'pendencies.central'
const CAN_TOGGLE = ['MASTER', 'ADM', 'GERENTE_GERAL']

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return NextResponse.json({ success: true, open: false })
  try {
    const open = (await getOpenModules(tenantId)).includes(MODULE)
    return NextResponse.json({ success: true, open, canToggle: CAN_TOGGLE.includes(user.role) })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!CAN_TOGGLE.includes(user.role)) return forbiddenResponse('Apenas o gerente geral (ou acima) pode liberar o módulo.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  try {
    const body = await req.json().catch(() => ({}))
    await setModuleOpenToAll(tenantId, MODULE, !!body?.open)
    return NextResponse.json({ success: true, open: !!body?.open })
  } catch (err) {
    return handlePrismaError(err)
  }
}
