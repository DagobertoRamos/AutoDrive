// =============================================================================
// F&I — guarda comum das rotas: sessão → módulo → loja ativa → capacidade →
// escopo. Toda ação crítica é validada AQUI no servidor (a interface só esconde).
// Ficha de outra loja responde 404 (não confirma que existe).
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, type SessionUser } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { resolveActingTenant } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { isFiAllowed, type FiCapability } from '@/lib/finance/fi-permissions'
import { FiError, type Actor } from './orchestrator'

export interface FiAuthOk { ok: true; user: SessionUser; tenantId: string; actor: Actor }
export type FiAuth = FiAuthOk | { ok: false; res: NextResponse }

export async function fiAuth(req: Request, opts: { module?: 'financing' | 'financing.manage' | 'financing.config'; cap?: FiCapability } = {}): Promise<FiAuth> {
  const user = await getSessionUser()
  if (!user) return { ok: false, res: unauthorizedResponse() }
  const mod = opts.module ?? 'financing'
  if (!canAccessModule(user.role, mod)) return { ok: false, res: forbiddenResponse('Você não tem acesso a esta área do F&I.') }
  const gate = await assertModuleEnabled(user, 'financing')
  if (gate) return { ok: false, res: gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) {
    return { ok: false, res: NextResponse.json({ success: false, error: user.role === 'MASTER' ? 'Escolha a loja no topo da tela para operar o F&I.' : 'Usuário sem loja vinculada.' }, { status: 400 }) }
  }
  if (opts.cap && !(await isFiAllowed(tenantId, opts.cap, user.role))) {
    return { ok: false, res: forbiddenResponse('Seu perfil não tem permissão para esta ação no F&I.') }
  }
  return { ok: true, user, tenantId, actor: { id: user.id, name: user.name ?? null, role: user.role } }
}

/** Vendedor vê só as fichas dele (criadas por ele ou em que é o vendedor). */
export async function proposalScope(user: SessionUser): Promise<Record<string, unknown>> {
  if (user.role !== 'VENDEDOR') return {}
  const seller = await prisma.seller.findUnique({ where: { userId: user.id }, select: { id: true } })
  return { OR: [{ createdById: user.id }, ...(seller ? [{ sellerId: seller.id }] : [])] }
}

/** Carrega a ficha da loja ativa respeitando o escopo; null = 404. */
export async function findScopedProposal(auth: FiAuthOk, id: string) {
  const scope = await proposalScope(auth.user)
  return prisma.financeProposal.findFirst({ where: { id, tenantId: auth.tenantId, ...scope } })
}

export const notFoundFicha = () => NextResponse.json({ success: false, error: 'Ficha não encontrada.' }, { status: 404 })

export function fiErrorResponse(err: unknown) {
  if (err instanceof FiError) {
    return NextResponse.json({ success: false, error: err.message, code: err.code, details: err.details ?? undefined }, { status: err.status })
  }
  if (err instanceof ZodError) return zodErrorResponse(err)
  return handlePrismaError(err)
}

export function clientIp(req: Request): string | null {
  const f = req.headers.get('x-forwarded-for')
  return (f ? f.split(',')[0] : req.headers.get('x-real-ip'))?.trim().slice(0, 64) || null
}
