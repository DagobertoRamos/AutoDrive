// =============================================================================
// GET /api/me/modules — funcionalidades DESABILITADAS para a loja do usuário.
// Usado pelo menu (Sidebar) para esconder itens que o MASTER desligou.
// MASTER vê tudo (lista vazia).
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { getDisabledModules } from '@/lib/tenant-modules'
import { handlePrismaError } from '@/lib/prisma-errors'

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (user.role === 'MASTER' || !user.tenantId) return NextResponse.json({ success: true, disabled: [] })
  try {
    return NextResponse.json({ success: true, disabled: await getDisabledModules(user.tenantId) })
  } catch (err) {
    return handlePrismaError(err)
  }
}
