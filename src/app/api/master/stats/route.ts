// =============================================================================
// GET /api/master/stats — Estatísticas completas da plataforma (MASTER only)
// =============================================================================

import { NextResponse } from 'next/server'
import { requireMaster } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const now      = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      totalTenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      blockedTenants,
      bannedTenants,
      cancelledTenants,
      inadimplentesTenants,
      pausedTenants,
      totalUsers,
      activeUsers,
      totalDeals,
      totalVehicles,
      totalPendencies,
      openPendencies,
      recentTenants,
      newTenantsThisMonth,
      newUsersThisMonth,
      totalAuditLogs,
      masterActions,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'ATIVO' } }),
      prisma.tenant.count({ where: { status: 'TESTE' } }),
      prisma.tenant.count({ where: { status: 'SUSPENSO' } }),
      prisma.tenant.count({ where: { status: 'BLOQUEADO' } }),
      prisma.tenant.count({ where: { status: 'BANIDO' } }),
      prisma.tenant.count({ where: { status: 'CANCELADO' } }),
      prisma.tenant.count({ where: { status: 'INADIMPLENTE' } }),
      prisma.tenant.count({ where: { status: 'PAUSADO' } }),
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ATIVO' } }),
      prisma.deal.count(),
      prisma.vehicle.count(),
      prisma.pendency.count(),
      prisma.pendency.count({ where: { status: { in: ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_RESPOSTA'] } } }),
      prisma.tenant.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id:        true,
          publicId:  true,
          name:      true,
          plan:      true,
          status:    true,
          createdAt: true,
          _count: { select: { users: true } },
        },
      }),
      prisma.tenant.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { userRole: 'MASTER', createdAt: { gte: monthStart } } }),
    ])

    // Planos: distribuição de tenants por plano
    const planDistribution = await prisma.tenant.groupBy({
      by: ['plan'],
      _count: { _all: true },
    })

    // Feature flags ativas
    const activeFlagsCount = await prisma.featureFlag.count({ where: { enabled: true } })

    // Manutenção global ativa?
    const maintenance = await prisma.maintenanceMode.findFirst({
      where: { scope: 'GLOBAL' },
      orderBy: { createdAt: 'desc' },
    })

    // Avisos internos ativos
    const activeNoticesCount = await prisma.internalNotice.count({ where: { active: true } })

    return NextResponse.json({
      success: true,
      data: {
        tenants: {
          total:        totalTenants,
          active:       activeTenants,
          trial:        trialTenants,
          suspended:    suspendedTenants,
          blocked:      blockedTenants,
          banned:       bannedTenants,
          cancelled:    cancelledTenants,
          inadimplente: inadimplentesTenants,
          paused:       pausedTenants,
          newThisMonth: newTenantsThisMonth,
        },
        users: {
          total:        totalUsers,
          active:       activeUsers,
          newThisMonth: newUsersThisMonth,
        },
        operational: {
          totalDeals,
          totalVehicles,
          totalPendencies,
          openPendencies,
        },
        platform: {
          activeFlagsCount,
          activeNoticesCount,
          maintenanceActive: maintenance?.active ?? false,
          totalAuditLogs,
          masterActionsThisMonth: masterActions,
        },
        planDistribution: planDistribution.map(p => ({
          plan:  p.plan,
          count: p._count._all,
        })),
        recentTenants,
      },
    })
  } catch (err) {
    console.error('[GET /api/master/stats]', err)
    return handlePrismaError(err)
  }
}
