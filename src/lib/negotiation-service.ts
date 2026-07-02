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
    metadata?: unknown
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
      metadata: params.metadata as never,
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
  // Mantido por compat — delega ao novo `calculateNegotiationFinancialSummary`.
  const s = calculateNegotiationFinancialSummary({
    vehicleValue:     input.vehicleValue,
    debts:            input.debts,
    services:         input.services,
    servicesAmount:   input.servicesAmount,
    payments:         input.payments as any,
    discountRequests: input.discountRequests,
    changes:          input.changes,
  })
  return {
    totalBruto:            s.grossTotal,
    totalLiquido:          s.netTotal,
    totalPago:             s.paidTotal,
    saldo:                 s.openBalance,
    totalTroco:            s.changeTotal,
    totalDiscountApproved: s.discountApprovedTotal,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fonte ÚNICA de verdade do cálculo financeiro da negociação.
// Usada por backend (saved totals, validação de finalize) e por todos os
// componentes do frontend que mostram resumo financeiro — evita divergência
// entre Phase2Panel, DealSummary, DealValuesCard etc.
// ─────────────────────────────────────────────────────────────────────────────

export interface FinancialPayment {
  value:  any | number | null
  /** PENDENTE | CONFIRMADO | CANCELADO — CANCELADO sempre ignorado no totalPago. */
  status?: string | null
  type?:   string | null
}

export interface FinancialSummaryInput {
  vehicleValue?:     number | null
  servicesAmount?:   number | null
  /** Taxas/documentação (deal.documentationFee). */
  fees?:             number | null
  /** Garantias contratadas (DealWarranty[]). */
  warranties?:       Array<{ value: any | number | null; status?: string | null }>
  debts?:            Array<{ value: any | number | null }>
  services?:         Array<{ value: any | number | null }>
  payments?:         FinancialPayment[]
  discountRequests?: Array<{ status: string; approvedValue?: any | number | null; requestedValue?: any | number | null }>
  /** Desconto cru no deal (deal.discountAmount) — somado aos approvedRequests. */
  flatDiscount?:     number | null
  changes?:          Array<{ value: any | number | null }>
}

export type FinancialPaymentStatus = 'QUITADO' | 'PARCIAL' | 'ABERTO' | 'EXCEDENTE' | 'SEM_OPERACAO'

export interface FinancialSummary {
  vehicleAmount:          number
  debtAmount:             number
  serviceAmount:          number
  warrantyAmount:         number
  feeAmount:              number
  discountApprovedTotal:  number
  grossTotal:             number
  netTotal:               number
  paidConfirmed:          number
  paidPending:            number
  paidTotal:              number      // confirmed + pending (display)
  openBalance:            number      // netTotal − paidTotal
  changeTotal:            number
  paymentStatus:          FinancialPaymentStatus
  warnings:               string[]
}

const PAID_STATUSES = new Set(['CONFIRMADO', 'PAGO'])
const PENDING_STATUSES = new Set(['PENDENTE', null, undefined, ''])
// CANCELADO/ESTORNADO/RECUSADO → ignorados

export function calculateNegotiationFinancialSummary(
  input: FinancialSummaryInput,
): FinancialSummary {
  const warnings: string[] = []

  const vehicleAmount  = toNum(input.vehicleValue)
  const debtAmount     = (input.debts ?? []).reduce((s, d) => s + toNum(d.value), 0)
  const serviceAmount  = (input.services ?? []).reduce((s, x) => s + toNum(x.value), 0)
                          || toNum(input.servicesAmount)
  const warrantyAmount = (input.warranties ?? [])
    .filter(w => !w.status || w.status !== 'CANCELADA')
    .reduce((s, w) => s + toNum(w.value), 0)
  const feeAmount      = toNum(input.fees)

  // Pagamentos — divide por status (CONFIRMADO/PENDENTE), ignora CANCELADO
  let paidConfirmed = 0
  let paidPending   = 0
  for (const p of input.payments ?? []) {
    const v = toNum(p.value)
    const s = (p.status ?? '').toUpperCase()
    if (s === 'CANCELADO' || s === 'ESTORNADO' || s === 'RECUSADO') continue
    if (PAID_STATUSES.has(s)) paidConfirmed += v
    else if (PENDING_STATUSES.has(s as any) || s === 'PENDENTE') paidPending += v
    else paidPending += v   // status desconhecido vira "pendente" por segurança
  }
  const paidTotal = paidConfirmed + paidPending

  // Descontos: pedidos aprovados + desconto flat do deal
  const discountFromRequests = (input.discountRequests ?? [])
    .filter(r => r.status === 'APROVADO')
    .reduce((s, r) => s + toNum(r.approvedValue ?? r.requestedValue), 0)
  const discountApprovedTotal = discountFromRequests + toNum(input.flatDiscount)

  const changeTotal = (input.changes ?? []).reduce((s, c) => s + toNum(c.value), 0)

  // grossTotal = veículo + débitos + serviços + garantias + taxas
  const grossTotal = vehicleAmount + debtAmount + serviceAmount + warrantyAmount + feeAmount
  const netTotal   = grossTotal - discountApprovedTotal
  const openBalance = netTotal - paidTotal

  // Status financeiro
  let paymentStatus: FinancialPaymentStatus = 'SEM_OPERACAO'
  if (netTotal > 0) {
    if (Math.abs(openBalance) < 0.01) paymentStatus = 'QUITADO'
    else if (openBalance > 0)         paymentStatus = paidTotal > 0 ? 'PARCIAL' : 'ABERTO'
    else                              paymentStatus = 'EXCEDENTE'
  }

  // Warnings
  if (vehicleAmount <= 0 && netTotal <= 0) warnings.push('Operação sem valor do veículo.')
  if (paidPending > 0 && paidConfirmed === 0 && paymentStatus === 'QUITADO') {
    warnings.push('Saldo zerado, mas pagamentos ainda estão pendentes de confirmação.')
  }
  if (paymentStatus === 'EXCEDENTE' && changeTotal + 0.01 < Math.abs(openBalance)) {
    warnings.push('Há valor excedente sem troco cadastrado.')
  }

  return {
    vehicleAmount,
    debtAmount,
    serviceAmount,
    warrantyAmount,
    feeAmount,
    discountApprovedTotal,
    grossTotal,
    netTotal,
    paidConfirmed,
    paidPending,
    paidTotal,
    openBalance,
    changeTotal,
    paymentStatus,
    warnings,
  }
}

/** Helper: dado um Deal carregado do Prisma, retorna o input já adaptado. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dealToFinancialInput(deal: any): FinancialSummaryInput {
  const firstVehAgreed = (deal?.vehicles ?? []).find((v: any) => toNum(v.agreedValue) > 0)?.agreedValue
  const vehicleValue = toNum(deal?.saleAmount ?? deal?.purchaseAmount ?? deal?.vehicleValue ?? firstVehAgreed)
  return {
    vehicleValue,
    fees:             toNum(deal?.documentationFee),
    flatDiscount:     toNum(deal?.discountAmount),
    debts:            deal?.debts ?? [],
    services:         deal?.services ?? [],
    warranties:       deal?.warranties ?? [],
    payments:         deal?.payments ?? [],
    discountRequests: deal?.discountRequests ?? [],
    changes:          deal?.changes ?? [],
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
