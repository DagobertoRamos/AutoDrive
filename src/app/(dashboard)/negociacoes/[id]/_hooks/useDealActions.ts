// =============================================================================
// useDealActions — fonte única de verdade para estado de ações na tela de deal
// =============================================================================
//
// Centraliza saldo + permissões + razões de bloqueio. Tanto a barra de ações
// quanto o Phase2Panel devem consumir este hook (sem duplicar lógica).
// =============================================================================

import { useMemo } from 'react'
import {
  canEditDeal,
  canFinalize,
  canReopen,
  canAddPayment,
  canApproveDiscount,
  canForceFinalize,
  isDealLocked,
} from '@/lib/negotiation-rbac'
import { computeDealBalance, type DealBalanceResult } from '@/lib/negotiation-service'
import { FINALIZABLE_STATUSES } from '@/lib/negotiation-permissions'
import { formatBRL } from '@/lib/masks'

// Tipos mínimos — propositalmente frouxos para servir ao payload da página.
export interface DealActionsActor {
  id?:       string | null
  role:      string
  tenantId?: string | null
  sellerId?: string | null
}

export interface DealActionsDeal {
  id:           string
  dealNumber?:  string | null
  status:       string
  sellerId?:    string | null
  vehicleValue?: any | number | null
  saleAmount?:   any | number | null
  servicesAmount?: any | number | null
  debts?:    Array<{ value: any | number | null }>
  services?: Array<{ value: any | number | null }>
  payments?: Array<{ value: any | number | null }>
  discountRequests?: Array<{ status: string; approvedValue?: any | number | null; requestedValue?: any | number | null }>
  changes?:  Array<{ value: any | number | null }>
  seller?:   { user?: { role?: string | null } | null } | null
}

export interface DealActions {
  balance:               DealBalanceResult
  saldo:                 number
  saldoStatus:           'zerado' | 'aberto' | 'excedente'
  isLocked:              boolean
  isFinalizable:         boolean
  canFinalizeNow:        boolean
  canForceFinalize:      boolean
  canReopenNow:          boolean
  canEditNow:            boolean
  canAddPaymentNow:      boolean
  canApproveDiscountNow: boolean
  finalizeDisabledReason: string | null
}

export function useDealActions(
  deal: DealActionsDeal | null | undefined,
  actor: DealActionsActor | null | undefined,
): DealActions {
  return useMemo(() => {
    const empty: DealBalanceResult = {
      totalBruto: 0, totalLiquido: 0, totalPago: 0, saldo: 0, totalTroco: 0, totalDiscountApproved: 0,
    }
    if (!deal || !actor) {
      return {
        balance: empty,
        saldo: 0,
        saldoStatus: 'zerado',
        isLocked: false,
        isFinalizable: false,
        canFinalizeNow: false,
        canForceFinalize: false,
        canReopenNow: false,
        canEditNow: false,
        canAddPaymentNow: false,
        canApproveDiscountNow: false,
        finalizeDisabledReason: 'Carregando…',
      }
    }

    const balance = computeDealBalance({
      vehicleValue:     deal.vehicleValue != null ? Number(deal.vehicleValue) : Number(deal.saleAmount ?? 0),
      servicesAmount:   deal.servicesAmount != null ? Number(deal.servicesAmount) : 0,
      debts:            deal.debts,
      services:         deal.services,
      payments:         deal.payments,
      discountRequests: deal.discountRequests,
      changes:          deal.changes,
    })

    const saldo = balance.saldo
    const saldoStatus: 'zerado' | 'aberto' | 'excedente' =
      saldo > 0.009 ? 'aberto'
      : saldo < -0.009 ? 'excedente'
      : 'zerado'

    const isLocked      = isDealLocked(deal.status)
    const isFinalizable = FINALIZABLE_STATUSES.has(deal.status)
    const baseFinalize  = canFinalize(actor, deal as any) && isFinalizable
    const forceAllowed  = canForceFinalize(actor)

    // Saldo precisa estar zerado (ou excedente coberto por troco)
    const excedente   = saldoStatus === 'excedente' ? -saldo : 0
    const trocoOk     = saldoStatus !== 'excedente' || (balance.totalTroco + 0.009 >= excedente)
    const saldoOk     = saldoStatus === 'zerado' || (saldoStatus === 'excedente' && trocoOk)

    const canFinalizeNow = baseFinalize && saldoOk

    let finalizeDisabledReason: string | null = null
    if (!isFinalizable) {
      finalizeDisabledReason = 'Status atual não permite finalização.'
    } else if (isLocked) {
      finalizeDisabledReason = 'Negociação trancada (já finalizada).'
    } else if (!canFinalize(actor, deal as any)) {
      finalizeDisabledReason = 'Sem permissão para finalizar.'
    } else if (!saldoOk) {
      const parts: string[] = []
      if (saldoStatus === 'aberto')     parts.push(`em aberto: ${formatBRL(saldo)}`)
      if (saldoStatus === 'excedente')  parts.push(`excedente: ${formatBRL(excedente - balance.totalTroco)}`)
      finalizeDisabledReason = `Resolva o saldo antes de finalizar (${parts.join(' / ')}).`
    }

    return {
      balance,
      saldo,
      saldoStatus,
      isLocked,
      isFinalizable,
      canFinalizeNow,
      canForceFinalize:      forceAllowed,
      canReopenNow:          canReopen(actor, deal as any),
      canEditNow:            canEditDeal(actor, deal as any),
      canAddPaymentNow:      canAddPayment(actor, deal as any),
      canApproveDiscountNow: canApproveDiscount(actor, deal as any),
      finalizeDisabledReason,
    }
  }, [deal, actor])
}
