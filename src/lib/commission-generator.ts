// =============================================================================
// commission-generator.ts — Geração automática de CommissionCalculation a partir
// de um Deal aprovado/finalizado.
//
// Estratégia:
//   1. Carrega o Deal com vehicles + services + seller + manager.
//   2. Compõe lista de itens (1 por par employee×tipo de comissionamento).
//   3. Para cada item, resolve a regra via `findCommissionRule` (matcher central)
//      e calcula o valor com `computeCommissionValue`.
//   4. Idempotência: pula o que já existe (mesmo dealId/ruleType/employee/refId
//      gravado em ruleDetails) — não duplica em chamadas repetidas.
//   5. Em $transaction, insere uma CommissionCalculation (status PREVISTO) por
//      item que casou regra. Itens sem regra são reportados como `matched: null`.
//
// Observação sobre schema: CommissionCalculation NÃO possui colunas dealId /
// vehicleId / serviceId / warrantyId / bank. Esses identificadores são gravados
// em `ruleDetails` (Json) junto com o snapshot da regra para auditoria.
// =============================================================================

import { prisma } from '@/lib/prisma'
import {
  findCommissionRule,
  computeCommissionValue,
  type EmployeeKind,
} from '@/lib/commission-matcher'
import { calculateWarrantyCommission } from '@/lib/warranty/warranty-calc'
import { getUnitCommissionConfig, isRoleCommissionEligible } from '@/lib/commission/unit-config'
import { DEFAULT_COMMISSION_BEHAVIOR, getCommissionBehaviorSettings } from '@/lib/commission/settings'
import {
  COMMISSION_ELIGIBLE_DEAL_STATUSES,
  commissionReferenceDate,
  isCommissionEligibleStatus,
} from '@/lib/commission/status'
import type { CommissionRule, CommissionRuleType, Prisma, UserRole } from '@prisma/client'

// ── Tipos públicos ───────────────────────────────────────────────────────────

export interface GenerateOptions {
  dealId:      string
  tenantId:    string | null
  triggeredBy: string                // userId who triggered (for audit)
  date?:       Date
  dryRun?:     boolean               // when true, return what WOULD be created without writing
}

export interface GenerationItemRef {
  contractId?: string | null
  dealId?:     string | null
  vehicleId?:  string | null
  serviceId?:  string | null
  warrantyId?: string | null
  bank?:       string | null
  bonusPeriod?: string | null
  bonusRuleId?: string | null
}

export interface GenerationItem {
  ruleType:      string
  employeeKind:  EmployeeKind
  employeeId:    string
  employeeLabel: string
  baseValue:     number
  description:   string
  reference:     GenerationItemRef
  periodQuantity?: number | null
}

export interface GenerationResultItem extends GenerationItem {
  matched: {
    ruleId:          string
    ruleName:        string
    matchedBy:       string
    rateApplied:     number | null
    commissionValue: number
  } | null
  alreadyExisted?: boolean
}

export interface GenerationResult {
  dealId:    string
  created:   number
  matched:   number
  unmatched: number
  items:     GenerationResultItem[]
}

interface ResolvedGenerationItem {
  item: GenerationItem
  matched: {
    rule:            CommissionRule
    matchedBy:       string
    commissionValue: number
    rateApplied:     number | null
  } | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') {
    return (v as { toNumber: () => number }).toNumber()
  }
  return Number(v) || 0
}

function periodOf(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// Compara o identificador de referência relevante para idempotência
function refKey(ruleType: string, ref: GenerationItemRef): string {
  if (ref.bonusPeriod && ref.bonusRuleId) return `bonus:${ref.bonusRuleId}:${ref.bonusPeriod}`
  if (ref.serviceId)  return `service:${ref.serviceId}`
  if (ref.warrantyId) return `warranty:${ref.warrantyId}`
  if (ref.vehicleId)  return `vehicle:${ref.vehicleId}`
  return `deal:${ruleType}`
}

// ── Função principal ─────────────────────────────────────────────────────────

export async function generateCommissionsForDeal(
  opts: GenerateOptions,
): Promise<GenerationResult> {
  const dryRun  = !!opts.dryRun

  // 1. Carrega o Deal + relações relevantes
  const deal = await prisma.deal.findUnique({
    where: { id: opts.dealId },
    include: {
      vehicles: true,
      services: true,
      warrantySales: { include: { warranty: true } },
      seller:   { select: { id: true, fullName: true, unitId: true, positionId: true, userId: true, user: { select: { role: true } } } },
      manager:  { select: { id: true, name: true, positionId: true, role: true } },
    },
  })

  if (!deal) {
    return { dealId: opts.dealId, created: 0, matched: 0, unmatched: 0, items: [] }
  }
  const d = deal // alias para closures não precisarem reverificar nulidade
  if (!isCommissionEligibleStatus(d.status)) {
    return { dealId: opts.dealId, created: 0, matched: 0, unmatched: 0, items: [] }
  }

  const date    = opts.date ?? commissionReferenceDate(d)
  const period  = periodOf(date)

  const tenantId = opts.tenantId ?? d.tenantId ?? null
  const unitId   = d.unitId ?? d.seller?.unitId ?? null

  // 2. Compor lista de itens (sem regra ainda)
  const items: GenerationItem[] = []

  // Identificação dos earners
  type LocalEarner = {
    kind:       EmployeeKind
    id:         string
    userId:     string | null
    positionId: string | null
    role:       UserRole | null
    label:      string
  }

  let sellerEarner: LocalEarner | null = d.seller
    ? {
        kind:        'SELLER',
        id:          d.seller.id,
        userId:      d.seller.userId,
        positionId:  d.seller.positionId,
        role:        d.seller.user?.role ?? null,
        label:       d.seller.fullName,
      }
    : null

  // deal.managerId aponta para User.id (não Manager.id). Tratamos como USER no matcher.
  let managerEarner: LocalEarner | null = d.manager
    ? {
        kind:        'USER',
        id:          d.manager.id,
        userId:      d.manager.id,
        positionId:  d.manager.positionId,
        role:        d.manager.role,
        label:       d.manager.name,
      }
    : null

  // Quando a negociação não gravou managerId, usa o gerente ativo da unidade.
  // Isso cobre o caso comum "vendedor da loja vendeu, gerente da loja recebe".
  if (!managerEarner && tenantId && unitId) {
    const unitManager = await prisma.manager.findFirst({
      where: {
        unitId,
        active: true,
        unit:   { tenantId },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        fullName: true,
        positionId: true,
        user: { select: { role: true, name: true } },
      },
    }).catch(() => null)

    if (unitManager) {
      managerEarner = {
        kind:       'MANAGER',
        id:         unitManager.id,
        userId:     unitManager.userId,
        positionId: unitManager.positionId,
        role:       unitManager.user?.role ?? null,
        label:      unitManager.fullName || unitManager.user?.name || 'Gerente',
      }
    }
  }

  // ── Chave de comissão da UNIDADE (cadastro da unidade) ─────────────────────
  // Unidade com comissão DESLIGADA (ex.: galpão) → ninguém recebe. Ligada com
  // cargos definidos → só os cargos elegíveis recebem. Sem config = compat (paga).
  if (tenantId && unitId) {
    const cfg = await getUnitCommissionConfig(tenantId, unitId)
    if (!cfg.enabled) {
      return { dealId: opts.dealId, created: 0, matched: 0, unmatched: 0, items: [] }
    }
    if (sellerEarner && !isRoleCommissionEligible(cfg, sellerEarner.role ?? '')) sellerEarner = null
    if (managerEarner && !isRoleCommissionEligible(cfg, managerEarner.role ?? '')) managerEarner = null
  }

  const behavior = tenantId
    ? await getCommissionBehaviorSettings(tenantId)
    : DEFAULT_COMMISSION_BEHAVIOR

  const sameSellerAndManager =
    sellerEarner?.userId &&
    managerEarner?.userId &&
    sellerEarner.userId === managerEarner.userId

  if (sameSellerAndManager && !behavior.managerReceivesOnOwnSale) {
    managerEarner = null
  }

  function addForVehicle(dv: typeof d.vehicles[number]) {
    const ruleType: CommissionRuleType = dv.role === 'TROCA' ? 'TROCA' : (dv.role === 'COMPRADO' ? 'COMPRA' : 'VENDA')
    const baseValue = toNum(dv.agreedValue) || toNum(d.saleAmount)
    if (baseValue <= 0) return
    if (!sellerEarner && !managerEarner) return
    const baseDesc = `${ruleType} veículo ${dv.brand ?? ''} ${dv.model ?? ''} ${dv.plate ? `(${dv.plate})` : ''}`.trim()

    if (sellerEarner) {
      items.push({
        ruleType,
        employeeKind:  sellerEarner.kind,
        employeeId:    sellerEarner.id,
        employeeLabel: sellerEarner.label,
        baseValue,
        description:   `${baseDesc} — vendedor ${sellerEarner.label}`,
        reference:     { dealId: d.id, vehicleId: dv.id },
      })
    }
    if (managerEarner) {
      items.push({
        ruleType,
        employeeKind:  managerEarner.kind,
        employeeId:    managerEarner.id,
        employeeLabel: managerEarner.label,
        baseValue,
        description:   `${baseDesc} — gerente ${managerEarner.label}`,
        reference:     { dealId: d.id, vehicleId: dv.id },
      })
    }
  }

  function addForService(ds: typeof d.services[number]) {
    // Garantias agora são registradas em WarrantySale (preço/comissão do cadastro).
    // DealService cobre apenas serviços comuns → sempre SERVICO.
    const ruleType: CommissionRuleType = 'SERVICO'
    const baseValue = toNum(ds.value)
    if (baseValue <= 0) return
    const refKind = { serviceId: ds.id }
    const baseDesc = `${ruleType} ${ds.name}`

    if (sellerEarner) {
      items.push({
        ruleType,
        employeeKind:  sellerEarner.kind,
        employeeId:    sellerEarner.id,
        employeeLabel: sellerEarner.label,
        baseValue,
        description:   `${baseDesc} — vendedor ${sellerEarner.label}`,
        reference:     { dealId: d.id, ...refKind },
      })
    }
    if (managerEarner) {
      items.push({
        ruleType,
        employeeKind:  managerEarner.kind,
        employeeId:    managerEarner.id,
        employeeLabel: managerEarner.label,
        baseValue,
        description:   `${baseDesc} — gerente ${managerEarner.label}`,
        reference:     { dealId: d.id, ...refKind },
      })
    }
  }

  // Veículos vendidos / trocados / comprados
  for (const dv of d.vehicles) {
    if (dv.role === 'VENDIDO' || dv.role === 'TROCA' || dv.role === 'COMPRADO') {
      addForVehicle(dv)
    }
  }

  // Serviços (incluindo "garantia" detectada pelo nome)
  for (const ds of d.services) {
    addForService(ds)
  }

  // DOCUMENTO — para usuários com Position.slug == 'documentacao' no mesmo tenant
  const docFee = toNum(d.documentationFee)
  const docBase = docFee > 0 ? docFee : toNum(d.saleAmount)
  if (docBase > 0) {
    const docUsers = await prisma.user.findMany({
      where: {
        tenantId: tenantId,
        position: { slug: 'documentacao' },
      },
      select: { id: true, name: true, positionId: true, role: true, unitId: true },
    })
    // Se o deal tiver unitId, prioriza usuários da mesma unidade
    const eligible = unitId
      ? docUsers.filter((u) => u.unitId == null || u.unitId === unitId)
      : docUsers
    for (const u of eligible) {
      items.push({
        ruleType:      'DOCUMENTO',
        employeeKind:  'USER',
        employeeId:    u.id,
        employeeLabel: u.name,
        baseValue:     docBase,
        description:   `DOCUMENTO — ${u.name}`,
        reference:     { dealId: d.id },
      })
    }
  }

  // RETORNO — comissão sobre o retorno LÍQUIDO (returnNetValue), nunca o bruto.
  // O percentual vem de uma CommissionRule(RETORNO) do vendedor/gerente/cargo —
  // não fixo no código.
  const returnNet = toNum(d.returnNetValue)
  if (returnNet > 0) {
    if (sellerEarner) {
      items.push({
        ruleType:      'RETORNO',
        employeeKind:  sellerEarner.kind,
        employeeId:    sellerEarner.id,
        employeeLabel: sellerEarner.label,
        baseValue:     returnNet,
        description:   `RETORNO financeiro — vendedor ${sellerEarner.label}`,
        reference:     { dealId: d.id, bank: d.paymentBank ?? null },
      })
    }
    if (managerEarner) {
      items.push({
        ruleType:      'RETORNO',
        employeeKind:  managerEarner.kind,
        employeeId:    managerEarner.id,
        employeeLabel: managerEarner.label,
        baseValue:     returnNet,
        description:   `RETORNO financeiro — gerente ${managerEarner.label}`,
        reference:     { dealId: d.id, bank: d.paymentBank ?? null },
      })
    }
  }

  // 3. Para cada item: resolver a regra (em paralelo) + calcular o valor
  const resolved: ResolvedGenerationItem[] = await Promise.all(items.map(async (it) => {
    const quantityInPeriod = await resolvePeriodQuantity(it, tenantId, date)
    it.periodQuantity = quantityInPeriod ?? null

    const matched = await findCommissionRule({
      tenantId,
      ruleType:   it.ruleType,
      commissionKind: 'REGULAR',
      employee: {
        kind:       it.employeeKind,
        id:         it.employeeId,
        positionId: await resolvePositionId(it),
        role:       await resolveRole(it),
      },
      unitId:     unitId,
      serviceId:  it.reference.serviceId  ?? null,
      warrantyId: it.reference.warrantyId ?? null,
      bank:       it.reference.bank       ?? null,
      baseValue:  it.baseValue,
      quantityInPeriod: quantityInPeriod ?? undefined,
      date,
    })

    const commissionValue = matched
      ? computeCommissionValue(matched.rule, it.baseValue)
      : 0

    const rateApplied = matched && matched.rule.percentage != null
      ? toNum(matched.rule.percentage)
      : null

    return {
      item: it,
      matched: matched
        ? {
            rule:            matched.rule,
            matchedBy:       matched.matchedBy,
            commissionValue,
            rateApplied,
          }
        : null,
    }
  }))

  const bonusResolved = await resolveQuantityBonuses(items, tenantId, unitId, d.id, period, date)
  const allResolved = [...resolved, ...bonusResolved]

  // 4. Idempotência: ler CommissionCalculation existentes deste deal
  // (ruleDetails contém { dealId, vehicleId, serviceId, warrantyId })
  const existingDeal = await prisma.commissionCalculation.findMany({
    where: {
      tenantId: tenantId,
      ruleDetails: { path: ['dealId'], equals: d.id } as never,
    },
    select: { id: true, ruleType: true, sellerId: true, managerId: true, ruleDetails: true },
  }).catch(() => [] as Array<{ id: string; ruleType: string; sellerId: string | null; managerId: string | null; ruleDetails: unknown }>)

  const existingBonus = await prisma.commissionCalculation.findMany({
    where: {
      tenantId,
      period,
      ruleDetails: { path: ['bonusPeriod'], equals: period } as never,
    },
    select: { id: true, ruleType: true, sellerId: true, managerId: true, ruleDetails: true },
  }).catch(() => [] as Array<{ id: string; ruleType: string; sellerId: string | null; managerId: string | null; ruleDetails: unknown }>)

  const existing = [...existingDeal, ...existingBonus]

  function isDuplicate(it: GenerationItem): boolean {
    const k = refKey(it.ruleType, it.reference)
    return existing.some((e) => {
      if (e.ruleType !== it.ruleType) return false
      // Por employee
      const empMatches =
        (it.employeeKind === 'SELLER' && e.sellerId === it.employeeId) ||
        (it.employeeKind === 'MANAGER' && e.managerId === it.employeeId) ||
        (it.employeeKind === 'USER' && (
          (e.ruleDetails as { employeeUserId?: string } | null)?.employeeUserId === it.employeeId
        ))
      if (!empMatches) return false
      const rd = e.ruleDetails as GenerationItemRef | null
      const existingKey = refKey(it.ruleType, rd ?? {})
      return existingKey === k
    })
  }

  // 5. Persistir
  const resultItems: GenerationResultItem[] = []
  let created = 0
  let matchedCount = 0
  let unmatchedCount = 0

  const toCreate: Array<{ item: GenerationItem; matched: NonNullable<ResolvedGenerationItem['matched']> }> = []

  for (const r of allResolved) {
    const dup = isDuplicate(r.item)
    if (r.matched) matchedCount++
    else unmatchedCount++

    resultItems.push({
      ...r.item,
      matched: r.matched
        ? {
            ruleId:          r.matched.rule.id,
            ruleName:        r.matched.rule.name,
            matchedBy:       r.matched.matchedBy,
            rateApplied:     r.matched.rateApplied,
            commissionValue: r.matched.commissionValue,
          }
        : null,
      alreadyExisted: dup,
    })

    if (r.matched && !dup) toCreate.push({ item: r.item, matched: r.matched })
  }

  if (!dryRun && toCreate.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const { item, matched } of toCreate) {
        const ruleDetails: Prisma.JsonObject = {
          dealId:        d.id,
          vehicleId:     item.reference.vehicleId  ?? null,
          serviceId:     item.reference.serviceId  ?? null,
          warrantyId:    item.reference.warrantyId ?? null,
          contractId:    item.reference.contractId ?? null,
          bank:          item.reference.bank       ?? null,
          bonusPeriod:   item.reference.bonusPeriod ?? null,
          bonusRuleId:   item.reference.bonusRuleId ?? null,
          employeeKind:  item.employeeKind,
          employeeId:    item.employeeId,
          employeeLabel: item.employeeLabel,
          employeeUserId: item.employeeKind === 'USER' ? item.employeeId : null,
          matchedBy:     matched.matchedBy,
          rulePriority:  matched.rule.priority ?? 0,
          commissionType: matched.rule.commissionType ?? null,
          percentage:    matched.rule.percentage != null ? toNum(matched.rule.percentage) : null,
          fixedValue:    matched.rule.fixedValue != null ? toNum(matched.rule.fixedValue) : null,
          periodQuantity: item.periodQuantity ?? null,
          triggeredBy:   opts.triggeredBy,
        }

        await tx.commissionCalculation.create({
          data: {
            tenantId,
            contractId:   item.reference.contractId ?? null,
            sellerId:     item.employeeKind === 'SELLER'  ? item.employeeId : null,
            managerId:    item.employeeKind === 'MANAGER' ? item.employeeId : null,
            unitId:       unitId,
            period,
            ruleId:       matched.rule.id,
            ruleType:     item.ruleType as CommissionRuleType,
            description:  item.description,
            baseValue:    item.baseValue,
            rateApplied:  matched.rateApplied ?? undefined,
            commissionValue: matched.commissionValue,
            ruleDetails,
            status:       'PREVISTO',
          },
        })
        created++
      }
    })
  }

  // ── GARANTIA — comissão por venda de garantia (valores FIXOS do cadastro) ──
  // Não usa o matcher de regras: a comissão vem do cadastro da garantia
  // (reduced/full + adicional prêmio). Atribuída ao vendedor. Idempotente por
  // warrantySaleId gravado em ruleDetails.
  if (sellerEarner && d.warrantySales.length > 0) {
    const existingWarranty = await prisma.commissionCalculation.findMany({
      where: {
        tenantId,
        ruleType: 'GARANTIA',
        ruleDetails: { path: ['dealId'], equals: d.id } as never,
      },
      select: { ruleDetails: true },
    }).catch(() => [] as Array<{ ruleDetails: unknown }>)

    const doneSaleIds = new Set(
      existingWarranty
        .map((e) => (e.ruleDetails as { warrantySaleId?: string } | null)?.warrantySaleId)
        .filter(Boolean) as string[],
    )

    const warrantyToCreate = d.warrantySales
      .filter((ws) => ws.status === 'ATIVA' && !doneSaleIds.has(ws.id))
      .map((ws) => ({ ws, comm: calculateWarrantyCommission(ws.warranty, ws.saleType, ws.hasPremiumAddon) }))
      .filter(({ comm }) => comm.totalCommissionValue > 0)

    matchedCount += warrantyToCreate.length

    if (!dryRun && warrantyToCreate.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const { ws, comm } of warrantyToCreate) {
          const label = `${ws.warranty.name} (${ws.saleType === 'FULL' ? 'cheio' : 'reduzido'}${ws.hasPremiumAddon ? ' + prêmio' : ''})`
          await tx.commissionCalculation.create({
            data: {
              tenantId,
              sellerId:        sellerEarner.id,
              unitId,
              period,
              ruleType:        'GARANTIA',
              description:     `GARANTIA ${label} — ${sellerEarner.label}`,
              baseValue:       toNum(ws.finalPrice),
              commissionValue: comm.totalCommissionValue,
              ruleDetails: {
                dealId:           d.id,
                warrantySaleId:   ws.id,
                warrantyId:       ws.warrantyId,
                saleType:         ws.saleType,
                hasPremiumAddon:  ws.hasPremiumAddon,
                baseCommission:   comm.baseCommissionValue,
                premiumCommission: comm.premiumCommissionValue,
                employeeKind:     'SELLER',
                employeeId:       sellerEarner.id,
                employeeLabel:    sellerEarner.label,
                triggeredBy:      opts.triggeredBy,
              } as Prisma.JsonObject,
              status: 'PREVISTO',
            },
          })
          created++
        }
      })
    }
  }

  if (!dryRun && created > 0) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId:   opts.triggeredBy,
        action:   'COMMISSION_GENERATE',
        entity:   'Deal',
        entityId: d.id,
        status:   'SUCCESS',
        afterData: {
          period,
          created,
          matched: matchedCount,
          unmatched: unmatchedCount,
        } as never,
      },
    }).catch(() => {})
  }

  return {
    dealId:    d.id,
    created,
    matched:   matchedCount,
    unmatched: unmatchedCount,
    items:     resultItems,
  }
}

// ── Faixas e bônus por quantidade ────────────────────────────────────────────

function periodBounds(date: Date): { start: Date; end: Date } {
  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1),
    end:   new Date(date.getFullYear(), date.getMonth() + 1, 1),
  }
}

function vehicleRolesForRuleType(ruleType: string): string[] {
  if (ruleType === 'TROCA') return ['TROCA']
  if (ruleType === 'COMPRA') return ['COMPRADO']
  if (ruleType === 'VENDA') return ['VENDIDO', 'CONSIGNADO']
  return []
}

async function dealEmployeeQuantityFilter(it: GenerationItem): Promise<Record<string, unknown> | null> {
  if (it.employeeKind === 'SELLER') return { sellerId: it.employeeId }
  if (it.employeeKind === 'USER') return { managerId: it.employeeId }

  const manager = await prisma.manager.findUnique({
    where:  { id: it.employeeId },
    select: { userId: true, unitId: true },
  })
  if (!manager) return null

  return {
    OR: [
      { managerId: manager.userId },
      { AND: [{ managerId: null }, { unitId: manager.unitId }] },
    ],
  }
}

async function resolvePeriodQuantity(
  it: GenerationItem,
  tenantId: string | null,
  date: Date,
): Promise<number | null> {
  const roles = vehicleRolesForRuleType(it.ruleType)
  if (!roles.length || !it.reference.vehicleId) return null

  const employeeFilter = await dealEmployeeQuantityFilter(it)
  if (!employeeFilter) return null

  const { start, end } = periodBounds(date)
  const dealAnd: Array<Record<string, unknown>> = [
    { status: { in: COMMISSION_ELIGIBLE_DEAL_STATUSES } },
    {
      OR: [
        { approvedAt:  { gte: start, lt: end } },
        { finalizedAt: { gte: start, lt: end } },
        { saleDate:    { gte: start, lt: end } },
        {
          AND: [
            { approvedAt: null },
            { finalizedAt: null },
            { saleDate: null },
            { createdAt: { gte: start, lt: end } },
          ],
        },
      ],
    },
    employeeFilter,
  ]
  if (tenantId) dealAnd.push({ tenantId })

  const count = await prisma.dealVehicle.count({
    where: {
      role: roles.length === 1 ? roles[0] : { in: roles },
      deal: { AND: dealAnd },
    } as never,
  }).catch(() => 0)

  return count
}

async function resolveQuantityBonuses(
  items: GenerationItem[],
  tenantId: string | null,
  unitId: string | null,
  dealId: string,
  period: string,
  date: Date,
): Promise<ResolvedGenerationItem[]> {
  const representatives = new Map<string, GenerationItem>()

  for (const it of items) {
    if (!vehicleRolesForRuleType(it.ruleType).length || !it.reference.vehicleId) continue
    const key = `${it.ruleType}:${it.employeeKind}:${it.employeeId}`
    if (!representatives.has(key)) representatives.set(key, it)
  }

  const out: ResolvedGenerationItem[] = []
  for (const it of representatives.values()) {
    const quantityInPeriod = await resolvePeriodQuantity(it, tenantId, date)
    if (!quantityInPeriod) continue

    const matched = await findCommissionRule({
      tenantId,
      ruleType: it.ruleType,
      commissionKind: 'BONUS',
      employee: {
        kind:       it.employeeKind,
        id:         it.employeeId,
        positionId: await resolvePositionId(it),
        role:       await resolveRole(it),
      },
      unitId,
      baseValue: 0,
      quantityInPeriod,
      date,
    })
    if (!matched) continue

    const commissionValue = computeCommissionValue(matched.rule, 0)
    if (commissionValue <= 0) continue

    out.push({
      item: {
        ruleType:      it.ruleType,
        employeeKind:  it.employeeKind,
        employeeId:    it.employeeId,
        employeeLabel: it.employeeLabel,
        baseValue:     0,
        description:   `BÔNUS ${it.ruleType} — ${quantityInPeriod} no período — ${it.employeeLabel}`,
        reference:     { dealId, bonusPeriod: period, bonusRuleId: matched.rule.id },
        periodQuantity: quantityInPeriod,
      },
      matched: {
        rule:            matched.rule,
        matchedBy:       matched.matchedBy,
        commissionValue,
        rateApplied:     null,
      },
    })
  }

  return out
}

// ── Recálculo de comissões da negociação ──────────────────────────────────────

/**
 * Recalcula as comissões PREVISTAS de uma negociação: remove as PREVISTO
 * existentes (preserva APROVADO/PAGO/AJUSTADO) e regenera a partir do estado
 * atual do deal (venda, retorno líquido, garantias). Chamar quando mudar valor
 * financiado, % de retorno, ILA/IOF, vendedor/gerente ou garantias.
 */
export async function recalculateNegotiationCommissions(
  opts: GenerateOptions,
): Promise<GenerationResult> {
  if (!opts.dryRun) {
    await prisma.commissionCalculation.deleteMany({
      where: {
        tenantId: opts.tenantId,
        status:   'PREVISTO',
        ruleDetails: { path: ['dealId'], equals: opts.dealId } as never,
      },
    }).catch(() => { /* sem registros ou JSON path indisponível — segue */ })
  }
  return generateCommissionsForDeal(opts)
}

// ── Helpers para enriquecimento (positionId/role do employee) ────────────────
//
// Quando o item já carrega esses dados (porque vieram do próprio deal.seller /
// deal.manager), economizamos consultas. Para o usuário de documentação, os
// dados já vêm carregados no addDocumento. Mas, por garantia, refazemos a busca
// se necessário.

const _earnerCache = new Map<string, { positionId: string | null; role: UserRole | null }>()

async function loadEarner(kind: EmployeeKind, id: string): Promise<{ positionId: string | null; role: UserRole | null }> {
  const key = `${kind}:${id}`
  const cached = _earnerCache.get(key)
  if (cached) return cached
  let positionId: string | null = null
  let role: UserRole | null = null
  if (kind === 'SELLER') {
    const s = await prisma.seller.findUnique({
      where: { id }, select: { positionId: true, user: { select: { role: true } } },
    })
    positionId = s?.positionId ?? null
    role = s?.user?.role ?? null
  } else if (kind === 'MANAGER') {
    const m = await prisma.manager.findUnique({
      where: { id }, select: { positionId: true, user: { select: { role: true } } },
    })
    positionId = m?.positionId ?? null
    role = m?.user?.role ?? null
  } else {
    const u = await prisma.user.findUnique({
      where: { id }, select: { positionId: true, role: true },
    })
    positionId = u?.positionId ?? null
    role = u?.role ?? null
  }
  const out = { positionId, role }
  _earnerCache.set(key, out)
  return out
}

async function resolvePositionId(it: GenerationItem): Promise<string | null> {
  const e = await loadEarner(it.employeeKind, it.employeeId)
  return e.positionId
}

async function resolveRole(it: GenerationItem): Promise<UserRole | null> {
  const e = await loadEarner(it.employeeKind, it.employeeId)
  return e.role
}
