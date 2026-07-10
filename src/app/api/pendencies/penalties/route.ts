// =============================================================================
// GET /api/pendencies/penalties — painel do gestor: quem está penalizado, desde
// quando, motivo e a pendência que causou. Só gestor+. Tenant/unidade-scoped.
// ?includeRemoved=1 traz também as removidas (histórico). Tolerante a migration.
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isPendencyManagerPlus } from '@/lib/pendencies/access'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const session = await getServerAuthSession()
  if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
  if (!isPendencyManagerPlus(session.user.role)) return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })

  const includeRemoved = new URL(req.url).searchParams.get('includeRemoved') === '1'
  const where: Record<string, unknown> = { ...(includeRemoved ? {} : { active: true }) }
  if (session.user.role !== 'MASTER') where.tenantId = session.user.tenantId ?? '__none__'
  // GERENTE vê só a própria unidade.
  if (session.user.role === 'GERENTE' && session.user.unitId) where.unitId = session.user.unitId

  const penalties = await prisma.pendencyPenalty.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 200,
    include: { pendency: { select: { id: true, customerName: true, plate: true, type: true, status: true, dueDate: true } } },
  }).catch(() => [] as never[])

  // Resolve nomes dos vendedores penalizados (sellerUserId → User).
  const userIds = Array.from(new Set(penalties.map((p) => p.sellerUserId)))
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, unit: { select: { name: true } } } }).catch(() => [])
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  const data = penalties.map((p) => ({
    id: p.id,
    sellerUserId: p.sellerUserId,
    sellerName: userMap.get(p.sellerUserId)?.name ?? userMap.get(p.sellerUserId)?.email ?? '—',
    unitName: userMap.get(p.sellerUserId)?.unit?.name ?? null,
    type: p.type,
    reason: p.reason,
    active: p.active,
    since: p.createdAt,
    removedAt: p.removedAt,
    removedReason: p.removedReason,
    pendency: p.pendency,
  }))

  return NextResponse.json({ success: true, data })
}
