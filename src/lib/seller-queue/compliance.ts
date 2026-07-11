import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { notifyPendency } from '@/services/notification.service'

export interface CompliancePilotConfig {
  enabled: boolean
  notifyManagers: boolean
  autoCreateManagerPendency: boolean
  requireConfirmedFraudForRanking: boolean
  timeoutPoints: number
  confirmedFraudMediumPoints: number
  confirmedFraudHighPoints: number
  reviewWindowDays: number
}

export interface ComplianceAdjustment {
  userId: string
  points: number
  timeoutEvents: number
  confirmedFrauds: number
  pendingFrauds: number
}

export const DEFAULT_COMPLIANCE_PILOT: CompliancePilotConfig = {
  enabled: false,
  notifyManagers: true,
  autoCreateManagerPendency: true,
  requireConfirmedFraudForRanking: true,
  timeoutPoints: 2,
  confirmedFraudMediumPoints: 8,
  confirmedFraudHighPoints: 20,
  reviewWindowDays: 7,
}

export function readCompliancePilotConfig(cfgConfig: unknown): CompliancePilotConfig {
  const raw = (cfgConfig as { compliancePilot?: Partial<CompliancePilotConfig> } | null | undefined)?.compliancePilot
  if (!raw) return DEFAULT_COMPLIANCE_PILOT
  return {
    enabled: raw.enabled ?? DEFAULT_COMPLIANCE_PILOT.enabled,
    notifyManagers: raw.notifyManagers ?? DEFAULT_COMPLIANCE_PILOT.notifyManagers,
    autoCreateManagerPendency: raw.autoCreateManagerPendency ?? DEFAULT_COMPLIANCE_PILOT.autoCreateManagerPendency,
    requireConfirmedFraudForRanking: raw.requireConfirmedFraudForRanking ?? DEFAULT_COMPLIANCE_PILOT.requireConfirmedFraudForRanking,
    timeoutPoints: raw.timeoutPoints ?? DEFAULT_COMPLIANCE_PILOT.timeoutPoints,
    confirmedFraudMediumPoints: raw.confirmedFraudMediumPoints ?? DEFAULT_COMPLIANCE_PILOT.confirmedFraudMediumPoints,
    confirmedFraudHighPoints: raw.confirmedFraudHighPoints ?? DEFAULT_COMPLIANCE_PILOT.confirmedFraudHighPoints,
    reviewWindowDays: raw.reviewWindowDays ?? DEFAULT_COMPLIANCE_PILOT.reviewWindowDays,
  }
}

function fraudPointsForSeverity(cfg: CompliancePilotConfig, severity: string | null | undefined): number {
  if (severity === 'HIGH') return cfg.confirmedFraudHighPoints
  if (severity === 'MEDIUM') return cfg.confirmedFraudMediumPoints
  if (severity === 'LOW') return Math.max(1, Math.round(cfg.confirmedFraudMediumPoints / 2))
  return cfg.confirmedFraudMediumPoints
}

export async function computeComplianceAdjustments(opts: {
  tenantId: string
  unitId?: string | null
  window: { start: Date; end: Date }
  excludeUnitIds?: string[]
}): Promise<Map<string, ComplianceAdjustment>> {
  const { tenantId, unitId = null, window, excludeUnitIds = [] } = opts
  const unitConfigs = await prisma.sellerQueueUnitConfig.findMany({
    where: {
      tenantId,
      ...(unitId ? { unitId } : {}),
      ...(!unitId && excludeUnitIds.length ? { unitId: { notIn: excludeUnitIds } } : {}),
    },
    select: { unitId: true, config: true },
  })
  const cfgByUnit = new Map(unitConfigs.map((row) => [row.unitId, readCompliancePilotConfig(row.config)]))
  const enabledUnits = new Set(unitConfigs.filter((row) => readCompliancePilotConfig(row.config).enabled).map((row) => row.unitId))
  if (!enabledUnits.size) return new Map()

  const [timeouts, fraudFlags] = await Promise.all([
    prisma.sellerQueuePenalty.findMany({
      where: {
        tenantId,
        type: 'TIMEOUT',
        createdAt: { gte: window.start, lte: window.end },
        unitId: { in: [...enabledUnits] },
      },
      select: { sellerId: true, unitId: true },
    }),
    prisma.sellerQueueFraudFlag.findMany({
      where: {
        tenantId,
        createdAt: { gte: window.start, lte: window.end },
        unitId: { in: [...enabledUnits] },
        sellerId: { not: null },
      },
      select: { sellerId: true, unitId: true, status: true, severity: true },
    }),
  ])

  const byUser = new Map<string, ComplianceAdjustment>()
  const getRow = (userId: string): ComplianceAdjustment => {
    let row = byUser.get(userId)
    if (!row) {
      row = { userId, points: 0, timeoutEvents: 0, confirmedFrauds: 0, pendingFrauds: 0 }
      byUser.set(userId, row)
    }
    return row
  }

  for (const timeout of timeouts) {
    const cfg = cfgByUnit.get(timeout.unitId)
    if (!cfg?.enabled) continue
    const row = getRow(timeout.sellerId)
    row.timeoutEvents += 1
    row.points -= cfg.timeoutPoints
  }

  for (const flag of fraudFlags) {
    if (!flag.sellerId) continue
    const cfg = cfgByUnit.get(flag.unitId ?? '')
    if (!cfg?.enabled) continue
    const row = getRow(flag.sellerId)
    if (flag.status === 'CONFIRMED') {
      row.confirmedFrauds += 1
      row.points -= fraudPointsForSeverity(cfg, flag.severity)
      continue
    }
    if (flag.status === 'OPEN' || flag.status === 'REVIEWED') {
      row.pendingFrauds += 1
      if (!cfg.requireConfirmedFraudForRanking) {
        row.points -= fraudPointsForSeverity(cfg, flag.severity)
      }
    }
  }

  return byUser
}

async function resolveResponsibleSellerId(unitId: string, sellerUserId: string | null): Promise<string | null> {
  if (sellerUserId) {
    const seller = await prisma.seller.findFirst({
      where: { unitId, userId: sellerUserId, active: true },
      select: { id: true },
    })
    if (seller) return seller.id
  }
  const fallback = await prisma.seller.findFirst({
    where: { unitId, active: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  return fallback?.id ?? null
}

export async function runQueueComplianceSweep(): Promise<{
  scanned: number
  createdPendencies: number
  notified: number
  skipped: number
}> {
  const configs = await prisma.sellerQueueUnitConfig.findMany({
    select: { tenantId: true, unitId: true, config: true },
  })
  const enabled = configs
    .map((row) => ({ tenantId: row.tenantId, unitId: row.unitId, compliance: readCompliancePilotConfig(row.config) }))
    .filter((row) => row.compliance.enabled)

  let scanned = 0
  let createdPendencies = 0
  let notified = 0
  let skipped = 0

  for (const row of enabled) {
    const compliance = row.compliance
    const since = new Date(Date.now() - compliance.reviewWindowDays * 86400000)
    const flags = await prisma.sellerQueueFraudFlag.findMany({
      where: {
        tenantId: row.tenantId,
        unitId: row.unitId,
        status: { in: ['OPEN', 'REVIEWED'] },
        severity: { in: ['MEDIUM', 'HIGH'] },
        createdAt: { gte: since },
      },
      select: { id: true, sellerId: true, severity: true, kind: true, detail: true, createdAt: true },
      take: 100,
    })
    scanned += flags.length

    for (const flag of flags) {
      const exists = await prisma.pendency.findFirst({
        where: {
          tenantId: row.tenantId,
          originModule: 'SELLER_QUEUE_COMPLIANCE',
          originRecordId: flag.id,
          status: { in: ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_RESPOSTA', 'PAUSADA', 'REATIVADA'] },
        },
        select: { id: true },
      })
      if (exists) {
        skipped += 1
        continue
      }

      const responsibleId = await resolveResponsibleSellerId(row.unitId, flag.sellerId)
      if (!responsibleId) {
        skipped += 1
        continue
      }

      let pendencyId: string | null = null
      if (compliance.autoCreateManagerPendency) {
        const slaHours = flag.severity === 'HIGH' ? 4 : 24
        const pendency = await prisma.pendency.create({
          data: {
            tenantId: row.tenantId,
            responsibleId,
            unitId: row.unitId,
            customerName: 'Conformidade operacional',
            description: `Revisar ocorrência de conformidade da fila: ${flag.kind}.${flag.detail ? ` ${flag.detail}` : ''}`,
            priority: flag.severity === 'HIGH' ? 'URGENTE' : 'ALTA',
            severity: flag.severity,
            status: 'ABERTA',
            type: 'CONFORMIDADE_FILA',
            originModule: 'SELLER_QUEUE_COMPLIANCE',
            originRecordId: flag.id,
            slaMinutes: slaHours * 60,
            slaDeadline: new Date(Date.now() + slaHours * 3600000),
            automaticSend: false,
            allowedDays: [],
            source: 'COMPLIANCE_SWEEP',
            notes: `Caso em revisão da fila. Status atual da suspeita: ${flag.severity === 'HIGH' ? 'prioridade alta' : 'revisão gerencial'}.`,
          },
        })
        pendencyId = pendency.id
        createdPendencies += 1
      }

      if (compliance.notifyManagers) {
        await notifyPendency({
          pendencyId: pendencyId ?? flag.id,
          tenantId: row.tenantId,
          unitId: row.unitId,
          type: 'PENDENCIA_CRITICA',
          title: 'Ocorrência de conformidade da fila para revisão',
          message: `${flag.kind} em revisão gerencial${flag.detail ? `: ${flag.detail}` : '.'}`,
          actionUrl: '/pendencias/central',
          notifyRoles: ['GERENTE', 'GERENTE_GERAL', 'ADM'],
        })
        notified += 1
      }

      await createSafeAuditLog({
        userId: flag.sellerId ?? 'system',
        tenantId: row.tenantId,
        action: 'QUEUE_COMPLIANCE_CASE_CREATED',
        entity: 'SellerQueueFraudFlag',
        entityId: flag.id,
        status: 'SUCCESS',
        afterData: {
          severity: flag.severity,
          kind: flag.kind,
          pendencyId,
          mode: 'pilot',
        } as never,
      })
    }
  }

  return { scanned, createdPendencies, notified, skipped }
}
