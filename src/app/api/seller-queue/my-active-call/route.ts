// =============================================================================
// GET /api/seller-queue/my-active-call — endpoint LEVE para o pop-up global.
// Devolve SÓ o que o QueueAlertWatcher precisa (a chamada ativa do próprio
// usuário + config de alerta), sem o peso do /current (automações, sweeps,
// pos-vendas, blocos, permissões). Feito para ser consultado a cada ~2s.
// Gate: mesmo do /current (view/painel/dashboard/fallback). Tenant/unit-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { handlePrismaError } from '@/lib/prisma-errors'
import { queueDate, resolveQueueUnitForRead, getUnitConfig, isQueuePanelFallbackUser } from '@/lib/seller-queue/queue'
import { assertModuleEnabled, canAccessModuleForUser, isModuleEnabled } from '@/lib/tenant-modules'
import { sweepExpiredCalls } from '@/lib/seller-queue/call'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  const [canViewQueue, canViewPanel, canViewDashboard] = await Promise.all([
    canAccessModuleForUser(user, 'sellerQueue.view'),
    canAccessModuleForUser(user, 'queue.panel.view'),
    canAccessModuleForUser(user, 'queue.dashboard.view'),
  ])
  const panelFallback = isQueuePanelFallbackUser(user)
  if (!canViewQueue && !canViewPanel && !canViewDashboard && !panelFallback) return forbiddenResponse('Sem acesso à fila.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  if (canViewQueue) {
    const gate = await assertModuleEnabled(user, 'sellerQueue.view')
    if (gate) return gate
  } else if (user.role !== 'MASTER' && !await isModuleEnabled(tenantId, 'sellerQueue.view')) {
    return forbiddenResponse('Este recurso não está habilitado para a sua loja. Fale com o suporte.')
  }

  try {
    const unitScope = await resolveQueueUnitForRead(req, user, tenantId)
    if (!unitScope.unitId) {
      return NextResponse.json({ success: false, error: unitScope.error ?? 'Informe a unidade (?unitId=) ou tenha unidade vinculada.' }, { status: unitScope.status ?? 400 })
    }
    const unitId = unitScope.unitId

    // Config de alerta (mesma forma que o /current devolve). getUnitConfig é leve/cacheado.
    const ucfg = await getUnitConfig(tenantId, unitId)
    const alerts = {
      sound: ucfg?.alertSound ?? true,
      soundType: ucfg?.alertSoundType ?? 'siren',
      browserPush: ucfg?.alertBrowserPush ?? true,
      repeatSeconds: ucfg?.alertRepeatSeconds ?? 10,
    }

    // Chamada ativa do próprio usuário na fila de HOJE (2 queries indexadas).
    const queue = await prisma.sellerQueue.findUnique({
      where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } },
      select: { id: true },
    })

    // Auto-cura: expira chamadas VENCIDAS presas na fila desta unidade. O watcher
    // global (QueueAlertWatcher) consulta este endpoint a cada ~2s em QUALQUER tela
    // aberta — isto restaura a varredura ambiente que antes vinha do /current (o
    // watcher passou a usar este endpoint na Fase 1). Só varre quando HÁ chamada
    // vencida (uma contagem indexada barata no caso normal), evitando que o painel
    // toque eternamente quando o vendedor chamado não aceita no prazo.
    if (queue) {
      const expiredCount = await prisma.sellerQueueAttendance.count({
        where: { queueId: queue.id, status: 'CALLED', acceptDeadline: { lt: new Date() } },
      })
      if (expiredCount > 0) {
        await sweepExpiredCalls({ tenantId, unitId, queueId: queue.id, actorId: user.id }).catch(() => {})
      }
    }

    const myAtt = queue
      ? await prisma.sellerQueueAttendance.findFirst({
          where: { queueId: queue.id, sellerId: user.id, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } },
          include: { arrival: { select: { customerName: true, customerPhone: true, customerEmail: true, recurring: true } } },
          orderBy: { calledAt: 'desc' },
        })
      : null

    return NextResponse.json({
      success: true,
      data: {
        myAttendance: myAtt
          ? { id: myAtt.id, status: myAtt.status, acceptDeadline: myAtt.acceptDeadline, arrival: myAtt.arrival, visitType: myAtt.visitType, startedAt: myAtt.startedAt || myAtt.calledAt }
          : null,
        alerts,
        unitName: unitScope.unitName,
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
