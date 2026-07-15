// =============================================================================
// Service interno para o módulo Avaliação.
// Concentra: load do contexto (com checagem de tenant), recalculo de totais,
// e tipos compartilhados entre APIs.
// =============================================================================

import { prisma } from '@/lib/prisma'

export interface LoadedEvaluation {
  id:           string
  tenantId:     string | null
  unitId:       string | null
  status:       string
  evaluatorId:  string | null
  /** Identificadores do veículo — usados para validar troca de CRLV. */
  plate:        string | null
  chassi:       string | null
  renavam:      string | null
  vehicleId:    string | null
}

/**
 * Carrega contexto mínimo da avaliação para checagens de RBAC.
 * Retorna null se não existe.
 */
export async function loadEvaluationContext(id: string): Promise<LoadedEvaluation | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e: any = await prisma.vehicleEvaluation.findUnique({
    where:  { id },
    select: {
      id: true, tenantId: true, unitId: true,
      status: true, evaluatedById: true,
      plate: true, chassi: true, renavam: true, vehicleId: true,
    },
  })
  if (!e) return null
  return {
    id:          e.id,
    tenantId:    e.tenantId    ?? null,
    unitId:      e.unitId      ?? null,
    status:      e.status      ?? 'DRAFT',
    evaluatorId: e.evaluatedById ?? null,
    plate:       e.plate       ?? null,
    chassi:      e.chassi      ?? null,
    renavam:     e.renavam     ?? null,
    vehicleId:   e.vehicleId   ?? null,
  }
}

/**
 * Recalcula totalExpenses somando todos os EvaluationService da avaliação
 * e atualiza a tabela VehicleEvaluation. Best-effort.
 */
export async function recalcTotals(evaluationId: string): Promise<number> {
  try {
     
    const services: Array<{ estimatedCost: { toNumber(): number } | null }> =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).evaluationService.findMany({
        where: { evaluationId, status: { not: 'CANCELED' } },
        select: { estimatedCost: true },
      })
    const total = services.reduce((sum, s) => {
      const v = s.estimatedCost ? Number(s.estimatedCost) : 0
      return sum + (isNaN(v) ? 0 : v)
    }, 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).vehicleEvaluation.update({
      where: { id: evaluationId },
      data:  { totalExpenses: total },
    })
    return total
  } catch {
    return 0
  }
}

/**
 * Recalcula totalExpenses de um item específico (somando os services dele).
 */
export async function recalcItemTotal(itemId: string): Promise<number> {
  try {
     
    const services: Array<{ estimatedCost: { toNumber(): number } | null }> =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma as any).evaluationService.findMany({
        where: { itemId, status: { not: 'CANCELED' } },
        select: { estimatedCost: true },
      })
    const total = services.reduce((sum, s) => {
      const v = s.estimatedCost ? Number(s.estimatedCost) : 0
      return sum + (isNaN(v) ? 0 : v)
    }, 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).evaluationItem.update({
      where: { id: itemId },
      data:  { totalExpenses: total },
    })
    return total
  } catch {
    return 0
  }
}
