// =============================================================================
// master-guards.ts — Helpers centrais de autorização para o Painel Master
//
// REGRA CENTRAL: apenas usuários com role MASTER podem acessar o Painel Master.
// O MASTER administra a plataforma inteira, não um tenant específico.
// Toda ação sensível do MASTER deve ser auditada via logMasterAction().
//
// Importe daqui — NUNCA reimplemente a verificação de MASTER nas rotas.
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession }           from '@/lib/auth'
import { prisma }                         from '@/lib/prisma'

// ── Tipo do usuário MASTER na sessão ─────────────────────────────────────────

export interface MasterSession {
  id:       string
  name:     string
  email:    string
  role:     'MASTER'
  tenantId: null
}

// ── Verificação simples (boolean) ─────────────────────────────────────────────

/**
 * Retorna true se o role informado é MASTER.
 */
export function isMaster(role: string | undefined): role is 'MASTER' {
  return role === 'MASTER'
}

// ── Obter sessão MASTER verificada ───────────────────────────────────────────

/**
 * Obtém a sessão e verifica que o usuário é MASTER.
 * Retorna null se não autenticado ou sem permissão.
 */
export async function getMasterSession(): Promise<MasterSession | null> {
  const session = await getServerAuthSession()
  if (!session?.user) return null
  if (session.user.role !== 'MASTER') return null
  return session.user as MasterSession
}

// ── Resposta padrão de acesso negado ─────────────────────────────────────────

/**
 * Retorna NextResponse 403 padronizado para rotas Master.
 * Registra a tentativa de acesso indevido em auditLog quando possível.
 */
export function masterOnlyResponse(
  message = 'Apenas usuários MASTER podem acessar esta área.',
): NextResponse {
  return NextResponse.json(
    { success: false, error: message },
    { status: 403 },
  )
}

// ── Guard principal — use no início de cada route handler ────────────────────

/**
 * Verifica se a sessão é MASTER.
 * Retorna { session } se autorizado, ou { error: NextResponse } para retornar.
 *
 * @example
 * const guard = await requireMaster()
 * if (guard.error) return guard.error
 * const { session } = guard
 */
export async function requireMaster(): Promise<
  | { session: MasterSession; error: null }
  | { session: null; error: NextResponse }
> {
  const session = await getMasterSession()

  if (!session) {
    const raw = await getServerAuthSession()
    if (!raw?.user) {
      return {
        session: null,
        error: NextResponse.json(
          { success: false, error: 'Não autenticado.' },
          { status: 401 },
        ),
      }
    }
    // Autenticado mas não é MASTER
    void prisma.auditLog.create({
      data: {
        userId:   raw.user.id,
        userName: raw.user.name,
        userRole: raw.user.role,
        action:   'UNAUTHORIZED_MASTER_ACCESS',
        entity:   'System',
        status:   'BLOCKED',
      },
    }).catch(() => { /* audit never blocks */ })

    return { session: null, error: masterOnlyResponse() }
  }

  return { session, error: null }
}

// ── Log de ação MASTER ────────────────────────────────────────────────────────

/**
 * Registra uma ação do MASTER em auditLog.
 * Nunca lança exceção — falhas de audit nunca bloqueiam a operação.
 *
 * @param session   Sessão MASTER verificada
 * @param action    Ex: 'CREATE_PLAN', 'BAN_TENANT', 'IMPERSONATE_USER'
 * @param entity    Ex: 'Plan', 'Tenant', 'User'
 * @param entityId  ID da entidade afetada
 * @param extra     Campos adicionais (tenantId, beforeData, afterData, reason...)
 */
export async function logMasterAction(
  session: MasterSession,
  action: string,
  entity: string,
  entityId?: string | null,
  extra?: {
    tenantId?:   string | null
    beforeData?: Record<string, unknown>
    afterData?:  Record<string, unknown>
    reason?:     string
    req?:        NextRequest
  },
): Promise<void> {
  try {
    const ipAddress = extra?.req
      ? (extra.req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
         extra.req.headers.get('x-real-ip') ??
         undefined)
      : undefined

    const userAgent = extra?.req?.headers.get('user-agent') ?? undefined

    await prisma.auditLog.create({
      data: {
        userId:      session.id,
        userName:    session.name,
        userRole:    'MASTER',
        tenantId:    extra?.tenantId ?? null,
        action,
        entity,
        entityId:    entityId ?? null,
        beforeData:  (extra?.beforeData ?? undefined) as never,
        afterData:   (extra?.afterData  ?? undefined) as never,
        ipAddress:   ipAddress ?? null,
        userAgent:   userAgent ?? null,
        status:      'SUCCESS',
      },
    })
  } catch (err) {
    console.error('[master-guards] Failed to write master audit log:', err)
  }
}

// ── Helper: SystemSetting upsert ─────────────────────────────────────────────

/**
 * Salva/atualiza uma configuração global da plataforma.
 * Usado para WhatsApp, email, identity e outras configs via key-value.
 */
export async function upsertSystemSetting(
  key:          string,
  value:        string,
  group:        string,
  updatedById:  string,
  description?: string,
): Promise<void> {
  await prisma.systemSetting.upsert({
    where:  { key },
    create: { key, value, group, description, updatedByUserId: updatedById },
    update: { value, group, updatedByUserId: updatedById },
  })
}

/**
 * Lê múltiplas configurações de um grupo como objeto key→value.
 */
export async function getSettingGroup(group: string): Promise<Record<string, string>> {
  const settings = await prisma.systemSetting.findMany({
    where: { group },
    select: { key: true, value: true },
  })
  return Object.fromEntries(settings.map(s => [s.key, s.value]))
}
