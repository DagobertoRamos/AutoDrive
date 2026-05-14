// =============================================================================
// Rota temporária para diagnosticar sessão NextAuth.
// REMOVER antes do deploy de produção.
// Acesse logado: http://localhost:3000/api/debug/session
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as Record<string, unknown> | undefined

  return NextResponse.json({
    authenticated: Boolean(session),
    session,
    userKeys: user ? Object.keys(user) : [],
    id: user?.id ?? 'NOT PRESENT',
    email: user?.email ?? 'NOT PRESENT',
    role: user?.role ?? 'NOT PRESENT',
    tenantId: user?.tenantId ?? 'NOT PRESENT',
    diagnostic: {
      hasTenantIdField: user ? Object.prototype.hasOwnProperty.call(user, 'tenantId') : false,
      hasRoleField: user ? Object.prototype.hasOwnProperty.call(user, 'role') : false,
      message:
        user?.tenantId === undefined
          ? 'tenantId não está presente na sessão. Verifique callbacks jwt/session em src/lib/auth.ts.'
          : 'tenantId está presente na sessão.',
    },
  })
}
