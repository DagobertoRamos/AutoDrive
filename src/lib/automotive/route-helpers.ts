// Utilitários das rotas de operações: usuário/loja, ator e erro amigável.
import { NextResponse } from 'next/server'
import { getSessionUser, type SessionUser } from '@/lib/auth-guards'
import { opsCan, type OpsPermission } from './access'
import { OpsError, type Actor } from './operations'

export interface OpsSession { user: SessionUser; tenantId: string | null; actor: Actor }

/** Sessão + loja (MASTER = null: enxerga todas, como no resto do sistema). */
export async function opsSession(): Promise<OpsSession | NextResponse> {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ success: false, error: 'Não autenticado.' }, { status: 401 })
  const tenantId = user.role === 'MASTER' ? null : user.tenantId ?? null
  if (user.role !== 'MASTER' && !tenantId) return NextResponse.json({ success: false, error: 'Usuário sem loja.' }, { status: 403 })
  return { user, tenantId, actor: { id: user.id, name: user.name ?? null, role: user.role } }
}

export async function requireOps(s: OpsSession, perm: OpsPermission): Promise<NextResponse | null> {
  return (await opsCan(s.user, perm)) ? null : NextResponse.json({ success: false, error: 'Sem permissão para esta ação.' }, { status: 403 })
}

/** Nunca devolve stack, SOAP ou código de provedor cru para a tela. */
export function opsError(err: unknown): NextResponse {
  if (err instanceof OpsError) return NextResponse.json({ success: false, error: err.message, details: err.details ?? undefined }, { status: err.status })
  console.error('[operacoes]', err)
  return NextResponse.json({ success: false, error: 'Não foi possível concluir agora. Tente novamente em instantes.' }, { status: 500 })
}
