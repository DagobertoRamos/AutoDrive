// =============================================================================
// /api/financing/my-permissions — capacidades F&I efetivas do usuário atual.
// Reaproveita isFiAllowed (RBAC base + Permissões F&I da loja). Serve apenas
// para a UI ocultar/desabilitar ações; o bloqueio real é no servidor de cada
// rota. Read-only, gated 'financing'.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { isFiAllowed } from '@/lib/finance/fi-permissions'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'financing')) return forbiddenResponse('Sem acesso ao financiamento.')

  try {
    // Capacidades de configuração exigem financing.config (e não MASTER p/ alterar retorno da loja).
    const canConfig = canAccessModule(user.role, 'financing.config') && user.role !== 'MASTER' && !!user.tenantId
    const canManage = canAccessModule(user.role, 'financing.manage')
    const [enviarFicha, aprovar, alterarRetorno] = await Promise.all([
      canManage ? isFiAllowed(user.tenantId, 'enviarFicha', user.role) : Promise.resolve(false),
      canManage ? isFiAllowed(user.tenantId, 'aprovar', user.role) : Promise.resolve(false),
      canConfig ? isFiAllowed(user.tenantId, 'alterarRetorno', user.role) : Promise.resolve(false),
    ])
    return NextResponse.json({ success: true, data: { enviarFicha, aprovar, alterarRetorno } })
  } catch (err) {
    return handlePrismaError(err)
  }
}
