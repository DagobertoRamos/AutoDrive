// =============================================================================
// scripts/backfill-positions.ts
// One-time backfill: assign Position to existing Seller/Manager/User rows
// based on slug (sellers→vendedor, managers→gerente) and User.role mapping.
// Idempotent: skips rows that already have positionId.
// =============================================================================

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const USER_ROLE_TO_SLUG: Record<string, string | null> = {
  VENDEDOR: 'vendedor',
  VENDEDOR_LIDER: 'vendedor_lider',
  GERENTE: 'gerente',
  GERENTE_GERAL: 'gerente_geral',
  USUARIO_LIDER: null,
  USUARIO: null,
  ADM: null,
  MASTER: null,
}

async function main() {
  const systemPositions = await prisma.position.findMany({
    where: { tenantId: null, isSystem: true },
    select: { id: true, slug: true },
  })
  const bySlug = new Map(systemPositions.map((p) => [p.slug, p.id]))

  const requiredSlugs = ['vendedor', 'gerente', 'vendedor_lider', 'gerente_geral']
  for (const s of requiredSlugs) {
    if (!bySlug.has(s)) {
      console.warn(`[backfill] WARNING: system position with slug "${s}" not found`)
    }
  }

  // ── Sellers ────────────────────────────────────────────────────────────────
  const vendedorId = bySlug.get('vendedor')
  let sellersUpdated = 0
  if (vendedorId) {
    const res = await prisma.seller.updateMany({
      where: { positionId: null },
      data: { positionId: vendedorId },
    })
    sellersUpdated = res.count
  }

  // ── Managers ───────────────────────────────────────────────────────────────
  const gerenteId = bySlug.get('gerente')
  let managersUpdated = 0
  if (gerenteId) {
    const res = await prisma.manager.updateMany({
      where: { positionId: null },
      data: { positionId: gerenteId },
    })
    managersUpdated = res.count
  }

  // ── Users (by role) ────────────────────────────────────────────────────────
  let usersUpdated = 0
  for (const [role, slug] of Object.entries(USER_ROLE_TO_SLUG)) {
    if (!slug) continue
    const positionId = bySlug.get(slug)
    if (!positionId) continue
    const res = await prisma.user.updateMany({
      where: { positionId: null, role: role as never },
      data: { positionId },
    })
    usersUpdated += res.count
  }

  console.log('[backfill] done', { sellersUpdated, managersUpdated, usersUpdated })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
