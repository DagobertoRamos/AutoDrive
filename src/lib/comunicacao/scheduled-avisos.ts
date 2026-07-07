// =============================================================================
// comunicacao/scheduled-avisos.ts — dispara avisos internos AGENDADOS.
//
// Um aviso criado com status "SCHEDULED" fica com `active=false` (não aparece)
// e `startsAt` no futuro. Quando chega a hora (startsAt <= agora), este job o
// PUBLICA: status → ACTIVE, active → true, publishedAt = agora. Aí o endpoint
// /api/internal-notices/active (que filtra active:true + startsAt<=now) passa a
// mostrá-lo. Chamado pelo /api/queue/jobs/tick (cron a cada 1 min).
// Idempotente: só pega SCHEDULED vencidos e ainda dentro da validade (endsAt).
// =============================================================================

import { prisma } from '@/lib/prisma'

export async function dispatchScheduledAvisos(): Promise<{ published: number }> {
  const now = new Date()
  const due = await prisma.internalNotice.findMany({
    where: {
      status: 'SCHEDULED',
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gte: now } }],
    },
    select: { id: true },
  }).catch(() => [] as Array<{ id: string }>)

  if (!due.length) return { published: 0 }
  const ids = due.map((d) => d.id)

  await prisma.internalNotice.updateMany({
    where: { id: { in: ids }, status: 'SCHEDULED' }, // compare-and-set (evita corrida)
    data: { status: 'ACTIVE', active: true, publishedAt: now },
  })

  // Auditoria (action 'PUBLISHED' é do enum do InternalNoticeLog).
  for (const id of ids) {
    await prisma.internalNoticeLog.create({
      data: { noticeId: id, action: 'PUBLISHED', success: true, details: { via: 'scheduled-dispatch' } as never },
    }).catch(() => {})
  }

  return { published: ids.length }
}
