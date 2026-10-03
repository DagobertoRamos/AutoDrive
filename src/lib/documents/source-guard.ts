// Autorização das rotas /api/documents/source (origem de dados do gerador de documentos).
import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, tenantWhere, type SessionUser } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function guardDocuments(): Promise<{ error: NextResponse } | { user: SessionUser; scope: Record<string, unknown> }> {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() }
  if (!canAccessModule(user.role, 'documents')) return { error: forbiddenResponse() }
  const gate = await assertModuleEnabled(user, 'documents')
  if (gate) return { error: gate }
  if (user.role !== 'MASTER' && !user.tenantId) return { error: forbiddenResponse('Usuário sem empresa vinculada.') }
  // MASTER dentro de uma loja vê a loja; sem loja, vê tudo.
  const scope = user.tenantId ? { tenantId: user.tenantId } : tenantWhere(user.role, null)
  return { user, scope }
}
