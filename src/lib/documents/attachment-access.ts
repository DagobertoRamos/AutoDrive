// =============================================================================
// Acesso aos documentos anexados (DocumentAttachment) — regra única por tipo de
// registro dono. O registro precisa existir e ser da loja do usuário (MASTER vê
// todas); o arquivo é gravado com o tenantId do registro.
//
//   Tipo                                   ver / anexar                                       excluir definitivamente
//   DEAL, DEAL_SERVICE, WARRANTY_SALE,     negociação visível (buildNegotiationAccessWhere)   negotiations.manage (com acesso
//   DEAL_PAYMENT                           OU financeiro (finance) da loja                    à negociação) OU finance.manage
//   VEHICLE, VEHICLE_SERVICE               stock OU finance (como a ficha do veículo)          stock.manage OU finance.manage
//                                          — anexar: stock.manage OU finance.manage
//   SUPPLIER                               stock.manage OU finance (rotas de fornecedor)       stock.manage OU finance.manage
//   PAYROLL (`${userId}:${YYYY-MM}`)       finance.payroll                                     finance.payroll + finance.manage
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenResponse, type SessionUser } from '@/lib/auth-guards'
import { canAccessModuleForUser, assertModuleEnabled } from '@/lib/tenant-modules'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { hasFinanceAccess } from '@/lib/finance/access'
import { parsePayrollEntityId, type DocEntityType } from './attachment-types'

export type DocAccessLevel = 'read' | 'write' | 'delete'

export type DocAccessResult =
  | { ok: true; tenantId: string | null }
  | { ok: false; error: NextResponse }

const notFound = () => ({ ok: false as const, error: NextResponse.json({ success: false, error: 'Registro não encontrado.' }, { status: 404 }) })
const denied = (msg = 'Sem permissão para estes documentos.') => ({ ok: false as const, error: forbiddenResponse(msg) })

const sameTenant = (user: SessionUser, tenantId: string | null | undefined) => user.role === 'MASTER' || (!!user.tenantId && user.tenantId === tenantId)

const can = (user: SessionUser, perm: string) => canAccessModuleForUser(user, perm)

async function negotiationsUsable(user: SessionUser): Promise<boolean> {
  if (!(await can(user, 'negotiations'))) return false
  return (await assertModuleEnabled(user, 'negotiations')) === null
}

async function dealIdOf(entityType: DocEntityType, entityId: string): Promise<string | null> {
  switch (entityType) {
    case 'DEAL': return entityId
    case 'DEAL_SERVICE': return (await prisma.dealService.findUnique({ where: { id: entityId }, select: { dealId: true } }))?.dealId ?? null
    case 'WARRANTY_SALE': return (await prisma.warrantySale.findUnique({ where: { id: entityId }, select: { dealId: true } }))?.dealId ?? null
    case 'DEAL_PAYMENT': return (await prisma.dealPayment.findUnique({ where: { id: entityId }, select: { dealId: true } }))?.dealId ?? null
    default: return null
  }
}

async function dealAccess(user: SessionUser, entityType: DocEntityType, entityId: string, level: DocAccessLevel): Promise<DocAccessResult> {
  const dealId = await dealIdOf(entityType, entityId)
  if (!dealId) return notFound()
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, tenantId: true } })
  if (!deal || !sameTenant(user, deal.tenantId)) return notFound()

  const viaNegotiation = (await negotiationsUsable(user))
    && !!(await prisma.deal.findFirst({ where: await buildNegotiationAccessWhere(user, { id: dealId }), select: { id: true } }))

  if (level === 'delete') {
    if (viaNegotiation && (await can(user, 'negotiations.manage'))) return { ok: true, tenantId: deal.tenantId }
    if (await hasFinanceAccess(user, 'finance.manage')) return { ok: true, tenantId: deal.tenantId }
    return denied('Exclusão permitida só para gestão da negociação ou do financeiro.')
  }
  if (viaNegotiation || (await hasFinanceAccess(user, 'finance'))) return { ok: true, tenantId: deal.tenantId }
  return denied()
}

async function vehicleAccess(user: SessionUser, entityType: DocEntityType, entityId: string, level: DocAccessLevel): Promise<DocAccessResult> {
  let tenantId: string | null | undefined
  if (entityType === 'VEHICLE_SERVICE') {
    const s = await prisma.vehicleService.findUnique({ where: { id: entityId }, select: { tenantId: true, vehicle: { select: { tenantId: true } } } })
    if (!s) return notFound()
    tenantId = s.vehicle?.tenantId ?? s.tenantId
  } else {
    const v = await prisma.vehicle.findUnique({ where: { id: entityId }, select: { tenantId: true } })
    if (!v) return notFound()
    tenantId = v.tenantId
  }
  if (!sameTenant(user, tenantId)) return notFound()
  const ok = level === 'read'
    ? (await can(user, 'stock')) || (await can(user, 'finance'))
    : (await can(user, 'stock.manage')) || (await hasFinanceAccess(user, 'finance.manage'))
  return ok ? { ok: true, tenantId: tenantId ?? null } : denied()
}

async function supplierAccess(user: SessionUser, entityId: string, level: DocAccessLevel): Promise<DocAccessResult> {
  const s = await prisma.supplier.findUnique({ where: { id: entityId }, select: { tenantId: true } })
  if (!s || !sameTenant(user, s.tenantId)) return notFound()
  const ok = level === 'delete'
    ? (await can(user, 'stock.manage')) || (await hasFinanceAccess(user, 'finance.manage'))
    : (await can(user, 'stock.manage')) || (await can(user, 'finance'))
  return ok ? { ok: true, tenantId: s.tenantId } : denied()
}

async function payrollAccess(user: SessionUser, entityId: string, level: DocAccessLevel): Promise<DocAccessResult> {
  const p = parsePayrollEntityId(entityId)
  if (!p) return notFound()
  const emp = await prisma.user.findUnique({ where: { id: p.userId }, select: { tenantId: true } })
  if (!emp || !emp.tenantId || !sameTenant(user, emp.tenantId)) return notFound()
  if (!(await hasFinanceAccess(user, 'finance.payroll'))) return denied('Sem acesso à folha.')
  if (level === 'delete' && !(await hasFinanceAccess(user, 'finance.manage'))) return denied('Sem permissão para excluir documentos da folha.')
  return { ok: true, tenantId: emp.tenantId }
}

/** Verifica se o usuário pode ver/anexar/excluir documentos do registro. */
export async function checkDocumentAccess(user: SessionUser, entityType: DocEntityType, entityId: string, level: DocAccessLevel): Promise<DocAccessResult> {
  if (!entityId || entityId.length > 120) return notFound()
  switch (entityType) {
    case 'DEAL':
    case 'DEAL_SERVICE':
    case 'WARRANTY_SALE':
    case 'DEAL_PAYMENT':
      return dealAccess(user, entityType, entityId, level)
    case 'VEHICLE':
    case 'VEHICLE_SERVICE':
      return vehicleAccess(user, entityType, entityId, level)
    case 'SUPPLIER':
      return supplierAccess(user, entityId, level)
    case 'PAYROLL':
      return payrollAccess(user, entityId, level)
    default:
      return notFound()
  }
}

/** Para a lista: o usuário pode excluir? (não lança erro). */
export async function canDeleteDocuments(user: SessionUser, entityType: DocEntityType, entityId: string): Promise<boolean> {
  return (await checkDocumentAccess(user, entityType, entityId, 'delete')).ok
}
