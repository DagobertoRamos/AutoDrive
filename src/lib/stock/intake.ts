// =============================================================================
// Esteira de entrada — parte com banco. Regras em ./intake-core (testadas).
// `syncIntake` é chamada depois de qualquer coisa que mexa na esteira:
// resolver pendência, mudar a cautelar, concluir a negociação de entrada,
// dar entrada pela avaliação. Idempotente.
// =============================================================================

import type { VehicleStockStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { GATE_INSPECTION, GATE_NEGOTIATION, intakeState, sameLabel, STAGE_SERVICES, type IntakeState } from './intake-core'
import { inspectionReady, servicesDone } from './prep-core'
import { countInspectionFiles } from './vehicle-files'

const CAUTELAR_LABEL: Record<string, string> = {
  APROVADA: 'aprovada', REPROVADA: 'reprovada', PENDENTE: 'pendente (laudo em andamento)', COM_APONTAMENTO: 'com apontamento',
}

type Actor = { id: string; name?: string | null; role?: string | null } | null

export async function syncIntake(vehicleId: string, actor: Actor = null): Promise<IntakeState | null> {
  const v = await prisma.vehicle.findUnique({
    where:  { id: vehicleId },
    select: {
      id: true, tenantId: true, stockStatus: true, cautelarStatus: true, originEvaluationId: true,
      stockPendencies: { select: { id: true, resolved: true, notes: true, option: { select: { label: true } } } },
      services: { select: { status: true } },
    },
  })
  if (!v) return null

  // Perícia é derivada da cautelar: "sem perícia" = pendente; qualquer outro status = ok.
  const insp = v.stockPendencies.find((p) => sameLabel(p.option.label, GATE_INSPECTION))
  if (insp) {
    const laudos = await countInspectionFiles(v.id, v.originEvaluationId)
    const ready = inspectionReady(v.cautelarStatus, laudos)
    const ok = ready.ok
    const note = ok
      ? `Perícia ${CAUTELAR_LABEL[String(v.cautelarStatus)] ?? String(v.cautelarStatus).toLowerCase()} · ${laudos} laudo(s) anexado(s).`
      : `Falta: ${ready.missing.join(' e ')}. Resolva na aba Cautelar.`
    if (ok !== insp.resolved || insp.notes !== note) {
      await prisma.vehicleStockPendency.update({
        where: { id: insp.id },
        data:  ok
          ? { resolved: true, notes: note, ...(insp.resolved ? {} : { resolvedAt: new Date(), resolvedById: actor?.id ?? null }) }
          : { resolved: false, resolvedAt: null, resolvedById: null, notes: note },
      })
      insp.resolved = ok
    }
  }

  // Serviços: com serviços de preparação cadastrados, a etapa é derivada deles.
  const svc = v.stockPendencies.find((p) => sameLabel(p.option.label, STAGE_SERVICES))
  if (svc && v.services.length > 0) {
    const done = servicesDone(v.services)
    if (done !== svc.resolved) {
      await prisma.vehicleStockPendency.update({
        where: { id: svc.id },
        data:  done ? { resolved: true, resolvedAt: new Date(), resolvedById: actor?.id ?? null } : { resolved: false, resolvedAt: null, resolvedById: null },
      })
      svc.resolved = done
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
        data:  { resolved: true, resolvedAt: new Date(), resolvedById: actor?.id ?? null, notes: `Negociação ${dv.deal.dealNumber ?? dealId} registrada.` },
      })
      await syncIntake(v.id, actor)
      n++
    }
  }
  return n
}

/** Negociação cancelada → reabre o portão "Negociação de entrada" dos carros que entrariam nela. */
export async function reopenNegotiationGate(dealId: string, actor: Actor = null): Promise<number> {
  const entering = await prisma.dealVehicle.findMany({
    where:  { dealId, role: { in: ['TROCA', 'COMPRADO', 'CONSIGNADO'] } },
    select: { vehicleId: true, plate: true, deal: { select: { tenantId: true, dealNumber: true } } },
  })
  let n = 0
  for (const dv of entering) {
    const plate = dv.plate?.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const vehicles = await prisma.vehicle.findMany({
      where: dv.vehicleId ? { id: dv.vehicleId } : plate ? { tenantId: dv.deal.tenantId, active: true, plate: { equals: plate, mode: 'insensitive' } } : { id: '__none__' },
      select: { id: true, stockPendencies: { where: { resolved: true }, select: { id: true, option: { select: { label: true } } } } },
    })
    for (const v of vehicles) {
      const gate = v.stockPendencies.find((p) => sameLabel(p.option.label, GATE_NEGOTIATION))
      if (!gate) continue
      // Outra negociação de entrada ainda ativa para o mesmo carro (ex.: cancelou
      // a duplicada)? Então a entrada continua valendo — não reabre.
      const other = await prisma.dealVehicle.findFirst({
        where: {
          dealId: { not: dealId },
          role:   { in: ['TROCA', 'COMPRADO', 'CONSIGNADO'] },
          OR:     [{ vehicleId: v.id }, ...(plate ? [{ plate }] : [])],
          deal:   { tenantId: dv.deal.tenantId, status: { notIn: ['CANCELADA', 'RECUSADA', 'DESAPROVADA'] as never[] } },
        },
        select: { deal: { select: { dealNumber: true } } },
      })
      if (other) {
        await prisma.vehicleStockPendency.update({ where: { id: gate.id }, data: { notes: `Negociação ${other.deal.dealNumber ?? ''} ativa (a ${dv.deal.dealNumber ?? dealId} foi cancelada).` } })
        continue
      }
      await prisma.vehicleStockPendency.update({
        where: { id: gate.id },
        data:  { resolved: false, resolvedAt: null, resolvedById: null, notes: `Negociação ${dv.deal.dealNumber ?? dealId} cancelada: cadastre a negociação de entrada novamente.` },
      })
      await syncIntake(v.id, actor)
      n++
    }
  }
  return n
}
