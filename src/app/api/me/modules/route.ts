// =============================================================================
// GET /api/me/modules — funcionalidades DESABILITADAS para a loja do usuário.
// Usado pelo menu (Sidebar) para esconder itens que o MASTER desligou.
// MASTER vê tudo (lista vazia).
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { getCrmRoleDiff, getDisabledModules, getUserDeniedModules, getOpenModules, getUserAllowedModules } from '@/lib/tenant-modules'
import { handlePrismaError } from '@/lib/prisma-errors'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (user.role === 'MASTER' || !user.tenantId) return NextResponse.json({ success: true, disabled: [], open: [] })
  try {
    // Esconde do menu: módulos desligados p/ a loja UNIÃO removidos do colaborador.
    // `open` = módulos LIBERADOS p/ todos (chavinha), mesmo sem o papel.
    const [tenantDisabled, userDenied, open, userAllowed, crmRole] = await Promise.all([
      getDisabledModules(user.tenantId),
      getUserDeniedModules(user.id),
      getOpenModules(user.tenantId),
      getUserAllowedModules(user.id),
      getCrmRoleDiff(user.tenantId, user.role),
    ])
    // Regras de permissão do CRM da loja por perfil; a exceção do colaborador vence.
    const crmDeny = crmRole.deny.filter((m) => !userAllowed.includes(m))
    const crmAllow = crmRole.allow.filter((m) => !userDenied.includes(m))
    return NextResponse.json({ success: true, disabled: [...new Set([...tenantDisabled, ...userDenied, ...crmDeny])], open: [...new Set([...open, ...userAllowed, ...crmAllow])] })
  } catch (err) {
    return handlePrismaError(err)
  }
}
