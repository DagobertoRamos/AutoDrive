import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { getGoalPeriod, resolveGoalForUser, computeGoalProgress, goalWindow } from '@/lib/goals/service'
import { computeRanking } from '@/lib/ranking/service'
import { queueDate } from '@/lib/seller-queue/queue'
import { aggregateAchieved } from '@/lib/goals/aggregators'

import { PendencyStatus } from '@prisma/client'

// Statuses
const OPEN_PENDENCIES: PendencyStatus[] = ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_RESPOSTA', 'REATIVADA', 'VENCIDA']
const CLOSED_PENDENCIES: PendencyStatus[] = ['FINALIZADA', 'CANCELADA']

function getTodayRangeTz(now: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(now)
  const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]))
  const year = parseInt(partMap.year, 10)
  const month = parseInt(partMap.month, 10)
  const day = parseInt(partMap.day, 10)

  const start = new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0))
  const end = new Date(Date.UTC(year, month - 1, day, 26, 59, 59, 999))
  return { start, end }
}

function getGoalStatus(percent: number, start: Date, end: Date, now: Date): 'no ritmo' | 'atenção' | 'atrasado' | 'batida' | 'superada' {
  if (percent >= 100) {
    return percent > 100 ? 'superada' : 'batida'
  }
  const tStart = start.getTime()
  const tEnd = end.getTime()
  const tNow = now.getTime()
  const elapsed = tEnd > tStart ? (tNow - tStart) / (tEnd - tStart) : 1
  const expectedPct = Math.min(elapsed * 100, 100)
  if (percent >= expectedPct) {
    return 'no ritmo'
  }
  if (percent < expectedPct * 0.8) {
    return 'atrasado'
  }
  return 'atenção'
}

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (user.role !== 'VENDEDOR' && user.role !== 'MASTER') {
    return forbiddenResponse('Apenas vendedores podem acessar este dashboard.')
  }

  const tenantId = user.tenantId
  if (!tenantId) return forbiddenResponse('Tenant não identificado na sessão.')

  try {
    const seller = await prisma.seller.findUnique({
      where: { userId: user.id },
      include: { unit: true },
    })

    const unitId = user.unitId ?? seller?.unitId ?? null
    const sellerIdForDeals = seller?.id ?? null

    const now = new Date()
    const today = getTodayRangeTz(now)
    const { startsAt: start, endsAt: end } = getGoalPeriod({ frequency: 'monthly', referenceDate: now })

    // 1. CARREGAR FILA DE ATENDIMENTO
    let activeEntry = null
    let totalWaiting = 0
    if (user.id) {
      const qDate = queueDate(now)
      activeEntry = await prisma.sellerQueueEntry.findFirst({
        where: {
          sellerId: user.id,
          queue: { date: qDate, tenantId, unitId: unitId ?? undefined },
          status: { not: 'LEFT' },
        },
        include: {
          queue: true,
        },
      })

      if (activeEntry?.queueId) {
        totalWaiting = await prisma.sellerQueueEntry.count({
          where: {
            queueId: activeEntry.queueId,
            status: { in: ['WAITING', 'NEXT'] },
          },
        })
      }
    }

    // 2. CARREGAR METAS (Resolução por prioridade)
    const goalType = 'SALES_EXCHANGE' as any
    const goalPeriod = 'MONTHLY' as any

    const applicableGoal = await resolveGoalForUser({
      userId: user.id,
      role: user.role as any,
      unitId,
      tenantId,
      type: goalType,
      period: goalPeriod,
      referenceDate: now,
    })

    const applicableProgress = applicableGoal
      ? await computeGoalProgress(applicableGoal as any, now, user.id)
      : null

    const unitGoal = unitId
      ? await prisma.goal.findFirst({
          where: {
            tenantId,
            unitId,
            scope: 'UNIT',
            type: goalType,
            period: goalPeriod,
            status: 'ATIVA',
            active: true,
          },
          include: { levels: { orderBy: { level: 'asc' } } },
        })
      : null
    const unitProgress = unitGoal ? await computeGoalProgress(unitGoal as any, now, user.id) : null
    const unitContribution = (unitGoal && sellerIdForDeals)
      ? (await aggregateAchieved(goalType, { tenantId, sellerId: sellerIdForDeals }, goalWindow(unitGoal as any, now))).value
      : 0

    const roleGoal = await prisma.goal.findFirst({
      where: {
        tenantId,
        targetRole: user.role as any,
        scope: 'ROLE',
        type: goalType,
        period: goalPeriod,
        status: 'ATIVA',
        active: true,
      },
      include: { levels: { orderBy: { level: 'asc' } } },
    })
    const roleProgress = roleGoal ? await computeGoalProgress(roleGoal as any, now, user.id) : null
    const roleContribution = (roleGoal && sellerIdForDeals)
      ? (await aggregateAchieved(goalType, { tenantId, sellerId: sellerIdForDeals }, goalWindow(roleGoal as any, now))).value
      : 0

    const tenantGoal = !roleGoal
      ? await prisma.goal.findFirst({
          where: {
            tenantId,
            scope: 'TENANT',
            type: goalType,
            period: goalPeriod,
            status: 'ATIVA',
            active: true,
          },
          include: { levels: { orderBy: { level: 'asc' } } },
        })
      : null
    const tenantProgress = tenantGoal ? await computeGoalProgress(tenantGoal as any, now, user.id) : null
    const tenantContribution = (tenantGoal && sellerIdForDeals)
      ? (await aggregateAchieved(goalType, { tenantId, sellerId: sellerIdForDeals }, goalWindow(tenantGoal as any, now))).value
      : 0

    // 3. CARREGAR PENDÊNCIAS
    const pendencyBaseFilter = {
      tenantId,
      OR: [{ responsibleId: sellerIdForDeals ?? 'no-seller' }, { assignedUserId: user.id }],
    }

    const [criticalCount, overdueCount, dueTodayCount] = await Promise.all([
      prisma.pendency.count({
        where: {
          ...pendencyBaseFilter,
          status: { in: OPEN_PENDENCIES },
          OR: [{ priority: 'URGENTE' }, { severity: 'CRITICAL' }],
        },
      }),
      prisma.pendency.count({
        where: {
          ...pendencyBaseFilter,
          status: { notIn: CLOSED_PENDENCIES },
          OR: [{ status: 'VENCIDA' }, { dueDate: { lt: now } }, { slaDeadline: { lt: now } }],
        },
      }),
      prisma.pendency.count({
        where: {
          ...pendencyBaseFilter,
          status: { in: OPEN_PENDENCIES },
          dueDate: { gte: today.start, lte: today.end },
        },
      }),
    ])

    const nextUrgent = await prisma.pendency.findFirst({
      where: {
        ...pendencyBaseFilter,
        status: { in: OPEN_PENDENCIES },
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
      ],
      select: {
        id: true,
        type: true,
        description: true,
        priority: true,
        severity: true,
        dueDate: true,
        customerName: true,
        negotiation: true,
      },
    })

    // 4. CARREGAR LEADS
    const baseLeadFilter = {
      tenantId,
      OR: [{ assignedToUserId: user.id }, { claimedByUserId: user.id }],
    }

    const [leadsNovos, leadsEmAtendimento, leadsSemContato, leadsConvertidos, leadsPerdidos] = await Promise.all([
      prisma.marketingLead.count({ where: { ...baseLeadFilter, status: 'NEW' } }),
      prisma.marketingLead.count({ where: { ...baseLeadFilter, status: 'WORKING' } }),
      prisma.marketingLead.count({ where: { ...baseLeadFilter, status: 'ASSIGNED' } }),
      prisma.marketingLead.count({ where: { ...baseLeadFilter, status: 'CONVERTED', convertedAt: { gte: start, lte: end } } }),
      prisma.marketingLead.count({ where: { ...baseLeadFilter, status: 'LOST', updatedAt: { gte: start, lte: end } } }),
    ])

    const leadsRetornoHoje = await prisma.marketingLeadTask.count({
      where: {
        tenantId,
        assignedToUserId: user.id,
        status: 'PENDING',
        dueAt: { gte: today.start, lte: today.end },
      },
    })

    const leadsAtrasados = await prisma.marketingLeadTask.count({
      where: {
        tenantId,
        assignedToUserId: user.id,
        status: 'PENDING',
        dueAt: { lt: now },
      },
    })

    // 5. CARREGAR HISTÓRICO DA FILA (Últimos atendimentos)
    const monthAttendances = await prisma.sellerQueueAttendance.findMany({
      where: {
        tenantId,
        sellerId: user.id,
        calledAt: { gte: start, lte: end },
      },
      orderBy: { calledAt: 'desc' },
    })

    const todayAttendances = monthAttendances.filter(a => a.calledAt >= today.start && a.calledAt <= today.end)
    const attendancesTodayCount = todayAttendances.length
    const attendancesMonthCount = monthAttendances.length

    const responseTimes = monthAttendances
      .map(a => {
        const time = a.acceptedAt
          ? a.acceptedAt.getTime() - a.calledAt.getTime()
          : (a.rejectedAt ? a.rejectedAt.getTime() - a.calledAt.getTime() : null)
        return time ? time / 1000 : null
      })
      .filter((t): t is number => t !== null)

    const averageResponseSeconds = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null

    const totalFila = monthAttendances.filter(a => ['FINISHED', 'ACCEPTED', 'IN_ATTENDANCE', 'REJECTED', 'EXPIRED'].includes(a.status)).length
    const acceptedFila = monthAttendances.filter(a => ['FINISHED', 'ACCEPTED', 'IN_ATTENDANCE'].includes(a.status)).length
    const acceptanceRate = totalFila > 0 ? Math.round((acceptedFila / totalFila) * 100) : 100

    const recusas = monthAttendances.filter(a => a.status === 'REJECTED').length
    const passadas = monthAttendances.filter(a => a.status === 'EXPIRED').length

    const lastAttendances = monthAttendances.slice(0, 5).map(a => ({
      id: a.id,
      calledAt: a.calledAt,
      status: a.status,
      visitType: a.visitType,
      result: a.result,
      rejectReason: a.rejectReason,
      responseSeconds: a.acceptedAt
        ? Math.round((a.acceptedAt.getTime() - a.calledAt.getTime()) / 1000)
        : (a.rejectedAt ? Math.round((a.rejectedAt.getTime() - a.calledAt.getTime()) / 1000) : null),
    }))

    // 6. CARREGAR RANKING E QUALIDADE
    const tenantRanking = await computeRanking({
      tenantId,
      period: 'MONTHLY',
      now,
    }).catch(() => null)

    const unitRanking = unitId
      ? await computeRanking({
          tenantId,
          unitId,
          period: 'MONTHLY',
          now,
        }).catch(() => null)
      : null

    const tenantEntry = tenantRanking?.entries.find(e => e.userId === user.id)
    const unitEntry = unitRanking?.entries.find(e => e.userId === user.id)

    const overallPosition = tenantEntry?.rank ?? null
    const unitPosition = unitEntry?.rank ?? null

    const topRanking = (unitRanking?.entries ?? tenantRanking?.entries ?? []).slice(0, 10).map(e => ({
      rank: e.rank,
      name: e.name,
      totalPoints: e.totalPoints,
      sales: e.metrics.sales,
      isMe: e.userId === user.id,
    }))

    // Composição transparente do score de qualidade operacional (0 a 100)
    let qualityScore = 0
    qualityScore += acceptanceRate * 0.3 // 30% Fila - taxa de aceite
    if (averageResponseSeconds === null || averageResponseSeconds <= 10) qualityScore += 20 // 20% Fila - tempo de resposta rápido
    else if (averageResponseSeconds <= 20) qualityScore += 15
    else if (averageResponseSeconds <= 30) qualityScore += 10
    else if (averageResponseSeconds <= 60) qualityScore += 5

    if (criticalCount === 0) qualityScore += 20 // 20% Pendências em dia
    else if (criticalCount === 1) qualityScore += 10

    if (leadsAtrasados === 0) qualityScore += 20 // 20% Leads sem atraso
    else if (leadsAtrasados === 1) qualityScore += 15
    else if (leadsAtrasados === 2) qualityScore += 10

    const totalFinishedOrDropped = monthAttendances.filter(a => ['FINISHED', 'REJECTED', 'EXPIRED'].includes(a.status)).length
    const finishedOnly = monthAttendances.filter(a => a.status === 'FINISHED').length
    const finalizationRate = totalFinishedOrDropped > 0 ? (finishedOnly / totalFinishedOrDropped) * 100 : 100
    qualityScore += finalizationRate * 0.1 // 10% Fila - taxa de conclusão do atendimento

    qualityScore = Math.round(qualityScore)

    // Montar os dados finais
    const data = {
      seller: {
        id: user.id,
        name: user.name,
        unitName: seller?.unit?.name ?? 'Sem unidade',
        queueStatus: activeEntry?.status ?? 'LEFT',
        position: activeEntry?.position ?? null,
        totalWaiting,
      },
      goals: {
        applicable: applicableGoal && applicableProgress ? {
          title: applicableGoal.title ?? 'Minha Meta de Vendas',
          type: applicableGoal.type,
          scope: applicableGoal.scope,
          scopeLabel: applicableGoal.scope === 'USER' ? 'Direta do vendedor' : (applicableGoal.scope === 'ROLE' ? 'Cargo' : (applicableGoal.scope === 'UNIT' ? 'Unidade' : 'Geral')),
          period: applicableGoal.period,
          startDate: applicableGoal.startDate,
          endDate: applicableGoal.endDate,
          target: applicableProgress.target,
          achieved: applicableProgress.achievedValue,
          percent: applicableProgress.percent,
          remaining: Math.max(applicableProgress.target - applicableProgress.achievedValue, 0),
          status: getGoalStatus(applicableProgress.percent, goalWindow(applicableGoal as any, now).start, goalWindow(applicableGoal as any, now).end, now),
        } : null,
        unit: unitGoal && unitProgress ? {
          title: unitGoal.title ?? `Meta da ${seller?.unit?.name ?? 'Unidade'}`,
          target: unitProgress.target,
          achieved: unitProgress.achievedValue,
          percent: unitProgress.percent,
          contribution: unitContribution,
        } : null,
        roleOrGeneral: (roleGoal && roleProgress) ? {
          title: roleGoal.title ?? 'Meta do Cargo',
          scopeLabel: 'Cargo',
          target: roleProgress.target,
          achieved: roleProgress.achievedValue,
          percent: roleProgress.percent,
          contribution: roleContribution,
        } : (tenantGoal && tenantProgress ? {
          title: tenantGoal.title ?? 'Meta Geral',
          scopeLabel: 'Geral',
          target: tenantProgress.target,
          achieved: tenantProgress.achievedValue,
          percent: tenantProgress.percent,
          contribution: tenantContribution,
        } : null),
      },
      pendingIssues: {
        criticalCount,
        overdueCount,
        dueTodayCount,
        nextUrgent,
      },
      leads: {
        newCount: leadsNovos,
        followUpTodayCount: leadsRetornoHoje,
        overdueCount: leadsAtrasados,
        activeCount: leadsEmAtendimento,
        semContatoCount: leadsSemContato,
        convertedThisMonth: leadsConvertidos,
        lostThisMonth: leadsPerdidos,
      },
      queueAttendances: {
        todayCount: attendancesTodayCount,
        monthCount: attendancesMonthCount,
        averageResponseSeconds,
        acceptanceRate,
        recusas,
        passadas,
        items: lastAttendances,
      },
      ranking: {
        overallPosition,
        unitPosition,
        qualityScore,
        top: topRanking,
      },
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : 'Erro interno no servidor.' }, { status: 500 })
  }
}
