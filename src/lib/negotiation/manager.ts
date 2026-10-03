// =============================================================================
// Gerente responsável da negociação (Deal.managerId = User.id do gerente).
// Regra: o gerente do vendedor (Seller.manager); sem ele, o primeiro gerente
// ativo da unidade (mesma regra da importação AutoConf).
// =============================================================================

import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export async function resolveDealManagerUserId(db: Db, input: { sellerId?: string | null; unitId?: string | null }): Promise<string | null> {
  if (input.sellerId) {
    const s = await db.seller.findUnique({ where: { id: input.sellerId }, select: { unitId: true, manager: { select: { userId: true, active: true } } } })
    if (s?.manager?.active && s.manager.userId) return s.manager.userId
    if (!input.unitId) input = { ...input, unitId: s?.unitId ?? null }
  }
  if (!input.unitId) return null
  const m = await db.manager.findFirst({ where: { unitId: input.unitId, active: true }, orderBy: { createdAt: 'asc' }, select: { userId: true } })
  return m?.userId ?? null
}
