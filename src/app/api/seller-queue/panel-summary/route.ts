import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { queueDate , unitFromRequest, getUnitConfig } from '@/lib/seller-queue/queue'
import { assertModuleEnabled, canAccessModuleForUser } from '@/lib/tenant-modules'
import { autoCheckoutStalePauses, isQueueOpenNow, AUTO_PAUSE_REASON } from '@/lib/seller-queue/automation'
import { sweepExpiredCalls } from '@/lib/seller-queue/call'

export const dynamic = 'force-dynamic'

const HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
}

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'sellerQueue.view')) return forbiddenResponse('Sem acesso à fila.')
  { const gate = await assertModuleEnabled(user, 'sellerQueue.view'); if (gate) return gate }
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const unitId = unitFromRequest(req, user.unitId)
  if (!unitId) return NextResponse.json({ success: false, error: 'Informe a unidade (?unitId=) ou tenha unidade vinculada.' }, { status: 400, headers: HEADERS })

  try {
    const ucfg = await getUnitConfig(tenantId, unitId)
    const alerts = {
      sound: ucfg?.alertSound ?? true,
      soundType: ucfg?.alertSoundType ?? 'siren',
    }
    const cfgExtras = (ucfg?.config as Record<string, unknown> | undefined) ?? {}
    const rawPanelSound = (cfgExtras.panelSound && typeof cfgExtras.panelSound === 'object' ? cfgExtras.panelSound : {}) as Record<string, unknown>
    const panelSound = {
      enabled: rawPanelSound.enabled !== false,
      repeatUntilAccepted: rawPanelSound.repeatUntilAccepted !== false,
      repeatSeconds: typeof rawPanelSound.repeatSeconds === 'number' ? Math.min(Math.max(rawPanelSound.repeatSeconds, 1), 30) : 3,
      refreshSeconds: typeof rawPanelSound.refreshSeconds === 'number' ? Math.min(Math.max(rawPanelSound.refreshSeconds, 3), 60) : 3,
      volume: typeof rawPanelSound.volume === 'number' ? Math.min(Math.max(rawPanelSound.volume, 0), 100) : 80,
      soundType: typeof rawPanelSound.soundType === 'string' ? rawPanelSound.soundType : alerts.soundType,
      playOnDashboard: rawPanelSound.playOnDashboard === true,
      onlyStorePanel: rawPanelSound.onlyStorePanel !== false,
      muteOutsideHours: rawPanelSound.muteOutsideHours === true,
      requireManualActivation: rawPanelSound.requireManualActivation !== false,
      wakeLock: rawPanelSound.wakeLock !== false,
      showHiddenWarning: rawPanelSound.showHiddenWarning !== false,
    }
    const maxPauseMinutes = typeof cfgExtras.maxPauseMinutes === 'number' ? cfgExtras.maxPauseMinutes : 0
    const queueOpen = cfgExtras.autoSchedule ? isQueueOpenNow(ucfg?.openTime, ucfg?.closeTime, ucfg?.allowedDays) : true

    const queue = await prisma.sellerQueue.findUnique({
      where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } },
      select: { id: true, date: true, status: true }
    })
    const unit = await prisma.unit.findFirst({ where: { id: unitId, tenantId }, select: { name: true } })
    if (!queue) {
      return NextResponse.json({
        success: true,
        data: {
          queue: null,
          entries: [],
          vendedorDaVez: null,
          unitName: unit?.name ?? null,
          panelSound,
          queueOpen
        }
      }, { headers: HEADERS })
    }

    let entries = await prisma.sellerQueueEntry.findMany({
      where: { queueId: queue.id, status: { notIn: ['LEFT'] } },
      orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
      select: {
        id: true,
        sellerId: true,
        status: true,
        position: true,
        joinedAt: true,
        blocked: true,
        attendanceCount: true,
      }
    })

    let activeAtts = await prisma.sellerQueueAttendance.findMany({
      where: { queueId: queue.id, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } },
      select: {
        id: true,
        sellerId: true,
        status: true,
        visitType: true,
        calledAt: true,
        acceptDeadline: true,
        startedAt: true,
        createdById: true,
      }
    })

    const now = new Date()
    const hasPaused = entries.some((e) => e.status === 'PAUSED')
    const hasExpiredCall = activeAtts.some((a) => a.status === 'CALLED' && a.acceptDeadline && new Date(a.acceptDeadline) < now)

    let needReload = false
    if (hasPaused && maxPauseMinutes > 0) {
      await autoCheckoutStalePauses({ tenantId, unitId, queueId: queue.id, maxPauseMinutes })
      needReload = true
    }
    if (hasExpiredCall) {
      await sweepExpiredCalls({ tenantId, unitId, queueId: queue.id, actorId: user.id }).catch(() => {})
      needReload = true
    }

    if (needReload) {
      const [newEntries, newActiveAtts] = await Promise.all([
        prisma.sellerQueueEntry.findMany({
          where: { queueId: queue.id, status: { notIn: ['LEFT'] } },
          orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
          select: {
            id: true,
            sellerId: true,
            status: true,
            position: true,
            joinedAt: true,
            blocked: true,
            attendanceCount: true,
          }
        }),
        prisma.sellerQueueAttendance.findMany({
          where: { queueId: queue.id, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } },
          select: {
            id: true,
            sellerId: true,
            status: true,
            visitType: true,
            calledAt: true,
            acceptDeadline: true,
            startedAt: true,
            createdById: true,
          }
        })
      ])
      entries = newEntries
      activeAtts = newActiveAtts
    }

    // Se vendedor está WAITING na entry, mas tem INFORMACAO_RAPIDA há mais que o limite,
    // move a entry dele para IN_ATTENDANCE (remover da fila)
    const infoLimit = typeof (ucfg?.config as any)?.infoRapidaTimeLimitMinutes === 'number'
      ? (ucfg?.config as any).infoRapidaTimeLimitMinutes
      : 3
    const activeQuickAtts = activeAtts.filter((a) => a.visitType === 'INFORMACAO_RAPIDA' && a.status === 'IN_ATTENDANCE')
    for (const a of activeQuickAtts) {
      const entry = entries.find((e) => e.sellerId === a.sellerId)
      if (entry && (entry.status === 'WAITING' || entry.status === 'NEXT')) {
        const dur = (Date.now() - new Date(a.startedAt ?? a.calledAt).getTime()) / 60000
        if (dur > infoLimit) {
          await prisma.sellerQueueEntry.update({
            where: { id: entry.id },
            data: { status: 'IN_ATTENDANCE', lastActiveAt: new Date() }
          }).catch(() => {})
          entry.status = 'IN_ATTENDANCE'
        }
      }
    }

    const personalCounts = await prisma.agentPersonalQueueItem.groupBy({
      by: ['agentUserId'],
      where: { tenantId, unitId, status: { in: ['AGUARDANDO', 'CHAMADO'] } },
      _count: { id: true },
    })

    const personalCountsMap = new Map<string, number>()
    personalCounts.forEach((r) => personalCountsMap.set(r.agentUserId, r._count.id))

    const attBySeller = new Map<string, typeof activeAtts[0]>()
    activeAtts.forEach((a) => attBySeller.set(a.sellerId, a))

    const names = new Map<string, string>()
    const hasDev = new Set<string>()
    const activeActorIds = activeAtts.map((a) => a.createdById).filter((id): id is string => Boolean(id))
    if (entries.length || activeActorIds.length) {
      const ids = [...new Set([...entries.map((e) => e.sellerId), ...activeActorIds])]
      const [us, devs] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
        prisma.mobileDevice.findMany({ where: { userId: { in: ids }, isActive: true }, select: { userId: true } }),
      ])
      us.forEach((u) => names.set(u.id, u.name))
      devs.forEach((d) => hasDev.add(d.userId))
    }

    const list = entries.map((e) => {
      const att = attBySeller.get(e.sellerId)
      const hasPersonal = (personalCountsMap.get(e.sellerId) ?? 0) > 0
      
      let operationalState = 'DISPONIVEL'
      if (e.blocked || e.status === 'BLOCKED') {
        operationalState = 'BLOQUEADO'
      } else if (e.status === 'LEFT') {
        operationalState = 'FORA_DA_LOJA'
      } else if (e.status === 'PAUSED') {
        operationalState = 'PAUSADO'
      } else if (e.status === 'EXPIRED') {
        operationalState = 'NAO_RESPONDEU'
      } else if (att) {
        if (att.status === 'CALLED') {
          operationalState = 'CHAMADO'
        } else {
          const durationMin = (Date.now() - new Date(att.startedAt ?? att.calledAt).getTime()) / 60000
          const timeLimit = typeof (ucfg?.config as any)?.attendanceReminder?.firstAfterMinutes === 'number'
            ? (ucfg?.config as any).attendanceReminder.firstAfterMinutes
            : 30
          
          if (att.visitType === 'INFORMACAO_RAPIDA') {
            operationalState = 'EM_INFORMACAO_RAPIDA'
          } else if (att.createdById && att.createdById !== e.sellerId && !att.startedAt) {
            operationalState = 'ATENDENDO_SEM_INICIAR'
          } else if (durationMin > timeLimit) {
            operationalState = 'AGUARDANDO_FINALIZACAO'
          } else {
            operationalState = 'ATENDENDO'
          }
        }
      } else if (hasPersonal) {
        operationalState = 'COM_FILA_INDIVIDUAL'
      } else if (e.status === 'WAITING' || e.status === 'NEXT') {
        operationalState = 'DISPONIVEL'
      }

      return {
        id: e.id, sellerId: e.sellerId, sellerName: names.get(e.sellerId) ?? e.sellerId,
        status: e.status, position: e.position, joinedAt: e.joinedAt, blocked: e.blocked, attendanceCount: e.attendanceCount,
        hasDevice: hasDev.has(e.sellerId), operationalState,
        activeAttendanceId: att?.id ?? null,
        activeAttendanceStatus: att?.status ?? null,
        activeAttendanceCalledAt: att?.calledAt ?? null,
        activeAttendanceAcceptDeadline: att?.acceptDeadline ?? null,
        activeAttendanceActorName: att?.createdById ? names.get(att.createdById) ?? null : null,
      }
    })

    const vencedor = list.find((e) => e.status === 'WAITING' && !e.blocked) ?? null

    return NextResponse.json({
      success: true,
      data: {
        queue: { id: queue.id, date: queue.date, status: queue.status, unitId },
        unitName: unit?.name ?? null,
        entries: list,
        vendedorDaVez: vencedor ? { sellerId: vencedor.sellerId, sellerName: vencedor.sellerName, position: vencedor.position } : null,
        panelSound,
        queueOpen,
      },
    }, { headers: HEADERS })
  } catch (err) {
    return handlePrismaError(err)
  }
}
