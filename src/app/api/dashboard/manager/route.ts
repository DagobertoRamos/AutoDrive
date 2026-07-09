import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { getGoalPeriod, resolveGoalForUser, computeGoalProgress, goalWindow } from '@/lib/goals/service'
import { queueDate } from '@/lib/seller-queue/queue'
import { commissionEligibleDealWindowWhere } from '@/lib/commission/status'
import { PendencyStatus, GoalType, GoalPeriod } from '@prisma/client'

export const dynamic = 'force-dynamic'

const OPEN_PENDENCIES: PendencyStatus[] = ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_RESPOSTA', 'REATIVADA']

function getTodayRangeTz(now: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(now)
  const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]))
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

  const allowedRoles = ['GERENTE', 'GERENTE_GERAL', 'ADM', 'MASTER']
  if (!allowedRoles.includes(user.role)) {
    return forbiddenResponse('Acesso restrito a gestores e administradores.')
  }

  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))

  try {
    // 1. RESOLVER UNIDADE ALVO
    let unitId = user.unitId
    if (user.role === 'GERENTE' && !unitId) {
      const manager = await prisma.manager.findUnique({
        where: { userId: user.id },
      })
      unitId = manager?.unitId ?? null
    }

    // Permitir que administradores / master visualizem outra unidade via query param
    const url = new URL(req.url)
    const paramUnitId = url.searchParams.get('unitId')
    let targetUnitId = unitId
    if (user.role !== 'GERENTE' && paramUnitId) {
      targetUnitId = paramUnitId
    }

    if (!targetUnitId) {
      return NextResponse.json({
        success: false,
        error: 'Este usuário não possui unidade vinculada para gerenciar.',
      }, { status: 400 })
    }

    const unit = await prisma.unit.findUnique({
      where: { id: targetUnitId },
      select: { name: true },
    })

    const now = new Date()
    const today = getTodayRangeTz(now)
    const { startsAt: start, endsAt: end } = getGoalPeriod({ frequency: 'monthly', referenceDate: now })

    // 2. BUSCAR VENDEDORES ATIVOS DA UNIDADE
    const sellers = await prisma.seller.findMany({
      where: { unit: { tenantId }, unitId: targetUnitId, active: true },
      include: { user: true },
    })
    const sellerIds = sellers.map((s) => s.id)
    const sellerUserIds = sellers.map((s) => s.userId)

    // 3. PRODUÇÃO DA UNIDADE (DEALS DO MÊS ATUAL)
    const eligibleQuery = commissionEligibleDealWindowWhere({ start, end })

    const [monthlyDeals, activeDealsCount, approvedDealsCount, cancelledDealsCount] = await Promise.all([
      prisma.deal.findMany({
        where: {
          tenantId,
          unitId: targetUnitId,
          ...eligibleQuery,
        },
        select: {
          id: true,
          sellerId: true,
          type: true,
          status: true,
          updatedAt: true,
        },
      }),
      prisma.deal.count({
        where: {
          tenantId,
          unitId: targetUnitId,
          status: { notIn: ['FINALIZADA', 'ENTREGUE', 'CANCELADA', 'RECUSADA', 'DESAPROVADA', 'BLOQUEADA'] },
        },
      }),
      prisma.deal.count({
        where: {
          tenantId,
          unitId: targetUnitId,
          status: { in: ['APROVADA', 'FINANCEIRO_APROVADO'] },
        },
      }),
      prisma.deal.count({
        where: {
          tenantId,
          unitId: targetUnitId,
          status: 'CANCELADA',
          updatedAt: { gte: start, lte: end },
        },
      }),
    ])

    const salesCount = monthlyDeals.filter((d) => d.type === 'VENDA' || d.type === 'TROCA').length
    const purchasesCount = monthlyDeals.filter((d) => d.type === 'COMPRA').length
    const tradesCount = monthlyDeals.filter((d) => d.type === 'TROCA').length
    const consignmentsCount = monthlyDeals.filter((d) => d.type === 'CONSIGNACAO').length

    const unitOverview = {
      salesMonth: salesCount,
      purchasesMonth: purchasesCount,
      tradesMonth: tradesCount,
      consignmentsMonth: consignmentsCount,
      activeDeals: activeDealsCount,
      approvedDeals: approvedDealsCount,
      cancelledDeals: cancelledDealsCount,
    }

    // 4. METAS (UNIDADE E EQUIPE)
    const goalType = 'SALES_EXCHANGE' as GoalType
    const goalPeriod = 'MONTHLY' as GoalPeriod

    const unitGoal = await prisma.goal.findFirst({
      where: {
        tenantId,
        unitId: targetUnitId,
        scope: 'UNIT',
        type: goalType,
        period: goalPeriod,
        status: 'ATIVA',
        active: true,
      },
      include: { levels: { orderBy: { level: 'asc' } } },
    })

    const unitGoalProgress = unitGoal ? await computeGoalProgress(unitGoal as any, now) : null

    // Buscar e calcular metas para cada vendedor em paralelo
    const teamGoalsPromises = sellers.map(async (s) => {
      const g = await resolveGoalForUser({
        userId: s.userId,
        role: 'VENDEDOR',
        unitId: targetUnitId,
        tenantId,
        type: goalType,
        period: goalPeriod,
        referenceDate: now,
      })
      const progress = g ? await computeGoalProgress(g as any, now, s.userId) : null
      const achieved = progress?.achievedValue ?? 0
      const target = progress?.target ?? 0
      const percent = progress?.percent ?? 0
      const remaining = Math.max(target - achieved, 0)
      const windowRange = g ? goalWindow(g as any, now) : { start, end }
      const statusText = progress ? getGoalStatus(percent, windowRange.start, windowRange.end, now) : 'no ritmo'

      return {
        sellerId: s.id,
        sellerName: s.fullName,
        goalId: g?.id ?? null,
        title: g?.title ?? 'Sem meta ativa',
        target,
        achieved,
        percent,
        remaining,
        status: statusText,
      }
    })
    const teamGoals = await Promise.all(teamGoalsPromises)

    // 5. LEADS E FUNIL
    const monthlyLeads = await prisma.marketingLead.findMany({
      where: {
        tenantId,
        unitId: targetUnitId,
        OR: [
          { createdAt: { gte: start, lte: end } },
          { convertedAt: { gte: start, lte: end } }
        ]
      },
      select: {
        id: true,
        status: true,
        assignedToUserId: true,
        convertedAt: true,
        createdAt: true,
      }
    })

    const leadsNovos = monthlyLeads.filter(l => l.status === 'NEW' && l.createdAt >= start && l.createdAt <= end).length
    const leadsEmAtendimento = monthlyLeads.filter(l => l.status === 'WORKING' && l.createdAt >= start && l.createdAt <= end).length
    const leadsSemContato = monthlyLeads.filter(l => l.status === 'ASSIGNED' && l.createdAt >= start && l.createdAt <= end).length
    const leadsConvertidos = monthlyLeads.filter(l => l.status === 'CONVERTED' && l.convertedAt && l.convertedAt >= start && l.convertedAt <= end).length
    const totalLeadsMes = monthlyLeads.filter(l => l.createdAt >= start && l.createdAt <= end).length

    const leadsRetornoHoje = await prisma.marketingLeadTask.count({
      where: {
        tenantId,
        lead: { unitId: targetUnitId },
        status: 'PENDING',
        dueAt: { gte: today.start, lte: today.end },
      },
    })

    const leadsAtrasados = await prisma.marketingLeadTask.count({
      where: {
        tenantId,
        lead: { unitId: targetUnitId },
        status: 'PENDING',
        dueAt: { lt: now },
      },
    })

    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const leadsNoContactOver24h = await prisma.marketingLead.count({
      where: {
        tenantId,
        unitId: targetUnitId,
        status: { notIn: ['CONVERTED', 'LOST', 'DISCARDED'] },
        OR: [
          { lastContactAt: { lt: oneDayAgo } },
          { AND: [{ lastContactAt: null }, { createdAt: { lt: oneDayAgo } }] },
        ],
      },
    })

    // Agrupamento por status real de Deals para o Funil
    const dealGroups = await prisma.deal.groupBy({
      by: ['status'],
      where: { tenantId, unitId: targetUnitId },
      _count: true,
    })
    const dealStatusCounts = Object.fromEntries(dealGroups.map((g) => [g.status, g._count]))

    const funnel = [
      { name: 'Lead Novo', value: leadsNovos, href: `/crm/leads?status=NEW` },
      { name: 'Primeiro Contato', value: leadsSemContato, href: `/crm/leads?status=ASSIGNED` },
      { name: 'Em Atendimento', value: leadsEmAtendimento + (dealStatusCounts['EM_ANDAMENTO'] ?? 0), href: `/crm/leads?status=WORKING` },
      { name: 'Proposta', value: (dealStatusCounts['RASCUNHO'] ?? 0) + (dealStatusCounts['EM_PREENCHIMENTO'] ?? 0) + (dealStatusCounts['DEVOLVIDA_PARA_CORRECAO'] ?? 0), href: `/negociacoes?status=EM_PREENCHIMENTO` },
      { name: 'Ficha/Simulação', value: dealStatusCounts['AGUARDANDO_APROVACAO'] ?? 0, href: `/negociacoes?status=AGUARDANDO_APROVACAO` },
      { name: 'Aprovado', value: (dealStatusCounts['APROVADA'] ?? 0) + (dealStatusCounts['FINANCEIRO_APROVADO'] ?? 0) + (dealStatusCounts['SINAL_RECEBIDO'] ?? 0) + (dealStatusCounts['RESERVADA'] ?? 0), href: `/negociacoes?status=APROVADA` },
      { name: 'Pendente Contrato', value: (dealStatusCounts['AGUARDANDO_CONTRATO'] ?? 0) + (dealStatusCounts['CONTRATO_GERADO'] ?? 0) + (dealStatusCounts['AGUARDANDO_ASSINATURA'] ?? 0) + (dealStatusCounts['ASSINADA'] ?? 0), href: `/negociacoes?status=AGUARDANDO_CONTRATO` },
      { name: 'Documentação', value: (dealStatusCounts['AGUARDANDO_DOCUMENTACAO'] ?? 0) + (dealStatusCounts['DOCUMENTACAO_CONCLUIDA'] ?? 0), href: `/negociacoes?status=AGUARDANDO_DOCUMENTACAO` },
      { name: 'Entregue/Finalizado', value: (dealStatusCounts['ENTREGUE'] ?? 0) + (dealStatusCounts['FINALIZADA'] ?? 0), href: `/negociacoes?status=FINALIZADA` },
      { name: 'Perdido/Cancelado', value: (dealStatusCounts['CANCELADA'] ?? 0) + (dealStatusCounts['RECUSADA'] ?? 0) + (dealStatusCounts['DESAPROVADA'] ?? 0) + (dealStatusCounts['FINANCEIRO_REPROVADO'] ?? 0), href: `/negociacoes?status=CANCELADA` },
    ]

    // 6. PENDÊNCIAS E COBRANÇAS
    const pendencyBaseFilter = {
      tenantId,
      unitId: targetUnitId,
      status: { in: OPEN_PENDENCIES },
    }

    const [pCritical, pOverdue, pDueToday, pEscalated] = await Promise.all([
      prisma.pendency.count({
        where: {
          ...pendencyBaseFilter,
          OR: [{ priority: 'URGENTE' }, { severity: 'CRITICAL' as any }],
        },
      }),
      prisma.pendency.count({
        where: {
          ...pendencyBaseFilter,
          dueDate: { lt: now },
        },
      }),
      prisma.pendency.count({
        where: {
          ...pendencyBaseFilter,
          dueDate: { gte: today.start, lte: today.end },
        },
      }),
      prisma.pendency.count({
        where: {
          ...pendencyBaseFilter,
          managerId: { not: null },
        },
      }),
    ])

    const topPendencies = await prisma.pendency.findMany({
      where: { ...pendencyBaseFilter },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
      ],
      take: 8,
      include: {
        responsible: {
          select: {
            fullName: true,
          },
        },
      },
    })

    const activeStalledDeals = await prisma.deal.findMany({
      where: {
        tenantId,
        unitId: targetUnitId,
        status: { in: ['AGUARDANDO_CONTRATO', 'CONTRATO_GERADO', 'AGUARDANDO_DOCUMENTACAO'] },
        updatedAt: { lt: oneDayAgo },
      },
      select: {
        id: true,
        dealNumber: true,
        sellerId: true,
        updatedAt: true,
      },
    })

    // 7. FILA DE ATENDIMENTO DA LOJA (HOJE)
    const qDate = queueDate(now)
    const queue = await prisma.sellerQueue.findUnique({
      where: { tenantId_unitId_date: { tenantId, unitId: targetUnitId, date: qDate } },
      include: {
        entries: {
          orderBy: { position: 'asc' },
        },
      },
    })

    const attendancesToday = await prisma.sellerQueueAttendance.findMany({
      where: {
        tenantId,
        unitId: targetUnitId,
        calledAt: { gte: today.start, lte: today.end },
      },
    })

    const timeoutCount = attendancesToday.filter((a) => a.status === 'EXPIRED').length
    const responseTimesToday = attendancesToday
      .map((a) => (a.acceptedAt ? (a.acceptedAt.getTime() - a.calledAt.getTime()) / 1000 : null))
      .filter((t): t is number => t !== null)
    const averageAcceptSeconds = responseTimesToday.length > 0
      ? Math.round(responseTimesToday.reduce((a, b) => a + b, 0) / responseTimesToday.length)
      : null

    const recentAttendances = await prisma.sellerQueueAttendance.findMany({
      where: { tenantId, unitId: targetUnitId },
      orderBy: { calledAt: 'desc' },
      take: 5,
    })

    const queueStats = {
      queueId: queue?.id ?? null,
      status: queue?.status ?? 'CLOSED',
      vendedorDaVez: null as any,
      availableSellers: queue?.entries.filter((e) => e.status === 'WAITING' || e.status === 'NEXT').length ?? 0,
      busySellers: queue?.entries.filter((e) => e.status === 'ACCEPTED' || e.status === 'IN_ATTENDANCE').length ?? 0,
      pausedSellers: queue?.entries.filter((e) => e.status === 'PAUSED').length ?? 0,
      callsToday: attendancesToday.length,
      timeoutCount,
      averageAcceptSeconds,
      recent: recentAttendances.map((a) => {
        const sellerObj = sellers.find((s) => s.userId === a.sellerId)
        return {
          id: a.id,
          calledAt: a.calledAt,
          sellerName: sellerObj?.fullName ?? 'Desconhecido',
          visitType: a.visitType ?? 'CLIENTE_PORTA',
          status: a.status,
          result: a.result ?? null,
          responseSeconds: a.acceptedAt ? Math.round((a.acceptedAt.getTime() - a.calledAt.getTime()) / 1000) : null,
        }
      }),
    }

    if (queue?.entries) {
      const winner = queue.entries.find((e) => e.status === 'WAITING' && !e.blocked)
      if (winner) {
        const selObj = sellers.find((s) => s.userId === winner.sellerId)
        queueStats.vendedorDaVez = {
          sellerId: winner.sellerId,
          sellerName: selObj?.fullName ?? 'Desconhecido',
          position: winner.position,
        }
      }
    }

    // 8. PROCESSAR DADOS DE TODOS OS VENDEDORES E SCORE DE QUALIDADE (MÊS ATUAL)
    const monthAttendances = await prisma.sellerQueueAttendance.findMany({
      where: {
        tenantId,
        sellerId: { in: sellerUserIds },
        calledAt: { gte: start, lte: end },
      },
    })

    const allOpenPendencies = await prisma.pendency.findMany({
      where: {
        tenantId,
        status: { in: OPEN_PENDENCIES },
        OR: [
          { responsibleId: { in: sellerIds } },
          { assignedUserId: { in: sellerUserIds } },
        ],
      },
    })

    const allOverdueTasks = await prisma.marketingLeadTask.findMany({
      where: {
        tenantId,
        assignedToUserId: { in: sellerUserIds },
        status: 'PENDING',
        dueAt: { lt: now },
      },
    })

    const sellersOverview = sellers.map((s) => {
      // Status na Fila
      const entry = queue?.entries.find((e) => e.sellerId === s.userId)
      const qStatus = entry && entry.status !== 'LEFT' ? entry.status : 'OFFLINE'
      const position = entry?.position ?? null

      // Leads Ativos
      const activeLeadsCount = monthlyLeads.filter((l) => l.assignedToUserId === s.userId && l.status !== 'CONVERTED' && l.status !== 'LOST' && l.status !== 'DISCARDED').length

      // Produção e Fila no Mês
      const sDeals = monthlyDeals.filter((d) => d.sellerId === s.id)
      const sSales = sDeals.filter((d) => d.type === 'VENDA' || d.type === 'TROCA').length

      // Fila e Taxa de Aceite
      const sAttendances = monthAttendances.filter((a) => a.sellerId === s.userId)
      const sTotalFila = sAttendances.filter((a) => ['FINISHED', 'ACCEPTED', 'IN_ATTENDANCE', 'REJECTED', 'EXPIRED'].includes(a.status)).length
      const sAcceptedFila = sAttendances.filter((a) => ['FINISHED', 'ACCEPTED', 'IN_ATTENDANCE'].includes(a.status)).length
      const acceptanceRate = sTotalFila > 0 ? Math.round((sAcceptedFila / sTotalFila) * 100) : 100

      // Tempo de resposta médio
      const sResponseTimes = sAttendances
        .map((a) => (a.acceptedAt ? (a.acceptedAt.getTime() - a.calledAt.getTime()) / 1000 : null))
        .filter((t): t is number => t !== null)
      const avgResponse = sResponseTimes.length > 0
        ? Math.round(sResponseTimes.reduce((a, b) => a + b, 0) / sResponseTimes.length)
        : null

      // Pendências do vendedor
      const sPendencies = allOpenPendencies.filter((p) => p.responsibleId === s.id || p.assignedUserId === s.userId)
      const sCriticalCount = sPendencies.filter((p) => p.priority === 'URGENTE').length
      const sOverdueCount = sPendencies.filter((p) => p.dueDate && p.dueDate < now).length

      // Leads sem retorno
      const sOverdueTasks = allOverdueTasks.filter((t) => t.assignedToUserId === s.userId).length

      // Meta Individual
      const sGoal = teamGoals.find((tg) => tg.sellerId === s.id)

      // Cálculo de Qualidade (0 a 100)
      let quality = 0
      quality += acceptanceRate * 0.3

      if (avgResponse === null || avgResponse <= 10) quality += 20
      else if (avgResponse <= 20) quality += 15
      else if (avgResponse <= 30) quality += 10
      else if (avgResponse <= 60) quality += 5

      if (sCriticalCount === 0) quality += 20
      else if (sCriticalCount === 1) quality += 10

      if (sOverdueTasks === 0) quality += 20
      else if (sOverdueTasks === 1) quality += 15
      else if (sOverdueTasks === 2) quality += 10

      const finishedOrDropped = sAttendances.filter((a) => ['FINISHED', 'REJECTED', 'EXPIRED'].includes(a.status)).length
      const finishedOnly = sAttendances.filter((a) => a.status === 'FINISHED').length
      const finalizationRate = finishedOrDropped > 0 ? (finishedOnly / finishedOrDropped) * 100 : 100
      quality += finalizationRate * 0.1

      quality = Math.round(quality)

      return {
        id: s.id,
        userId: s.userId,
        name: s.fullName,
        cargo: s.cargo ?? 'Vendedor',
        whatsapp: s.whatsapp,
        queueStatus: qStatus,
        position,
        activeLeads: activeLeadsCount,
        attendancesToday: attendancesToday.filter((a) => a.sellerId === s.userId).length,
        salesMonth: sSales,
        goalTarget: sGoal?.target ?? 0,
        goalPercent: sGoal?.percent ?? 0,
        goalStatus: sGoal?.status ?? 'no ritmo',
        openPendencies: sPendencies.length,
        criticalPendencies: sCriticalCount,
        overduePendencies: sOverdueCount,
        overdueTasks: sOverdueTasks,
        averageResponseSeconds: avgResponse,
        acceptanceRate,
        qualityScore: quality,
      }
    })

    // 9. COBRANÇAS RECOMENDADAS E ALERTAS INTELIGENTES
    const recommendedActions: any[] = []
    const alerts: any[] = []

    sellersOverview.forEach((so) => {
      if (so.overduePendencies > 0) {
        recommendedActions.push({
          sellerId: so.id,
          sellerName: so.name,
          type: 'PENDENCY',
          message: `${so.name} tem ${so.overduePendencies} pendências vencidas.`,
          action: 'cobrar',
          target: `/pendencias?responsibleId=${so.id}`,
        })
      }
      if (so.overdueTasks > 0) {
        recommendedActions.push({
          sellerId: so.id,
          sellerName: so.name,
          type: 'LEAD',
          message: `${so.name} possui ${so.overdueTasks} leads com tarefas/retornos atrasados.`,
          action: 'cobrar',
          target: `/crm/leads?assignedToUserId=${so.userId}`,
        })
      }
      const sStalledCount = activeStalledDeals.filter((d) => d.sellerId === so.id).length
      if (sStalledCount > 0) {
        recommendedActions.push({
          sellerId: so.id,
          sellerName: so.name,
          type: 'DEAL',
          message: `${so.name} tem ${sStalledCount} negociações/contratos sem avanço há +24h.`,
          action: 'cobrar',
          target: `/negociacoes?sellerId=${so.id}`,
        })
      }
    })

    // Compilar Alertas Inteligentes
    if (leadsAtrasados > 0) {
      alerts.push({
        type: 'warning',
        message: `${leadsAtrasados} tarefas de leads estão vencidas/atrasadas na unidade.`,
        action: 'leads',
        target: '/crm/leads',
      })
    }
    if (pCritical > 0) {
      alerts.push({
        type: 'error',
        message: `${pCritical} pendências de alta prioridade ou críticas estão abertas na unidade.`,
        action: 'pendencies',
        target: '/pendencias',
      })
    }
    const lowPerformers = sellersOverview.filter((so) => so.goalTarget > 0 && so.goalPercent < 40)
    if (lowPerformers.length > 0) {
      alerts.push({
        type: 'warning',
        message: `${lowPerformers.length} vendedor(es) estão abaixo de 40% da meta de vendas.`,
        action: 'goals',
        target: '/metas',
      })
    }
    if (timeoutCount > 0) {
      alerts.push({
        type: 'warning',
        message: `${timeoutCount} chamada(s) da fila expiraram sem retorno dos vendedores hoje.`,
        action: 'queue',
        target: '/vendedor-da-vez/painel',
      })
    }
    if (activeStalledDeals.length > 0) {
      alerts.push({
        type: 'warning',
        message: `${activeStalledDeals.length} contratos ou documentações estão parados há mais de 24 horas.`,
        action: 'deals',
        target: '/negociacoes',
      })
    }

    // 10. DOCUMENTAÇÃO, FINANCEIRO E ENTREGAS
    const pendingContracts = (dealStatusCounts['AGUARDANDO_CONTRATO'] ?? 0) + (dealStatusCounts['CONTRATO_GERADO'] ?? 0)
    const pendingDocuments = (dealStatusCounts['AGUARDANDO_DOCUMENTACAO'] ?? 0) + (dealStatusCounts['DOCUMENTACAO_CONCLUIDA'] ?? 0)

    const deliveriesTodayCount = await prisma.deal.count({
      where: {
        tenantId,
        unitId: targetUnitId,
        deliveryDate: { gte: today.start, lte: today.end },
      },
    })

    const delayedDeliveriesCount = await prisma.deal.count({
      where: {
        tenantId,
        unitId: targetUnitId,
        deliveryDate: { lt: now },
        status: { notIn: ['ENTREGUE', 'FINALIZADA', 'CANCELADA', 'RECUSADA', 'DESAPROVADA', 'BLOQUEADA'] },
      },
    })

    const documentsAndFinance = {
      pendingContracts,
      pendingDocuments,
      deliveriesToday: deliveriesTodayCount,
      delayedDeliveries: delayedDeliveriesCount,
      pendingPayments: dealStatusCounts['AGUARDANDO_SINAL'] ?? 0,
    }

    // 11. RANKING DA UNIDADE (MÊS ATUAL)
    const rankedSellers = [...sellersOverview].sort((a, b) => {
      // Ordenação primária por Vendas, secundária por Qualidade de Atendimento
      if (b.salesMonth !== a.salesMonth) return b.salesMonth - a.salesMonth
      return b.qualityScore - a.qualityScore
    })

    const ranking = {
      sellers: rankedSellers.map((s, idx) => ({
        rank: idx + 1,
        id: s.id,
        name: s.name,
        sales: s.salesMonth,
        qualityScore: s.qualityScore,
        acceptanceRate: s.acceptanceRate,
      })),
    }

    const data = {
      manager: {
        id: user.id,
        name: user.name,
        unitId: targetUnitId,
        unitName: unit?.name ?? 'Minha Unidade',
      },
      unitOverview,
      goals: {
        unit: unitGoal && unitGoalProgress ? {
          title: unitGoal.title ?? `Meta da Unidade`,
          target: unitGoalProgress.target,
          achieved: unitGoalProgress.achievedValue,
          percent: unitGoalProgress.percent,
          remaining: Math.max(unitGoalProgress.target - unitGoalProgress.achievedValue, 0),
          status: getGoalStatus(unitGoalProgress.percent, goalWindow(unitGoal as any, now).start, goalWindow(unitGoal as any, now).end, now),
        } : null,
        team: teamGoals,
      },
      sellers: sellersOverview,
      leads: {
        newCount: leadsNovos,
        activeCount: leadsEmAtendimento,
        noContactCount: leadsSemContato,
        followUpTodayCount: leadsRetornoHoje,
        overdueCount: leadsAtrasados,
        convertedMonth: leadsConvertidos,
        noContactOver24h: leadsNoContactOver24h,
        funnel,
      },
      pendingIssues: {
        criticalCount: pCritical,
        overdueCount: pOverdue,
        dueTodayCount: pDueToday,
        escalatedCount: pEscalated,
        items: topPendencies.map((p) => ({
          id: p.id,
          type: p.type ?? 'PENDENCIA',
          description: p.description ?? '',
          priority: p.priority,
          dueDate: p.dueDate,
          customerName: p.customerName,
          negotiation: p.negotiation ?? null,
          responsibleName: p.responsible?.fullName ?? 'Sem responsável',
        })),
      },
      collections: {
        recommendedActions,
      },
      queue: queueStats,
      ranking,
      documentsAndFinance,
      alerts,
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('Erro no painel do gerente:', err)
    return NextResponse.json({ success: false, error: 'Falha ao processar dados agregados do gerente.' }, { status: 500 })
  }
}
