// Guard e utilidades das rotas da Central de Publicações.
import { after, NextResponse } from 'next/server'
import { createSafeAuditLog, forbiddenResponse, getSessionUser, unauthorizedResponse, type SessionUser } from '@/lib/auth-guards'
import { actingTenantError, resolveActingTenant } from '@/lib/acting-tenant'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import type { Actor } from './service'

export type PubModule = 'marketing.publications' | 'marketing.publications.prepare' | 'marketing.publications.approve' | 'marketing.publications.publish' | 'marketing.publications.connections'

const DENIED: Record<PubModule, string> = {
  'marketing.publications': 'Sem acesso à Central de Publicações.',
  'marketing.publications.prepare': 'Sem permissão para preparar publicações.',
  'marketing.publications.approve': 'Sem permissão para aprovar fotos e conteúdo.',
  'marketing.publications.publish': 'Sem permissão para publicar, pausar ou retirar anúncios.',
  'marketing.publications.connections': 'Sem permissão para administrar as contas dos canais.',
}

export interface PubAuth { user: SessionUser; tenantId: string; actor: Actor }

export async function pubAuth(req: Request, module: PubModule = 'marketing.publications'): Promise<PubAuth | NextResponse> {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, module)) return forbiddenResponse(DENIED[module])
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  return { user, tenantId, actor: { id: user.id, name: user.name, role: user.role } }
}

export async function permissions(user: SessionUser) {
  const [prepare, approve, publish, connections] = await Promise.all([
    canAccessModuleForUser(user, 'marketing.publications.prepare'), canAccessModuleForUser(user, 'marketing.publications.approve'),
    canAccessModuleForUser(user, 'marketing.publications.publish'), canAccessModuleForUser(user, 'marketing.publications.connections'),
  ])
  return { prepare, approve, publish, connections }
}

export function audit(a: PubAuth, action: string, entity: string, entityId: string | null, afterData?: unknown, beforeData?: unknown) {
  return createSafeAuditLog({ userId: a.user.id, tenantId: a.tenantId, action, entity, entityId, userName: a.user.name, userRole: a.user.role, afterData, beforeData })
}

export const bad = (message: string, status = 400) => NextResponse.json({ success: false, error: message }, { status })

/** Processa a fila logo depois da resposta (o cron garante o resto). */
export function kickWorker() {
  try {
    after(async () => {
      const { runWorker } = await import('./worker')
      await runWorker({ maxJobs: 15, deadlineMs: 45_000 }).catch((e) => console.error('[publications] worker (after)', e))
    })
  } catch { /* fora de requisição (testes/scripts) */ }
}
