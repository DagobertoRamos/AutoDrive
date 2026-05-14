// =============================================================================
// auth-guards.ts — Helpers centrais de autorização e isolamento multi-tenant
// Importe aqui, não reimplemente nas rotas individualmente.
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { type UserRole } from '@/types'

// ── Conjuntos de roles ────────────────────────────────────────────────────────

/** Roles que podem criar/editar entidades (vendedores, unidades, serviços, etc.) */
export const MANAGEMENT_ROLES: UserRole[] = [
  'MASTER',
  'ADM',
  'GERENTE_GERAL',
  'GERENTE',
]

/** Roles administrativas — operações sensíveis (excluir, auditar, configurar) */
export const ADMIN_ROLES: UserRole[] = ['MASTER', 'ADM', 'GERENTE_GERAL']

// ── Tipo do usuário de sessão ─────────────────────────────────────────────────

export interface SessionUser {
  id:       string
  name:     string
  email:    string
  role:     UserRole
  status:   string
  unitId:   string | null
  tenantId: string | null
}

// ── Obter usuário autenticado ─────────────────────────────────────────────────

/**
 * Retorna o usuário da sessão ou null se não autenticado.
 * Tipado com os campos extras do sistema (role, tenantId, etc.).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerAuthSession()
  if (!session?.user) return null
  return session.user as SessionUser
}

// ── Validação de tenantId ─────────────────────────────────────────────────────

/**
 * Garante que usuários comuns tenham tenantId.
 * MASTER retorna null (opera globalmente).
 * Qualquer outra role sem tenantId lança erro.
 *
 * @throws Error com mensagem amigável se role !== MASTER e tenantId ausente
 */
export function assertTenantId(
  tenantId: string | null | undefined,
  role: UserRole,
): string | null {
  if (role === 'MASTER') return null
  if (!tenantId) {
    throw new Error(
      'Usuário sem empresa vinculada. Entre em contato com o administrador.',
    )
  }
  return tenantId
}

// ── Verificação de roles ──────────────────────────────────────────────────────

/** Retorna true se o role está na lista de roles permitidos */
export function hasRole(role: UserRole, allowed: UserRole[]): boolean {
  return allowed.includes(role)
}

// ── Filtro Prisma com isolamento de tenant ────────────────────────────────────

/**
 * Constrói o objeto `where` do Prisma com isolamento por tenant.
 *
 * MASTER → sem filtro de tenant (vê tudo)
 * Demais → filtra por tenantId obrigatório
 *
 * @param role       Role do usuário autenticado
 * @param tenantId   tenantId da sessão (null para MASTER)
 * @param extra      Filtros adicionais (ex: { active: true }, { unitId: 'x' })
 */
export function tenantWhere(
  role: UserRole,
  tenantId: string | null,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const base: Record<string, unknown> =
    role === 'MASTER' ? {} : { tenantId: tenantId! }
  return { ...base, ...extra }
}

// ── Respostas padronizadas de erro de autenticação ────────────────────────────

export function unauthorizedResponse() {
  return NextResponse.json(
    { success: false, error: 'Não autenticado.' },
    { status: 401 },
  )
}

export function forbiddenResponse(message = 'Acesso não permitido.') {
  return NextResponse.json(
    { success: false, error: message },
    { status: 403 },
  )
}

// ── Validação de unitId contra tenantId ──────────────────────────────────────

/**
 * Verifica se a unitId pertence ao tenant do usuário.
 * MASTER ignora verificação (pode criar em qualquer unidade).
 *
 * @throws Error com mensagem amigável se a unidade não pertencer ao tenant
 */
export async function assertUnitBelongsToTenant(
  unitId: string,
  tenantId: string | null,
  role: UserRole,
): Promise<void> {
  if (role === 'MASTER') return  // MASTER opera globalmente

  const unit = await prisma.unit.findFirst({
    where: { id: unitId, tenantId: tenantId! },
    select: { id: true },
  })

  if (!unit) {
    throw new Error(
      'Unidade inválida ou não vinculada à sua empresa.',
    )
  }
}

// ── Audit log não bloqueante ──────────────────────────────────────────────────

/**
 * Cria um registro de audit log sem nunca lançar exceção.
 * Falhas de audit NUNCA devem interromper a operação principal.
 */
export async function createSafeAuditLog(data: {
  userId:   string
  tenantId?: string | null
  action:   string
  entity:   string
  entityId?: string | null
  userName?: string | null
  userRole?: string | null
  status?:  string
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId:   data.userId,
        tenantId: data.tenantId  ?? null,
        action:   data.action,
        entity:   data.entity,
        entityId: data.entityId ?? null,
        userName: data.userName ?? null,
        userRole: data.userRole ?? null,
        status:   data.status   ?? 'SUCCESS',
      },
    })
  } catch (err) {
    // Audit failures are logged server-side but never propagated
    console.error('[audit] Failed to write audit log:', err)
  }
}
