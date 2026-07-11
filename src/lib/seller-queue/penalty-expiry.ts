// =============================================================================
// penalty-expiry.ts — expira SellerQueuePenalties com endsAt no passado.
// Roda no cron tick. Ao expirar: notifica o vendedor e desativa a penalidade.
// Tolerante: sem a tabela, retorna zeros.
// =============================================================================

import { prisma } from '@/lib/prisma'

export async function runPenaltyExpirySweep(): Promise<{ expired: number }> {
  const now = new Date()
  try {
    const expired = await prisma.sellerQueuePenalty.findMany({
      where: { active: true, endsAt: { lte: now } },
      select: { id: true, sellerId: true, tenantId: true, points: true },
      take: 200,
    })
    if (!expired.length) return { expired: 0 }
    await prisma.sellerQueuePenalty.updateMany({ where: { id: { in: expired.map(p => p.id) } }, data: { active: false } })
    const unique = [...new Map(expired.map(p => [p.sellerId, p])).values()]
    await Promise.all(unique.map(p =>
      prisma.notification.create({ data: { userId: p.sellerId, tenantId: p.tenantId, type: 'SISTEMA' as never, title: '✅ Restrição da fila encerrada', message: 'Sua restrição operacional expirou. Você volta a ser elegível para chamadas.', actionUrl: '/vendedor-da-vez' } }).catch(() => {})
    ))
    return { expired: expired.length }
  } catch {
    return { expired: 0 }
  }
}
