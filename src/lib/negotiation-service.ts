// =============================================================================
// negotiation-service.ts — Serviços centrais de negociação
// =============================================================================

import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'

// ── Geração de número de negociação ──────────────────────────────────────────

export async function generateDealNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const count = await prisma.deal.count({
    where: { tenantId, dealNumber: { startsWith: `NEG-${year}-` } },
  })

  const seq = String(count + 1).padStart(4, '0')
  return `NEG-${year}-${seq}`
}

// ── Auditoria de deal ─────────────────────────────────────────────────────────

export async function createDealAudit(
  tx: PrismaClient,
  params: {
    dealId: string
    tenantId?: string | null
    unitId?: string | null
    userId?: string
    userName?: string
    userRole?: string
    action: string
    field?: string
    oldValue?: unknown
    newValue?: unknown
    reason?: string
  },
): Promise<void> {
  await (tx.dealAuditLog as any).create({
    data: {
      dealId:   params.dealId,
      tenantId: params.tenantId ?? null,
      unitId:   params.unitId   ?? null,
      userId:   params.userId   ?? null,
      userName: params.userName ?? null,
      userRole: params.userRole ?? null,
      action:   params.action,
      field:    params.field    ?? null,
      oldValue: params.oldValue != null ? String(params.oldValue) : null,
      newValue: params.newValue != null ? String(params.newValue) : null,
      reason:   params.reason   ?? null,
    },
  })
}

// ── Histórico de status ───────────────────────────────────────────────────────

export async function createStatusHistory(
  tx: PrismaClient,
  dealId: string,
  previousStatus: string | null,
  newStatus: string,
  userId: string,
  reason?: string,
): Promise<void> {
  await tx.dealStatusHistory.create({
    data: {
      dealId,
      previousStatus: previousStatus ?? null,
      newStatus,
      changedByUserId: userId,
      reason: reason ?? null,
    },
  })
}

// ── Cálculo de totais ─────────────────────────────────────────────────────────

export function computeDealTotals(data: {
  saleAmount?: number | null
  purchaseAmount?: number | null
  tradeValue?: number | null
  signalAmount?: number | null
  financedAmount?: number | null
  documentationFee?: number | null
  servicesAmount?: number | null
  discountAmount?: number | null
  payoffAmount?: number | null
  changeAmount?: number | null
}): {
  totalPayments: number
  balance: number
  marginAmount: number
} {
  const sale       = Number(data.saleAmount     ?? 0)
  const purchase   = Number(data.purchaseAmount ?? 0)
  const trade      = Number(data.tradeValue     ?? 0)
  const signal     = Number(data.signalAmount   ?? 0)
  const financed   = Number(data.financedAmount ?? 0)
  const docFee     = Number(data.documentationFee ?? 0)
  const services   = Number(data.servicesAmount ?? 0)
  const discount   = Number(data.discountAmount ?? 0)
  const payoff     = Number(data.payoffAmount   ?? 0)

  // total a receber: sinal + financiamento + serviços + taxa doc
  const totalPayments = signal + financed + services + docFee

  // saldo: venda - desconto - troca - pagamentos recebidos
  const balance = (sale - discount) - trade - totalPayments

  // margem: venda - compra - desconto - payoff de veículo de troca
  const marginAmount = sale - purchase - discount - payoff

  return { totalPayments, balance, marginAmount }
}

// ── Regra de comissão: TROCA usa mesma base de VENDA ─────────────────────────
//
// REGRA OBRIGATÓRIA (negócio):
// Venda e Troca têm a mesma regra de comissão.
// Troca NÃO gera comissão extra pelo veículo recebido.
// Não duplicar comissão em negociação de troca.
// O veículo recebido na troca não cria comissão adicional automática.
//
// Uso: ao calcular comissão de qualquer deal, normalizar o tipo primeiro:
//   const commissionType = normalizeCommissionType(deal.type)
//   const matched = await findCommissionRule({
//     tenantId, ruleType: commissionType,
//     employee: { kind: 'SELLER', id: deal.sellerId, positionId, role },
//     baseValue: Number(deal.saleAmount ?? 0),
//   })
//   // ver: src/lib/commission-matcher.ts

export function normalizeCommissionType(dealType: string): string {
  // TROCA usa a mesma regra de VENDA — sem multiplicador ou comissão extra
  if (dealType === 'TROCA') return 'VENDA'
  return dealType
}

// ── Saldo da negociação (Phase 2: payments + discount requests + change) ────

export interface DealBalanceInput {
  vehicleValue?:    number | null
  servicesAmount?:  number | null
  debts?:           Array<{ value: any | number | null }>
  services?:        Array<{ value: any | number | null }>
  payments?:        Array<{ value: any | number | null }>
  discountRequests?: Array<{ status: string; approvedValue?: any | number | null; requestedValue?: any | number | null }>
  changes?:         Array<{ value: any | number | null }>
}

export interface DealBalanceResult {
  totalBruto:   number
  totalLiquido: number
  totalPago:    number
  saldo:        number
  totalTroco:   number
  totalDiscountApproved: number
}

function toNum(v: any | number | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function computeDealBalance(input: DealBalanceInput): DealBalanceResult {
  const vehicle = toNum(input.vehicleValue)
  const debts   = (input.debts ?? []).reduce((s, d) => s + toNum(d.value), 0)
  const services = (input.services ?? []).reduce((s, x) => s + toNum(x.value), 0)
                  || toNum(input.servicesAmount)
  const payments = (input.payments ?? []).reduce((s, p) => s + toNum(p.value), 0)
  const discountApproved = (input.discountRequests ?? [])
    .filter(r => r.status === 'APROVADO')
    .reduce((s, r) => s + toNum(r.approvedValue ?? r.requestedValue), 0)
  const troco = (input.changes ?? []).reduce((s, c) => s + toNum(c.value), 0)

  const totalBruto = vehicle + debts + services
  const totalLiquido = totalBruto - discountApproved
  const totalPago = payments
  const saldo = totalLiquido - totalPago

  return {
    totalBruto,
    totalLiquido,
    totalPago,
    saldo,
    totalTroco: troco,
    totalDiscountApproved: discountApproved,
  }
}

// ── Atualizar estoque do veículo ──────────────────────────────────────────────

export async function updateVehicleStock(
  tx: PrismaClient,
  vehicleId: string,
  stockStatus: string,
): Promise<void> {
  await tx.vehicle.update({
    where: { id: vehicleId },
    data:  { stockStatus: stockStatus as any },
  })
}
