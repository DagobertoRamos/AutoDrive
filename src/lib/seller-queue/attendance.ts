// =============================================================================
// seller-queue/attendance.ts — helper para mover o vendedor ao FIM da fila.
// Usado ao finalizar/recusar/expirar um atendimento (volta o vendedor ao fim).
// =============================================================================

import type { Prisma } from '@prisma/client'

/** Move a entry do vendedor para o fim da fila (status WAITING + nova posição). */
export async function moveEntryToEnd(
  tx: Prisma.TransactionClient,
  queueId: string,
  sellerId: string,
  opts?: { countAttendance?: boolean },
) {
  const agg = await tx.sellerQueueEntry.aggregate({ where: { queueId }, _max: { position: true } })
  const pos = (agg._max.position ?? 0) + 1
  const entry = await tx.sellerQueueEntry.findUnique({ where: { queueId_sellerId: { queueId, sellerId } } })
  if (!entry) return null
  return tx.sellerQueueEntry.update({
    where: { id: entry.id },
    data: {
      status: 'WAITING', position: pos, pausedAt: null, lastActiveAt: new Date(),
      ...(opts?.countAttendance ? { attendanceCount: { increment: 1 }, lastAttendanceAt: new Date() } : {}),
    },
  })
}
