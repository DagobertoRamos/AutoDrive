// =============================================================================
// GET /api/me/modules — funcionalidades DESABILITADAS para a loja do usuário.
// Usado pelo menu (Sidebar) para esconder itens que o MASTER desligou.
// MASTER vê tudo (lista vazia).
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { getDisabledModules, getUserDeniedModules } from '@/lib/tenant-modules'
import { handlePrismaError } from '@/lib/prisma-errors'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (user.role === 'MASTER' || !user.tenantId) return NextResponse.json({ success: true, disabled: [] })
  try {
    // Esconde do menu: módulos desligados para a loja UNIÃO módulos removidos
    // deste colaborador (override por usuário).
    const [tenantDisabled, userDenied] = await Promise.all([
      getDisabledModules(user.tenantId),
      getUserDeniedModules(user.id),
    ])
    return NextResponse.json({ success: true, disabled: [...new Set([...tenantDisabled, ...userDenied])] })
  } catch (err) {
    return handlePrismaError(err)
  }
}
