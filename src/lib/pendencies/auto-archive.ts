import type { PendencyStatus, Prisma, UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { notDeletedPendencyWhere } from '@/lib/pendencies/access'
import {
  PENDENCY_SETTINGS_KEY_BASE,
  type PendencyAutoArchiveSettings,
  type PendencyAutoArchiveUnit,
  loadTenantPendencySettings,
  tenantIdFromPendencySettingsKey,
} from '@/lib/pendencies/settings'

const ELIGIBLE_STATUS: PendencyStatus[] = ['FINALIZADA']
const MANAGER_APPROVAL_ROLES: UserRole[] = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE']
const SYSTEM_USER_NAME = 'Sistema'
const SYSTEM_USER_ROLE = 'SYSTEM'

export interface AutoArchiveTenantResult {
  tenantId: string
  processed: number
  archived: number
  skipped: number
}

export interface AutoArchiveRunResult {
  tenantsScanned: number
  tenantsConfigured: number
  processed: number
  archived: number
  skipped: number
  errors: Array<{ tenantId: string; message: string }>
}

export function autoArchiveDurationMs(settings: PendencyAutoArchiveSettings): number {
  const unitMs: Record<PendencyAutoArchiveUnit, number> = {
    minutes: 60_000,
    hours: 3_600_000,
    days: 86_400_000,
  }
  return settings.afterValue * unitMs[settings.afterUnit]
}

export function autoArchiveCutoff(settings: PendencyAutoArchiveSettings, now = new Date()): Date {
  return new Date(now.getTime() - autoArchiveDurationMs(settings))
}

function buildEligibilityWhere(tenantId: string, settings: PendencyAutoArchiveSettings, cutoff: Date): Prisma.PendencyWhereInput {
  const where: Prisma.PendencyWhereInput = {
    tenantId,
    status: { in: ELIGIBLE_STATUS },
    resolvedAt: { lte: cutoff },
    AND: [notDeletedPendencyWhere()],
  }

  if (settings.onlyAfterManagerApproval) {
    where.OR = [
      { validatedAt: { not: null, lte: cutoff } },
      {
        statusHistory: {
          some: {
            newStatus: 'FINALIZADA',
            createdAt: { lte: cutoff },
            changedByUser: { is: { role: { in: MANAGER_APPROVAL_ROLES } } },
          },
        },
      },
    ]
  }

  if (settings.onlyIfNotReopened) {
    where.reopenedAt = null
  }

  return where
}

function autoArchiveReason(settings: PendencyAutoArchiveSettings): string {
  const unitLabel: Record<PendencyAutoArchiveUnit, string> = {
    minutes: 'minuto(s)',
    hours: 'hora(s)',
    days: 'dia(s)',
  }
  const approval = settings.onlyAfterManagerApproval ? ' e aprovação da gerência' : ''
  return `Arquivada automaticamente pelo sistema após ${settings.afterValue} ${unitLabel[settings.afterUnit]} da resolução${approval}.`
}

async function loadConfiguredTenantIds(): Promise<string[]> {
  const rows = await prisma.systemSetting.findMany({
    where: {
      key: {
        startsWith: 't:',
        endsWith: `:${PENDENCY_SETTINGS_KEY_BASE}`,
      },
    },
    select: { key: true },
  })
  return Array.from(new Set(rows.map((row) => tenantIdFromPendencySettingsKey(row.key)).filter((tenantId): tenantId is string => Boolean(tenantId))))
}

async function archiveTenantPendencies(params: {
  tenantId: string
  settings: PendencyAutoArchiveSettings
  now: Date
  limit: number
}): Promise<AutoArchiveTenantResult> {
  if (!params.settings.enabled) {
    return { tenantId: params.tenantId, processed: 0, archived: 0, skipped: 0 }
  }

  const cutoff = autoArchiveCutoff(params.settings, params.now)
  const where = buildEligibilityWhere(params.tenantId, params.settings, cutoff)
  const pendencies = await prisma.pendency.findMany({
    where,
    select: {
      id: true,
      status: true,
      cancelReason: true,
      resolvedAt: true,
      validatedAt: true,
      reopenedAt: true,
    },
    orderBy: { resolvedAt: 'asc' },
    take: params.limit,
  })

  const reason = autoArchiveReason(params.settings)
  let archived = 0
  let skipped = 0

  for (const pendency of pendencies) {
    const claim = await prisma.pendency.updateMany({
      where: {
        id: pendency.id,
        ...where,
      },
      data: {
        status: 'CANCELADA',
        cancelReason: reason,
        automaticSend: false,
        nextSendAt: null,
      },
    }).catch(() => ({ count: 0 }))

    if (claim.count !== 1) {
      skipped += 1
      continue
    }

    archived += 1
    await Promise.all([
      prisma.pendencyStatusHistory.create({
        data: {
          pendencyId: pendency.id,
          previousStatus: pendency.status,
          newStatus: 'CANCELADA',
          changedByUserId: null,
          reason,
        },
      }).catch(() => {}),
      prisma.auditLog.create({
        data: {
          tenantId: params.tenantId,
          userId: null,
          userName: SYSTEM_USER_NAME,
          userRole: SYSTEM_USER_ROLE,
          action: 'AUTO_ARCHIVE',
          entity: 'Pendency',
          entityId: pendency.id,
          beforeData: {
            status: pendency.status,
            resolvedAt: pendency.resolvedAt,
            validatedAt: pendency.validatedAt,
            reopenedAt: pendency.reopenedAt,
            cancelReason: pendency.cancelReason,
          },
          afterData: {
            status: 'CANCELADA',
            archived: true,
            reason,
          },
        },
      }).catch(() => {}),
    ])
  }

  return {
    tenantId: params.tenantId,
    processed: pendencies.length,
    archived,
    skipped,
  }
}

export async function archiveResolvedPendenciesJob(opts?: {
  tenantId?: string
  now?: Date
  limit?: number
}): Promise<AutoArchiveRunResult> {
  const now = opts?.now ?? new Date()
  const limit = Number.isFinite(opts?.limit) && opts?.limit ? Math.max(1, Math.min(Math.round(opts.limit), 500)) : 200
  const tenantIds = opts?.tenantId ? [opts.tenantId] : await loadConfiguredTenantIds()
  const result: AutoArchiveRunResult = {
    tenantsScanned: tenantIds.length,
    tenantsConfigured: 0,
    processed: 0,
    archived: 0,
    skipped: 0,
    errors: [],
  }

  for (const tenantId of tenantIds) {
    try {
      const settings = (await loadTenantPendencySettings(tenantId)).autoArchive
      if (settings.enabled) result.tenantsConfigured += 1
      const tenantResult = await archiveTenantPendencies({ tenantId, settings, now, limit })
      result.processed += tenantResult.processed
      result.archived += tenantResult.archived
      result.skipped += tenantResult.skipped
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push({ tenantId, message })
    }
  }

  return result
}
