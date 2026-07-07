// =============================================================================
// seller-queue/dashboard.ts — dados OPERACIONAIS agregados do dashboard da fila
// numa única chamada (atendimentos ativos + lembretes + bloqueios). Reduz o
// número de fetches do dashboard (6→2 no polling rápido). O ranking (7 dias) e o
// log ficam FORA daqui (carregam numa cadência lenta no front). Escopo tenant+unidade.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { queueDate } from './queue'
import { getReminderDashboard } from './reminders'
import { listBlockedSellers } from './penalty'

export async function getQueueDashboardData(opts: {
  tenantId: string
  unitId: string
  userId: string
  canManage: boolean
}) {
  const { tenantId, unitId, userId } = opts
  const queue = await prisma.sellerQueue.findUnique({
    where: { tenantId_unitId_date: { tenantId, unitId, date: queueDate() } },
    select: { id: true },
  }).catch(() => null)

  const [attendances, reminders, blocks] = await Promise.all([
    queue
      ? prisma.sellerQueueAttendance.findMany({
          where: { queueId: queue.id, status: { in: ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'] } },
          orderBy: { calledAt: 'desc' },
          take: 200,
        }).catch(() => [])
      : Promise.resolve([]),
    getReminderDashboard({ tenantId, unitId, userId }).catch(() => null),
    opts.canManage ? listBlockedSellers(tenantId, unitId).catch(() => []) : Promise.resolve([]),
  ])

  return { attendances, reminders, blocks }
}
