// =============================================================================
// Esteira de entrada — parte com banco. Regras em ./intake-core (testadas).
// `syncIntake` é chamada depois de qualquer coisa que mexa na esteira:
// resolver pendência, mudar a cautelar, concluir a negociação de entrada,
// dar entrada pela avaliação. Idempotente.
// =============================================================================

import type { VehicleStockStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { GATE_INSPECTION, GATE_NEGOTIATION, inspectionOk, intakeState, sameLabel, type IntakeState } from './intake-core'

const CAUTELAR_LABEL: Record<string, string> = {
  APROVADA: 'aprovada', REPROVADA: 'reprovada', PENDENTE: 'pendente (laudo em andamento)', COM_APONTAMENTO: 'com apontamento',
}

type Actor = { id: string; name?: string | null; role?: string | null } | null

export async function syncIntake(vehicleId: string, actor: Actor = null): Promise<IntakeState | null> {
  const v = await prisma.vehicle.findUnique({
    where:  { id: vehicleId },
    select: {
      id: true, tenantId: true, stockStatus: true, cautelarStatus: true,
      stockPendencies: { select: { id: true, resolved: true, notes: true, option: { select: { label: true } } } },
    },
  })
  if (!v) return null

  // Perícia é derivada da cautelar: "sem perícia" = pendente; qualquer outro status = ok.
  const insp = v.stockPendencies.find((p) => sameLabel(p.option.label, GATE_INSPECTION))
  if (insp) {
    const ok = inspectionOk(v.cautelarStatus)
    const note = ok ? `Perícia ${CAUTELAR_LABEL[String(v.cautelarStatus)] ?? String(v.cautelarStatus).toLowerCase()}.` : 'Sem perícia registrada: solicite a cautelar.'
    if (ok !== insp.resolved || (ok && insp.notes !== note)) {
      await prisma.vehicleStockPendency.update({
        where: { id: insp.id },
        data:  ok
          ? { resolved: true, notes: note, ...(insp.resolved ? {} : { resolvedAt: new Date(), resolvedById: actor?.id ?? null }) }
          : { resolved: false, resolvedAt: null, resolvedById: null, notes: note },
      })
      insp.resolved = ok
    }
  }

  const state = intakeState(v.stockPendencies.map((p) => ({ label: p.option.label, resolved: p.resolved })), v.stockStatus)
  if (state.nextStatus) {
    await prisma.vehicle.update({ where: { id: v.id }, data: { stockStatus: state.nextStatus as VehicleStockStatus } })
    await prisma.auditLog.create({
      data: {
        userId: actor?.id ?? null, tenantId: v.tenantId ?? null, action: 'STOCK_INTAKE_STATUS', entity: 'Vehicle', entityId: v.id,
        userName: actor?.name ?? 'Esteira de entrada', userRole: actor?.role ?? null, status: 'SUCCESS',
        beforeData: { stockStatus: v.stockStatus } as never,
        afterData:  { stockStatus: state.nextStatus, gatesDone: state.gatesDone, servicesOpen: state.servicesOpen } as never,
      },
    }).catch(() => {})
  }
  return state
}

/**
 * Negociação concluída → resolve o portão "Negociação de entrada" dos carros
 * que ENTRARAM nela (troca/compra/consignação), por vínculo ou placa.
 */
export async function resolveNegotiationGate(dealId: string, actor: Actor = null): Promise<number> {
  const entering = await prisma.dealVehicle.findMany({
    where:  { dealId, role: { in: ['TROCA', 'COMPRADO', 'CONSIGNADO'] } },
    select: { vehicleId: true, plate: true, deal: { select: { tenantId: true, dealNumber: true } } },
  })
  let n = 0
  for (const dv of entering) {
    const plate = dv.plate?.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const vehicles = await prisma.vehicle.findMany({
      where: dv.vehicleId
        ? { id: dv.vehicleId }
        : plate ? { tenantId: dv.deal.tenantId, active: true, plate: { equals: plate, mode: 'insensitive' } } : { id: '__none__' },
      select: { id: true, stockPendencies: { where: { resolved: false }, select: { id: true, notes: true, option: { select: { label: true } } } } },
    })
    for (const v of vehicles) {
      const gate = v.stockPendencies.find((p) => sameLabel(p.option.label, GATE_NEGOTIATION))
      if (!gate) continue
      await prisma.vehicleStockPendency.update({
        where: { id: gate.id },
        data:  { resolved: true, resolvedAt: new Date(), resolvedById: actor?.id ?? null, notes: `Negociação ${dv.deal.dealNumber ?? dealId} concluída.` },
      })
      await syncIntake(v.id, actor)
      n++
    }
  }
  return n
}
