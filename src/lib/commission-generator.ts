// =============================================================================
// commission-generator.ts — Geração automática de CommissionCalculation a partir
// de um Deal aprovado/finalizado.
//
// Estratégia:
//   1. Carrega o Deal com vehicles + services + seller + manager.
//   2. Compõe lista de itens (1 por par employee×escopo de comissionamento).
//   3. Para cada item, resolve a regra via `findCommissionRule` (matcher central)
//      e calcula o valor com `computeCommissionValue`.
//   4. Idempotência: pula o que já existe (mesmo dealId/escopo/employee/refId
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
import { getDocumentoConfig, computeDocumentoCommission, type DocumentoConfig } from '@/lib/finance/documento-config'
import { getGarantiaConfig, computeGarantiaCommission, type GarantiaConfig } from '@/lib/finance/garantia-config'
import { recalculateSellerMainForPeriod } from '@/lib/commission/retroactive'
import { getDecendPeriod } from '@/lib/commission/decendial'
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

export type CommissionScope =
  | 'SELLER_MAIN_COMMISSION'
  | 'UNIT_MANAGER_COMMISSION'
  | 'GENERAL_MANAGER_COMMISSION'
  | 'WARRANTY_COMMISSION'
  | 'RETURN_COMMISSION'
  | 'SERVICE_COMMISSION'
  | 'DOCUMENT_COMMISSION'
  | 'BONUS_COMMISSION'
  | 'DECEND_QUANTITY_BONUS'

export interface GenerationItemRef {
  contractId?: string | null
  dealId?:     string | null
  vehicleId?:  string | null
  serviceId?:  string | null
  warrantyId?: string | null
  bank?:       string | null
  bonusPeriod?: string | null
  bonusRuleId?: string | null
  decend?: string | null
  periodStart?: string | null
  periodEnd?: string | null
  periodEndExclusive?: string | null
  minQuantitySnapshot?: number | null
  quantitySnapshot?: number | null
  bonusAmountSnapshot?: number | null
  eligibleStatuses?: string[] | null
  originalOperationType?: string | null
  commissionOperationType?: string | null
}

export interface GenerationItem {
  ruleType:      string
  commissionScope: CommissionScope
  employeeKind:  EmployeeKind
  employeeId:    string
  employeeUserId?: string | null
  employeeLabel: string
  baseValue:     number
  description:   string
  reference:     GenerationItemRef
  periodQuantity?: number | null
  // Valor já calculado por CONFIG (ex.: documentação tiered) → pula o matcher.
  fixedCommissionValue?: number | null
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

function dateOnly(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function normalizeCommissionOperationType(dealType: string | null | undefined): CommissionRuleType {
  const type = String(dealType ?? '').toUpperCase()
  if (type === 'COMPRA') return 'COMPRA'
  // Consignação é uma operação PRÓPRIA: só paga se houver regra CONSIGNACAO
  // cadastrada (não empresta a regra de VENDA). Venda e Troca continuam iguais.
  if (type === 'CONSIGNACAO') return 'CONSIGNACAO'
  return 'VENDA'
}

function isPrincipalScope(scope: CommissionScope): boolean {
  return scope === 'SELLER_MAIN_COMMISSION' ||
    scope === 'UNIT_MANAGER_COMMISSION' ||
    scope === 'GENERAL_MANAGER_COMMISSION'
}

// Compara o identificador de referência relevante para idempotência
function refKey(it: Pick<GenerationItem, 'ruleType' | 'commissionScope' | 'reference'>): string {
  const ref = it.reference
  if (ref.bonusPeriod && ref.bonusRuleId) return `bonus:${it.commissionScope}:${ref.bonusRuleId}:${ref.bonusPeriod}`
  if (ref.serviceId)  return `service:${it.commissionScope}:${ref.serviceId}`
  if (ref.warrantyId) return `warranty:${it.commissionScope}:${ref.warrantyId}`
  if (isPrincipalScope(it.commissionScope)) return `deal:${it.commissionScope}`
  if (ref.vehicleId)  return `vehicle:${it.commissionScope}:${ref.vehicleId}`
  return `deal:${it.commissionScope}:${it.ruleType}`
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

  // deal.managerId aponta para User.id. Quando esse usuário também possui
  // cadastro de Manager, usamos o Manager.id para gravar/relatar corretamente.
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

  if (managerEarner && d.manager && tenantId) {
    const managerWhere: Prisma.ManagerWhereInput = {
      userId: d.manager.id,
      active: true,
      unit:   { tenantId },
    }
    if (unitId) managerWhere.unitId = unitId

    const linkedManager = await prisma.manager.findFirst({
      where: managerWhere,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        fullName: true,
        positionId: true,
        user: { select: { role: true, name: true } },
      },
    }).catch(() => null)

    if (linkedManager) {
      managerEarner = {
        kind:       'MANAGER',
        id:         linkedManager.id,
        userId:     linkedManager.userId,
        positionId: linkedManager.positionId ?? d.manager.positionId,
        role:       linkedManager.user?.role ?? d.manager.role,
        label:      linkedManager.fullName || linkedManager.user?.name || d.manager.name,
      }
    }
  }

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

  let generalManagerEarners: LocalEarner[] = []
  if (tenantId) {
    const generalManagers = await prisma.user.findMany({
      where: {
        tenantId,
        role:   'GERENTE_GERAL',
        status: 'ATIVO',
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        positionId: true,
        role: true,
      },
    }).catch(() => [])

    generalManagerEarners = generalManagers.map((u) => ({
      kind:       'USER',
      id:         u.id,
      userId:     u.id,
      positionId: u.positionId,
      role:       u.role,
      label:      u.name,
    }))
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
    generalManagerEarners = generalManagerEarners.filter((g) => isRoleCommissionEligible(cfg, g.role ?? ''))
  }

  function principalVehicleFor(ruleType: CommissionRuleType): typeof d.vehicles[number] | null {
    if (ruleType === 'COMPRA') {
      return d.vehicles.find((dv) => dv.role === 'COMPRADO') ?? d.vehicles[0] ?? null
    }
    return d.vehicles.find((dv) => dv.role === 'VENDIDO')
      ?? d.vehicles.find((dv) => dv.role === 'CONSIGNADO')
      ?? d.vehicles.find((dv) => dv.role === 'TROCA')
      ?? d.vehicles[0]
      ?? null
  }

  function principalBaseValue(ruleType: CommissionRuleType, vehicle: typeof d.vehicles[number] | null): number {
    if (ruleType === 'COMPRA') return toNum(d.purchaseAmount) || toNum(vehicle?.agreedValue)
    return toNum(d.saleAmount) || toNum(d.vehicleValue) || toNum(vehicle?.agreedValue)
  }

  function addPrincipalFor(
    earner: LocalEarner,
    commissionScope: CommissionScope,
    label: string,
    ruleType: CommissionRuleType,
    vehicle: typeof d.vehicles[number] | null,
    baseValue: number,
  ) {
    const vehicleLabel = vehicle
      ? ` veículo ${vehicle.brand ?? ''} ${vehicle.model ?? ''} ${vehicle.plate ? `(${vehicle.plate})` : ''}`.trimEnd()
      : ''
    const baseDesc = `${ruleType}${vehicleLabel}`.trim()
    items.push({
      ruleType,
      commissionScope,
      employeeKind:  earner.kind,
      employeeId:    earner.id,
      employeeUserId: earner.userId,
      employeeLabel: earner.label,
      baseValue,
      description:   `${baseDesc} — ${label} ${earner.label}`,
      reference: {
        dealId: d.id,
        vehicleId: vehicle?.id ?? null,
        originalOperationType: d.type,
        commissionOperationType: ruleType,
      },
    })
  }

  function addPrincipalCommissions() {
    const ruleType = normalizeCommissionOperationType(d.type)
    const vehicle = principalVehicleFor(ruleType)
    const baseValue = principalBaseValue(ruleType, vehicle)
    if (baseValue <= 0) return

    if (sellerEarner) {
      addPrincipalFor(sellerEarner, 'SELLER_MAIN_COMMISSION', 'vendedor', ruleType, vehicle, baseValue)
    }
    if (managerEarner) {
      addPrincipalFor(managerEarner, 'UNIT_MANAGER_COMMISSION', 'gerente', ruleType, vehicle, baseValue)
    }
    for (const generalManager of generalManagerEarners) {
      addPrincipalFor(generalManager, 'GENERAL_MANAGER_COMMISSION', 'gerente geral', ruleType, vehicle, baseValue)
    }
  }

  function addForService(ds: typeof d.services[number]) {
    // Garantias vendidas via cadastro/catálogo ficam em WarrantySale (bloco próprio
    // abaixo). Aqui tratamos DealService: serviços comuns → SERVICO; mas quando o
    // serviço É uma garantia/seguro (ex.: importado do AutoConf como "Garantia: …"),
    // roteia para GARANTIA/WARRANTY_COMMISSION, pago por uma regra GARANTIA (%/fixo).
    const isWarranty = /garantia|seguro|gestauto/i.test(ds.name ?? '') || /gestauto|seguro/i.test(ds.supplier ?? '')
    const ruleType: CommissionRuleType = isWarranty ? 'GARANTIA' : 'SERVICO'
    const commissionScope: CommissionScope = isWarranty ? 'WARRANTY_COMMISSION' : 'SERVICE_COMMISSION'

    // GARANTIA via CONFIG por produto (loja paga = cortesia). A AutoConf não dá o
    // valor cobrado, então a comissão vem do produto + pagador (não do ds.value)
    // e não passa pelo matcher (fixedCommissionValue). Bloqueia o modelo legado.
    if (isWarranty && garantiaConfig.active) {
      const produto = (ds.name ?? '').replace(/^garantia:\s*/i, '').trim()
      const payer = d.warrantyPaidBy ?? null
      const valorCobrado = toNum(ds.value) // valor real cobrado (resumo AutoConf)
      const pushGarantia = (earner: LocalEarner, isManager: boolean) => {
        const val = computeGarantiaCommission({ config: garantiaConfig, produto, valorCobrado, payer, isManager }) ?? 0
        items.push({
          ruleType: 'GARANTIA', commissionScope: 'WARRANTY_COMMISSION',
          employeeKind: earner.kind, employeeId: earner.id, employeeUserId: earner.userId, employeeLabel: earner.label,
          baseValue: toNum(ds.value), description: `GARANTIA ${ds.name} — ${isManager ? 'gerente' : 'vendedor'} ${earner.label}`,
          reference: { dealId: d.id, serviceId: ds.id }, fixedCommissionValue: val,
        })
      }
      if (sellerEarner) pushGarantia(sellerEarner, false)
      if (managerEarner) pushGarantia(managerEarner, true)
      return
    }

    const baseValue = toNum(ds.value)
    if (baseValue <= 0) return
    const refKind = { serviceId: ds.id }
    const baseDesc = `${ruleType} ${ds.name}`

    if (sellerEarner) {
      items.push({
        ruleType,
        commissionScope,
        employeeKind:  sellerEarner.kind,
        employeeId:    sellerEarner.id,
        employeeUserId: sellerEarner.userId,
        employeeLabel: sellerEarner.label,
        baseValue,
        description:   `${baseDesc} — vendedor ${sellerEarner.label}`,
        reference:     { dealId: d.id, ...refKind },
      })
    }
    if (managerEarner) {
      // Serviço e garantia: o gerente só recebe se houver uma regra que case com
      // ele (por cargo/perfil). Sem regra de gerente, o matcher não paga — logo
      // não há pagamento em dobro (vendedor e gerente casam regras distintas).
      items.push({
        ruleType,
        commissionScope,
        employeeKind:  managerEarner.kind,
        employeeId:    managerEarner.id,
        employeeUserId: managerEarner.userId,
        employeeLabel: managerEarner.label,
        baseValue,
        description:   `${baseDesc} — gerente ${managerEarner.label}`,
        reference:     { dealId: d.id, ...refKind },
      })
    }
  }

  // Comissão principal: uma por negociação e por escopo. TROCA vira VENDA para
  // comissão principal; o tipo original segue em ruleDetails para relatório.
  addPrincipalCommissions()

  // GARANTIA — comissão por PRODUTO + quem paga (config global): loja paga =
  // cortesia (0); cliente paga = valor fixo por produto. Carregada aqui e usada
  // dentro de addForService. Config desligada → cai no modelo legado por regra.
  const garantiaConfig: GarantiaConfig = tenantId
    ? await getGarantiaConfig(tenantId)
    : { active: false, lojaPagaSemComissao: true, produtos: [], defaultGerente: 0, defaultVendedorCheia: 0, defaultVendedorDesconto: 0 }

  // Serviços (incluindo "garantia" detectada pelo nome)
  for (const ds of d.services) {
    addForService(ds)
  }

  // DOCUMENTO — comissão sobre a TAXA DE DOCUMENTAÇÃO (despachante).
  // Modelo TIERED por valor + quem paga (config global): loja paga = cortesia (0);
  // cliente paga = faixa por valor { gerente, vendedor }. Aplicado num bloco
  // direto abaixo. Aqui só roda o modelo LEGADO por REGRA quando a config está
  // DESLIGADA.
  const docBase = toNum(d.documentationFee)
  const documentoConfig: DocumentoConfig = tenantId
    ? await getDocumentoConfig(tenantId)
    : { active: false, lojaPagaSemComissao: true, exigirPagadorCliente: true, tiers: [] }
  if (docBase > 0 && documentoConfig.active) {
    // Config TIERED: comissão por FAIXA de valor + quem paga (loja = cortesia).
    // Valor já calculado (fixedCommissionValue) → não passa pelo matcher.
    const payer = d.documentationPaidBy ?? null
    const pushDoc = (earner: LocalEarner, isManager: boolean) => {
      const val = computeDocumentoCommission({ config: documentoConfig, fee: docBase, payer, isManager }) ?? 0
      items.push({
        ruleType: 'DOCUMENTO', commissionScope: 'DOCUMENT_COMMISSION',
        employeeKind: earner.kind, employeeId: earner.id, employeeUserId: earner.userId, employeeLabel: earner.label,
        baseValue: docBase, description: `DOCUMENTO — ${isManager ? 'gerente' : 'vendedor'} ${earner.label}`,
        reference: { dealId: d.id }, fixedCommissionValue: val,
      })
    }
    if (sellerEarner) pushDoc(sellerEarner, false)
    if (managerEarner) pushDoc(managerEarner, true)
  } else if (docBase > 0) {
    // Modelo LEGADO por REGRA (só quando a config tiered está desligada).
    if (sellerEarner) {
      items.push({
        ruleType:      'DOCUMENTO',
        commissionScope: 'DOCUMENT_COMMISSION',
        employeeKind:  sellerEarner.kind,
        employeeId:    sellerEarner.id,
        employeeUserId: sellerEarner.userId,
        employeeLabel: sellerEarner.label,
        baseValue:     docBase,
        description:   `DOCUMENTO — vendedor ${sellerEarner.label}`,
        reference:     { dealId: d.id },
      })
    }
    if (managerEarner) {
      items.push({
        ruleType:      'DOCUMENTO',
        commissionScope: 'DOCUMENT_COMMISSION',
        employeeKind:  managerEarner.kind,
        employeeId:    managerEarner.id,
        employeeUserId: managerEarner.userId,
        employeeLabel: managerEarner.label,
        baseValue:     docBase,
        description:   `DOCUMENTO — gerente ${managerEarner.label}`,
        reference:     { dealId: d.id },
      })
    }
    const docUsers = await prisma.user.findMany({
      where: {
        tenantId: tenantId,
        position: { slug: 'documentacao' },
      },
      select: { id: true, name: true, positionId: true, role: true, unitId: true },
    })
    // Se o deal tiver unitId, prioriza usuários da mesma unidade; evita duplicar
    // quando o usuário de documentação já é o vendedor/gerente do negócio.
    const eligible = (unitId
      ? docUsers.filter((u) => u.unitId == null || u.unitId === unitId)
      : docUsers
    ).filter((u) => u.id !== sellerEarner?.userId && u.id !== managerEarner?.userId)
    for (const u of eligible) {
      items.push({
        ruleType:      'DOCUMENTO',
        commissionScope: 'DOCUMENT_COMMISSION',
        employeeKind:  'USER',
        employeeId:    u.id,
        employeeUserId: u.id,
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
        commissionScope: 'RETURN_COMMISSION',
        employeeKind:  sellerEarner.kind,
        employeeId:    sellerEarner.id,
        employeeUserId: sellerEarner.userId,
        employeeLabel: sellerEarner.label,
        baseValue:     returnNet,
        description:   `RETORNO financeiro — vendedor ${sellerEarner.label}`,
        reference:     { dealId: d.id, bank: d.paymentBank ?? null },
      })
    }
    if (managerEarner) {
      items.push({
        ruleType:      'RETORNO',
        commissionScope: 'RETURN_COMMISSION',
        employeeKind:  managerEarner.kind,
        employeeId:    managerEarner.id,
        employeeUserId: managerEarner.userId,
        employeeLabel: managerEarner.label,
        baseValue:     returnNet,
        description:   `RETORNO financeiro — gerente ${managerEarner.label}`,
        reference:     { dealId: d.id, bank: d.paymentBank ?? null },
      })
    }
  }

  // 3. Para cada item: resolver a regra (em paralelo) + calcular o valor
  const resolved: ResolvedGenerationItem[] = await Promise.all(items.map(async (it) => {
    // Item com valor já calculado por CONFIG (documentação tiered) → pula o matcher.
    if (it.fixedCommissionValue != null) {
      const v = it.fixedCommissionValue
      return {
        item: it,
        matched: v > 0 ? {
          rule: { id: '', name: 'Documentação (config)', commissionType: 'FIXO', fixedValue: v, percentage: null, priority: 0 } as unknown as CommissionRule,
          matchedBy: 'CONFIG',
          commissionValue: v,
          rateApplied: null,
        } : null,
      }
    }
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
  const decendResolved = await resolveDecendialBonuses(items, tenantId, unitId, d.id, date)
  const allResolved = [...resolved, ...bonusResolved, ...decendResolved]

  // 4. Idempotência: ler CommissionCalculation existentes deste deal
  // (ruleDetails contém { dealId, vehicleId, serviceId, warrantyId })
  const existingDeal = await prisma.commissionCalculation.findMany({
    where: {
      tenantId: tenantId,
      ruleDetails: { path: ['dealId'], equals: d.id } as never,
    },
    select: { id: true, ruleType: true, sellerId: true, managerId: true, ruleDetails: true },
  }).catch(() => [] as Array<{ id: string; ruleType: string; sellerId: string | null; managerId: string | null; ruleDetails: unknown }>)

  // Bônus já existentes no período: mensal (bonusPeriod == "yyyy-MM") e dezenal
  // (bonusPeriod == "yyyy-MM-Dn"). Ambos vivem no mesmo mês (period == yyyy-MM).
  const decendKey = getDecendPeriod(date).key
  const existingBonus = await prisma.commissionCalculation.findMany({
    where: {
      tenantId,
      period,
      OR: [
        { ruleDetails: { path: ['bonusPeriod'], equals: period } as never },
        { ruleDetails: { path: ['bonusPeriod'], equals: decendKey } as never },
      ],
    },
    select: { id: true, ruleType: true, sellerId: true, managerId: true, ruleDetails: true },
  }).catch(() => [] as Array<{ id: string; ruleType: string; sellerId: string | null; managerId: string | null; ruleDetails: unknown }>)

  const existing = [...existingDeal, ...existingBonus]

  function isDuplicate(it: GenerationItem): boolean {
    const k = refKey(it)
    const itemEmployeeUserId = it.employeeUserId ?? (it.employeeKind === 'USER' ? it.employeeId : null)
    return existing.some((e) => {
      const rd = e.ruleDetails as (GenerationItemRef & { employeeUserId?: string; employeeKind?: EmployeeKind; commissionScope?: CommissionScope }) | null
      const existingScope = rd?.commissionScope ?? null
      if (!isPrincipalScope(it.commissionScope) && e.ruleType !== it.ruleType) return false
      if (isPrincipalScope(it.commissionScope) && !['VENDA', 'TROCA', 'COMPRA', 'CONSIGNACAO'].includes(e.ruleType)) return false

      const existingEmployeeUserId = rd?.employeeUserId
      const existingEmployeeKind = rd?.employeeKind
      // Por employee
      const empMatches =
        (it.employeeKind === 'SELLER' && (
          e.sellerId === it.employeeId ||
          (existingEmployeeKind === 'SELLER' && !!itemEmployeeUserId && existingEmployeeUserId === itemEmployeeUserId)
        )) ||
        (it.employeeKind === 'MANAGER' && (
          e.managerId === it.employeeId ||
          (existingEmployeeKind === 'MANAGER' && !!itemEmployeeUserId && existingEmployeeUserId === itemEmployeeUserId)
        )) ||
        (it.employeeKind === 'USER' && (
          existingEmployeeKind === 'USER' && existingEmployeeUserId === it.employeeId
        ))
      if (!empMatches) return false

      if (isPrincipalScope(it.commissionScope)) {
        if (existingScope) return existingScope === it.commissionScope
        return it.commissionScope !== 'GENERAL_MANAGER_COMMISSION'
      }

      const existingKey = refKey({
        ruleType: e.ruleType,
        commissionScope: existingScope ?? it.commissionScope,
        reference: rd ?? {},
      })
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
          decend:        item.reference.decend ?? null,
          periodStart:   item.reference.periodStart ?? null,
          periodEnd:     item.reference.periodEnd ?? null,
          periodEndExclusive: item.reference.periodEndExclusive ?? null,
          minQuantitySnapshot: item.reference.minQuantitySnapshot ?? null,
          quantitySnapshot: item.reference.quantitySnapshot ?? item.periodQuantity ?? null,
          bonusAmountSnapshot: item.reference.bonusAmountSnapshot ?? null,
          eligibleStatuses: item.reference.eligibleStatuses ?? null,
          commissionScope: item.commissionScope,
          originalOperationType: item.reference.originalOperationType ?? null,
          commissionOperationType: item.reference.commissionOperationType ?? item.ruleType,
          employeeKind:  item.employeeKind,
          employeeId:    item.employeeId,
          employeeLabel: item.employeeLabel,
          employeeUserId: item.employeeUserId ?? (item.employeeKind === 'USER' ? item.employeeId : null),
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
            ruleId:       matched.rule.id || null, // config (documentação) não tem regra
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
      .map((ws) => ({
        ws,
        comm: calculateWarrantyCommission({
          warrantyFullPrice:       ws.warranty.fullPrice,
          warrantyDiscountPrice:   ws.warranty.reducedPrice,
          soldPrice:               ws.finalPrice,
          fullPriceCommission:     ws.warranty.fullSaleCommissionValue,
          discountPriceCommission: ws.warranty.reducedSaleCommissionValue,
          premiumCommissionValue:  ws.hasPremiumAddon ? ws.warranty.premiumAddonCommissionValue : 0,
        }),
      }))
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
                commissionStatus: comm.status,
                baseCommission:   comm.baseCommissionValue,
                premiumCommission: comm.premiumCommissionValue,
                commissionScope:  'WARRANTY_COMMISSION',
                employeeKind:     'SELLER',
                employeeId:       sellerEarner.id,
                employeeUserId:   sellerEarner.userId,
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

  // Faixa RETROATIVA por período (Partes 1/6): após gerar/atualizar as comissões
  // deste deal, reprecifica TODOS os SELLER_MAIN do vendedor no período para a
  // faixa da contagem ATUAL — bater faixa nova faz todos os carros do período
  // passarem ao novo valor (não só os próximos). Idempotente; best-effort.
  if (!dryRun && d.seller?.id) {
    await recalculateSellerMainForPeriod({ tenantId, sellerId: d.seller.id, period, date }).catch(() => {})
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
  if (ruleType === 'CONSIGNACAO') return ['CONSIGNADO']
  if (ruleType === 'VENDA') return ['VENDIDO']
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
  return countEmployeeVehiclesInWindow(it, tenantId, periodBounds(date))
}

// Conta os veículos do employee (mesmo tipo de operação) dentro de uma janela
// de datas arbitrária [start, end). Usado tanto para a faixa/bônus MENSAL quanto
// para o bônus DEZENAL (janela de ~10 dias).
async function countEmployeeVehiclesInWindow(
  it: GenerationItem,
  tenantId: string | null,
  window: { start: Date; end: Date },
): Promise<number | null> {
  const roles = vehicleRolesForRuleType(it.ruleType)
  if (!roles.length || !it.reference.vehicleId) return null

  const employeeFilter = await dealEmployeeQuantityFilter(it)
  if (!employeeFilter) return null

  const { start, end } = window
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
    if (it.commissionScope === 'GENERAL_MANAGER_COMMISSION') continue
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
        commissionScope: 'BONUS_COMMISSION',
        employeeKind:  it.employeeKind,
        employeeId:    it.employeeId,
        employeeUserId: it.employeeUserId ?? null,
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

// ── Bônus DEZENAL (Parte 4) ───────────────────────────────────────────────────
// Conta as vendas do employee dentro da DEZENA (janela de ~10 dias) da data de
// referência e aplica uma regra `BONUS_DEZENA` (faixas por quantidade). Soma com
// o bônus mensal — cada um é um lançamento independente, com
// bonusPeriod distinto (mensal = "yyyy-MM"; dezenal = "yyyy-MM-D1|D2|D3").
async function resolveDecendialBonuses(
  items: GenerationItem[],
  tenantId: string | null,
  unitId: string | null,
  dealId: string,
  date: Date,
): Promise<ResolvedGenerationItem[]> {
  const decend = getDecendPeriod(date)

  const representatives = new Map<string, GenerationItem>()
  for (const it of items) {
    if (it.commissionScope === 'GENERAL_MANAGER_COMMISSION') continue
    if (!vehicleRolesForRuleType(it.ruleType).length || !it.reference.vehicleId) continue
    const key = `${it.ruleType}:${it.employeeKind}:${it.employeeId}`
    if (!representatives.has(key)) representatives.set(key, it)
  }

  const out: ResolvedGenerationItem[] = []
  for (const it of representatives.values()) {
    const quantityInDecend = await countEmployeeVehiclesInWindow(it, tenantId, { start: decend.start, end: decend.end })
    if (!quantityInDecend) continue

    const matched = await findCommissionRule({
      tenantId,
      ruleType: 'BONUS_DEZENA',
      commissionKind: 'ALL',
      employee: {
        kind:       it.employeeKind,
        id:         it.employeeId,
        positionId: await resolvePositionId(it),
        role:       await resolveRole(it),
      },
      unitId,
      baseValue: 0,
      quantityInPeriod: quantityInDecend,
      decend: decend.code,
      date,
    })
    if (!matched) continue

    const commissionValue = computeCommissionValue(matched.rule, 0)
    if (commissionValue <= 0) continue
    const minQuantity = typeof matched.rule.fromQuantity === 'number'
      ? matched.rule.fromQuantity
      : matched.rule.fromQuantity == null
        ? null
        : Number(matched.rule.fromQuantity)
    const periodEndInclusive = new Date(decend.end.getTime() - 1)

    out.push({
      item: {
        ruleType:      'BONUS_DEZENA',
        commissionScope: 'DECEND_QUANTITY_BONUS',
        employeeKind:  it.employeeKind,
        employeeId:    it.employeeId,
        employeeUserId: it.employeeUserId ?? null,
        employeeLabel: it.employeeLabel,
        baseValue:     0,
        description:   `BÔNUS DEZENAL (${decend.label} — ${decend.rangeLabel}) — ${quantityInDecend} vendas — ${it.employeeLabel}`,
        reference:     {
          dealId,
          bonusPeriod: decend.key,
          bonusRuleId: matched.rule.id,
          decend: decend.code,
          periodStart: dateOnly(decend.start),
          periodEnd: dateOnly(periodEndInclusive),
          periodEndExclusive: dateOnly(decend.end),
          minQuantitySnapshot: minQuantity,
          quantitySnapshot: quantityInDecend,
          bonusAmountSnapshot: commissionValue,
          eligibleStatuses: [...COMMISSION_ELIGIBLE_DEAL_STATUSES],
        },
        periodQuantity: quantityInDecend,
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
