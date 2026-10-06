// =============================================================================
// Apoio das rotas do Centro Financeiro (lançamentos, transferências,
// recorrências, anexos) e das rotas antigas de /api/finance/*.
// =============================================================================

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionUser, type SessionUser } from '@/lib/auth-guards'
import { financeGuard, type FinancePermission } from '@/lib/finance/access'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { tenantRefError } from '@/lib/finance/tenant-refs'

export const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status })

/**
 * Guarda das rotas antigas (/api/finance/entries, receivables, sync, vehicles):
 * mesma regra do financeGuard (papel + liberação individual + módulo da loja).
 * MASTER sem loja escolhida continua no modo global (tenantId null), como antes;
 * com loja escolhida no seletor, opera nela.
 */
export async function legacyFinanceGuard(perm: FinancePermission, req?: Request):
  Promise<{ user: SessionUser; tenantId: string | null; error?: undefined } | { error: NextResponse; user?: undefined; tenantId?: undefined }> {
  const g = await financeGuard(perm, req)
  if (!g.error) return { user: g.user, tenantId: g.tenantId }
  if (g.error.status === 400) {
    const user = await getSessionUser()
    if (user?.role === 'MASTER') return { user, tenantId: null }
  }
  return { error: g.error }
}

/** Escopo de loja para consultas: MASTER global (null) vê tudo. */
export const scope = (tenantId: string | null) => (tenantId ? { tenantId } : {})

/** O usuário vê/lança folha (lançamentos com colaborador)? */
export async function canPayroll(user: SessionUser): Promise<boolean> {
  return canAccessModuleForUser(user, 'finance.payroll')
}

export async function canManage(user: SessionUser): Promise<boolean> {
  return canAccessModuleForUser(user, 'finance.manage')
}

/** Filtro que esconde a folha de quem não tem finance.payroll. */
export const payrollFilter = (allowed: boolean): Prisma.FinancialEntryWhereInput => (allowed ? {} : { employeeUserId: null })

export interface CenterRefs {
  accountId?: string | null
  categoryId?: string | null
  costCenterId?: string | null
  supplierId?: string | null
  employeeUserId?: string | null
}

/** Valida que conta, categoria, centro de custo, fornecedor e colaborador são da loja. */
export async function centerRefError(tenantId: string | null, refs: CenterRefs): Promise<string | null> {
  if (!tenantId) return null
  const base = await tenantRefError(tenantId, { accountId: refs.accountId, categoryId: refs.categoryId })
  if (base) return base
  if (refs.costCenterId && !(await prisma.financialCostCenter.findFirst({ where: { id: refs.costCenterId, tenantId }, select: { id: true } }))) return 'Centro de custo inválido.'
  if (refs.supplierId && !(await prisma.supplier.findFirst({ where: { id: refs.supplierId, tenantId }, select: { id: true } }))) return 'Fornecedor inválido.'
  if (refs.employeeUserId && !(await prisma.user.findFirst({ where: { id: refs.employeeUserId, tenantId }, select: { id: true } }))) return 'Colaborador inválido.'
  return null
}

/** Categoria precisa ser do mesmo tipo do lançamento. */
export async function categoryKindError(categoryId: string | null | undefined, type: 'RECEITA' | 'DESPESA'): Promise<string | null> {
  if (!categoryId) return null
  const c = await prisma.financialCategory.findUnique({ where: { id: categoryId }, select: { kind: true } })
  if (c && c.kind !== type) return type === 'DESPESA' ? 'Escolha uma categoria de despesa.' : 'Escolha uma categoria de receita.'
  return null
}

/** Nome do fornecedor (vira a contraparte quando não há texto). */
export async function supplierName(supplierId: string | null | undefined): Promise<string | null> {
  if (!supplierId) return null
  const s = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { name: true } })
  return s?.name ?? null
}

/**
 * Confere se o lançamento pode ser tocado: da loja efetiva (MASTER global vê
 * tudo) e, se for folha, só com finance.payroll. Retorna a resposta de erro ou null.
 */
export async function entryAccessError(
  entry: { tenantId: string | null; employeeUserId?: string | null } | null,
  g: { user: SessionUser; tenantId: string | null },
): Promise<NextResponse | null> {
  const notFound = bad('Lançamento não encontrado.', 404)
  if (!entry) return notFound
  if (g.tenantId && entry.tenantId !== g.tenantId) return notFound
  if (!g.tenantId && g.user.role !== 'MASTER' && entry.tenantId !== g.user.tenantId) return notFound
  if (entry.employeeUserId && !(await canPayroll(g.user))) return notFound
  return null
}

/** Origens que podem ser apagadas de vez (o resto é cancelado). */
export const DELETABLE_SOURCES = new Set(['MANUAL', 'RECORRENCIA'])
/** Lançamento manual vinculado a uma negociação: origem única por linha (@@unique [dealId, source]). */
export const MANUAL_DEAL_SOURCE_PREFIX = 'MANUAL_NEG_'
export const isDeletableSource = (source: string | null | undefined) => !source || DELETABLE_SOURCES.has(source) || source.startsWith(MANUAL_DEAL_SOURCE_PREFIX)

/** Negociação da loja com o nome do cliente (Person ?? Customer) e o carro vendido. */
export async function dealForEntry(tenantId: string | null, dealId: string): Promise<{ id: string; customer: string | null; vehicleId: string | null } | null> {
  const d = await prisma.deal.findFirst({
    where: { id: dealId, ...(tenantId ? { tenantId } : {}) },
    select: {
      id: true, person: { select: { nomeCompleto: true } }, customer: { select: { name: true } },
      vehicles: { orderBy: { createdAt: 'asc' }, select: { role: true, vehicleId: true } },
    },
  })
  if (!d) return null
  const main = d.vehicles.find((v) => ['VENDIDO', 'COMPRADO', 'CONSIGNADO'].includes(v.role) && v.vehicleId) ?? d.vehicles.find((v) => v.vehicleId)
  return { id: d.id, customer: d.person?.nomeCompleto ?? d.customer?.name ?? null, vehicleId: main?.vehicleId ?? null }
}

export const round2 = (n: number) => Math.round(n * 100) / 100
