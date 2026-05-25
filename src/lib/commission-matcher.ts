// =============================================================================
// commission-matcher.ts — Resolução de regra de comissão (CommissionRule)
//
// Dado um contexto (tenant, tipo de regra, vendedor/gerente/usuário, valor,
// data, opcionalmente unidade/serviço/garantia/banco), seleciona a melhor
// regra aplicável de acordo com a hierarquia de precedência:
//
//   SELLER_ID     1000   (regra com sellerId == employee.id, kind=SELLER)
//   MANAGER_ID    1000   (regra com managerId == employee.id, kind=MANAGER)
//   POSITION       500   (regra com positionId == employee.positionId)
//   ROLE           250   (regra com role == employee.role)
//   DEFAULT        100   (regra sem sellerId/managerId/positionId/role)
//
// Ao score acima soma-se `rule.priority`. Maior score vence. Empate → updatedAt
// mais recente.
//
// Tenant scoping: aceita regras do próprio tenant OU regras do sistema
// (tenantId == null), permitindo defaults globais.
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { CommissionRule, UserRole } from '@prisma/client'

export type EmployeeKind = 'SELLER' | 'MANAGER' | 'USER'

export interface MatchContext {
  tenantId:   string | null
  ruleType:   string                  // VENDA | TROCA | COMPRA | GARANTIA | RETORNO | SERVICO | DOCUMENTO | BONUS_META | BONUS_DEZENA | EXCECAO
  employee: {
    kind:        EmployeeKind
    id:          string
    positionId:  string | null
    role?:       UserRole | null
  }
  unitId?:     string | null
  serviceId?:  string | null
  warrantyId?: string | null
  bank?:       string | null
  baseValue?:  number                 // valor do negócio — para filtrar fromValue/toValue
  date?:       Date                   // default = now
}

export type MatchedBy = 'SELLER_ID' | 'MANAGER_ID' | 'POSITION' | 'ROLE' | 'DEFAULT'

export interface MatchedRule {
  rule:      CommissionRule
  matchedBy: MatchedBy
  priority:  number                   // score final (maior venceu)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNumber(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  // Prisma.Decimal exposes toNumber(); fall back to Number()
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber()
  }
  return Number(v)
}

function withinValueRange(rule: CommissionRule, baseValue: number | undefined): boolean {
  if (baseValue == null) return true
  if (rule.fromValue != null && baseValue < toNumber(rule.fromValue)) return false
  if (rule.toValue   != null && baseValue > toNumber(rule.toValue))   return false
  return true
}

function classifyRule(rule: CommissionRule, ctx: MatchContext): { matchedBy: MatchedBy; base: number } | null {
  // SELLER_ID
  if (ctx.employee.kind === 'SELLER' && rule.sellerId && rule.sellerId === ctx.employee.id) {
    return { matchedBy: 'SELLER_ID', base: 1000 }
  }
  // MANAGER_ID
  if (ctx.employee.kind === 'MANAGER' && rule.managerId && rule.managerId === ctx.employee.id) {
    return { matchedBy: 'MANAGER_ID', base: 1000 }
  }
  // POSITION
  if (
    !rule.sellerId && !rule.managerId &&
    rule.positionId && ctx.employee.positionId && rule.positionId === ctx.employee.positionId
  ) {
    return { matchedBy: 'POSITION', base: 500 }
  }
  // ROLE
  if (
    !rule.sellerId && !rule.managerId && !rule.positionId &&
    rule.role && ctx.employee.role && rule.role === ctx.employee.role
  ) {
    return { matchedBy: 'ROLE', base: 250 }
  }
  // DEFAULT — regra sem nenhum vínculo de identidade
  if (!rule.sellerId && !rule.managerId && !rule.positionId && !rule.role) {
    return { matchedBy: 'DEFAULT', base: 100 }
  }
  return null
}

// ── Função principal ──────────────────────────────────────────────────────────

export async function findCommissionRule(ctx: MatchContext): Promise<MatchedRule | null> {
  const date = ctx.date ?? new Date()

  // Query candidatas: tenant correto (ou sistema), ruleType, ativa, vigência válida,
  // e — quando informado — unidade/serviço/garantia/banco correspondentes
  // (aceitamos rule.<campo> null como "qualquer" e rule.<campo> == ctx como match
  // específico; descartamos rule.<campo> != null && != ctx).
  const where: Record<string, unknown> = {
    active:   true,
    ruleType: ctx.ruleType as never,
    AND: [
      { OR: [{ tenantId: ctx.tenantId }, { tenantId: null }] },
      { OR: [{ validFrom:  null }, { validFrom:  { lte: date } }] },
      { OR: [{ validUntil: null }, { validUntil: { gte: date } }] },
    ],
  }

  // Filtros opcionais (rule.<campo> null = "qualquer")
  const andArr = where.AND as Array<Record<string, unknown>>
  if (ctx.unitId)     andArr.push({ OR: [{ unitId:     null }, { unitId:     ctx.unitId     }] })
  if (ctx.serviceId)  andArr.push({ OR: [{ serviceId:  null }, { serviceId:  ctx.serviceId  }] })
  if (ctx.warrantyId) andArr.push({ OR: [{ warrantyId: null }, { warrantyId: ctx.warrantyId }] })
  if (ctx.bank)       andArr.push({ OR: [{ bank:       null }, { bank:       ctx.bank       }] })

  const candidates = await prisma.commissionRule.findMany({
    where,
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  })

  let best: MatchedRule | null = null
  let bestScore = -Infinity
  let bestUpdatedAt = 0

  for (const rule of candidates) {
    // Filtro de valor
    if (!withinValueRange(rule, ctx.baseValue)) continue

    const cls = classifyRule(rule, ctx)
    if (!cls) continue

    const score = cls.base + (rule.priority ?? 0)
    const updatedTs = rule.updatedAt instanceof Date ? rule.updatedAt.getTime() : new Date(rule.updatedAt).getTime()

    if (score > bestScore || (score === bestScore && updatedTs > bestUpdatedAt)) {
      best = { rule, matchedBy: cls.matchedBy, priority: score }
      bestScore = score
      bestUpdatedAt = updatedTs
    }
  }

  return best
}

// ── Cálculo do valor da comissão ──────────────────────────────────────────────

export function computeCommissionValue(rule: CommissionRule, baseValue: number): number {
  const type = (rule.commissionType ?? '').toUpperCase()
  if (type === 'PERCENTUAL') {
    const pct = toNumber(rule.percentage)
    return baseValue * (pct / 100)
  }
  if (type === 'VALOR_FIXO' || type === 'FIXED') {
    return toNumber(rule.fixedValue)
  }
  return 0
}
