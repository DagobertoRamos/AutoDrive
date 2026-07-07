// =============================================================================
// GET /api/seller-queue/current — estado da fila da unidade hoje.
// Gate: sellerQueue.view. Retorna a fila ordenada, o "vendedor da vez", a
// posição do solicitante e a contagem de clientes aguardando. Tenant/unit-scoped.
// MASTER: passar ?unitId=. Não cria fila (só leitura).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { queueDate , unitFromRequest, getUnitConfig } from '@/lib/seller-queue/queue'
import { getActiveQueueBlock } from '@/lib/seller-queue/penalty'
import { getActivePosVenda } from '@/lib/seller-queue/pos-vendas'
import { assertModuleEnabled, canAccessModuleForUser, getDisabledModules } from '@/lib/tenant-modules'
import { autoCheckoutStalePauses, isQueueOpenNow, isOnVacation, AUTO_PAUSE_REASON } from '@/lib/seller-queue/automation'
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
      browserPush: ucfg?.alertBrowserPush ?? true,
      repeatSeconds: ucfg?.alertRepeatSeconds ?? 10,
    }
    const allowChooseSeller = ucfg?.allowChooseSeller ?? true
    // Automações: auto-saída por pausa longa + abre/fecha por horário.
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
    const onVacation = isOnVacation(ucfg?.config, user.id)
    const myBlockRaw = await getActiveQueueBlock(tenantId, unitId, user.id)
    const myBlock = myBlockRaw ? { type: myBlockRaw.type, endsAt: myBlockRaw.endsAt } : null
    const myPosVendaRaw = await getActivePosVenda(tenantId, unitId, user.id)
    const myPosVenda = myPosVendaRaw ? { status: myPosVendaRaw.status } : null
    // Pode entrar na fila? = módulo sellerQueue.checkIn EFETIVO (cargo permite +
    // não removido do colaborador + não desligado p/ a loja). Quem não pode, não
    // vê "Entrar na fila" — mas continua vendo "Chamar vendedor da vez".
    const responsibleUserIds = (ucfg?.config as any)?.responsibleUserIds ?? []
    const isQueueResponsible = responsibleUserIds.includes(user.id)
    let canCheckIn = await canAccessModuleForUser(user, 'sellerQueue.checkIn')
    if (canCheckIn) {
      const [denied, tenantDisabled] = await Promise.all([
        prisma.userModule.findFirst({ where: { userId: user.id, moduleKey: 'sellerQueue.checkIn', allowed: false }, select: { id: true } }),
        getDisabledModules(tenantId),
      ])
      if (denied || tenantDisabled.includes('sellerQueue.checkIn')) canCheckIn = false
    }
    const queuePermissions = {
      callCurrentSeller: isQueueResponsible || await canAccessModuleForUser(user, 'queue.call_current_seller'),
      sendAlertAll: isQueueResponsible || await canAccessModuleForUser(user, 'queue.send_alert_all'),
      viewLogs: isQueueResponsible || await canAccessModuleForUser(user, 'queue.view_logs'),
      transferAttendance: isQueueResponsible || await canAccessModuleForUser(user, 'queue.transfer_attendance'),
      finishOtherAttendance: isQueueResponsible || await canAccessModuleForUser(user, 'queue.finish_other_attendance'),
      pauseOther: isQueueResponsible || await canAccessModuleForUser(user, 'queue.pause_other'),
      resumeOther: isQueueResponsible || await canAccessModuleForUser(user, 'queue.resume_other'),
      addParticipant: isQueueResponsible || await canAccessModuleForUser(user, 'queue.add_participant'),
      removeParticipant: isQueueResponsible || await canAccessModuleForUser(user, 'queue.remove_participant'),
      blockParticipant: isQueueResponsible || await canAccessModuleForUser(user, 'queue.block_participant'),
      unblockParticipant: isQueueResponsible || await canAccessModuleForUser(user, 'queue.unblock_participant'),
      reorder: isQueueResponsible || await canAccessModuleForUser(user, 'queue.reorder'),
      manageSettings: isQueueResponsible || await canAccessModuleForUser(user, 'queue.manage_settings'),
    }
    const queue = await prisma.sellerQueue.findUnique({ where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } } })
    const unit = await prisma.unit.findFirst({ where: { id: unitId, tenantId }, select: { name: true } })
    if (!queue) {
      return NextResponse.json({ success: true, data: { queue: null, entries: [], vendedorDaVez: null, me: null, arrivalsPending: 0, alerts, panelSound, allowChooseSeller, myBlock, myPosVenda, canCheckIn, queueOpen, onVacation, permissions: queuePermissions, isQueueResponsible, unitName: unit?.name ?? null } }, { headers: HEADERS })
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

    const isVendedor = user.role === 'VENDEDOR'
    const meRawInit = entries.find((e) => e.sellerId === user.id) ?? null
    const hasMeOrVendedor = meRawInit !== null || isVendedor

    const [arrivalsPending, personalCounts, testNotif] = await Promise.all([
      prisma.sellerQueueCustomerArrival.count({ where: { queueId: queue.id, status: { in: ['PENDING', 'CALLING'] } } }),
      prisma.agentPersonalQueueItem.groupBy({
        by: ['agentUserId'],
        where: { tenantId, unitId, status: { in: ['AGUARDANDO', 'CHAMADO'] } },
        _count: { id: true },
      }),
      hasMeOrVendedor ? prisma.notification.findFirst({
        where: { userId: user.id, read: false, metadata: { path: ['kind'], equals: 'test_attention' } },
        select: { id: true, metadata: true, createdAt: true },
        orderBy: { createdAt: 'desc' }
      }) : Promise.resolve(null)
    ])

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

    const personalCountsMap = new Map<string, number>()
    personalCounts.forEach((r) => personalCountsMap.set(r.agentUserId, r._count.id))

    const attBySeller = new Map<string, typeof activeAtts[0]>()
    activeAtts.forEach((a) => attBySeller.set(a.sellerId, a))

    // Nomes dos vendedores (User não tem relação direta no model da fila).
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
          // ACCEPTED ou IN_ATTENDANCE
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
    const meRaw = list.find((e) => e.sellerId === user.id) ?? null
    // Posição REAL na fila: rank entre os que estão aguardando (1º, 2º, 3º…),
    // não o campo interno `position` (que cresce como contador ao ir pro fim).
    const lineOrder = list.filter((e) => (e.status === 'WAITING' || e.status === 'NEXT') && !e.blocked)
    const myRank = lineOrder.findIndex((e) => e.sellerId === user.id) + 1
    // Em atendimento/chamado o vendedor NÃO está na fila de espera → posição 0
    // (a UI mostra a situação, não o contador interno, que confundia como "14º").
    const me = meRaw ? { ...meRaw, position: myRank > 0 ? myRank : 0 } : null

    // Aviso: o vendedor foi removido automaticamente (pausa/ausência prolongada)?
    let autoRemovedNotice: string | null = null
    if (!meRaw && isVendedor) {
      const lastEv = await prisma.sellerQueueEvent.findFirst({
        where: { queueId: queue.id, sellerId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { type: true, reason: true }
      })
      if (lastEv?.type === 'CHECK_OUT' && lastEv.reason?.startsWith(AUTO_PAUSE_REASON)) {
        autoRemovedNotice = 'Você saiu da fila automaticamente porque ficou pausado/fora por muito tempo. Entre novamente para voltar à fila.'
      }
    }

    // Atendimento ativo do próprio solicitante (p/ aceitar/recusar/finalizar).
    const myAtt = (meRaw || isVendedor) ? await prisma.sellerQueueAttendance.findFirst({
      where: { queueId: queue.id, sellerId: user.id, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } },
      orderBy: { calledAt: 'desc' },
      select: {
        id: true,
        status: true,
        acceptDeadline: true,
        visitType: true,
        startedAt: true,
        calledAt: true,
        arrival: {
          select: {
            customerName: true,
            customerPhone: true,
            customerEmail: true,
            recurring: true,
          }
        }
      }
    }) : null

    return NextResponse.json({
      success: true,
      data: {
        queue: { id: queue.id, date: queue.date, status: queue.status, unitId },
        unitName: unit?.name ?? null,
        entries: list,
        vendedorDaVez: vencedor ? { sellerId: vencedor.sellerId, sellerName: vencedor.sellerName, position: vencedor.position } : null,
        me,
        arrivalsPending,
        alerts,
        panelSound,
        allowChooseSeller,
        myBlock,
        myPosVenda,
        canCheckIn,
        permissions: queuePermissions,
        isQueueResponsible,
        queueOpen,
        onVacation,
        autoRemovedNotice,
        closeReasons: (cfgExtras.leadCloseReasons as string[] | undefined) ?? [],
        myAttendance: myAtt ? { id: myAtt.id, status: myAtt.status, acceptDeadline: myAtt.acceptDeadline, arrival: myAtt.arrival, visitType: myAtt.visitType, startedAt: myAtt.startedAt || myAtt.calledAt } : null,
        activeAttentionTest: testNotif ? { id: testNotif.id, sentAt: (testNotif.metadata as any)?.sentAt || testNotif.createdAt.toISOString() } : null,
      },
    }, { headers: HEADERS })
  } catch (err) {
    return handlePrismaError(err)
  }
}
