// =============================================================================
// GET /api/pendencies/[id]/timeline — timeline unificada da pendência: mescla
// pendency_events + status_history + comments + notification_logs em ordem
// cronológica. Cada fonte é tolerante a migration pendente (.catch → []).
// Gate: pendencies. Tenant-scoped.
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { buildTimeline } from '@/lib/pendencies/events'

export async function GET(_req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
  if (!canAccessModule(session.user.role, 'pendencies') && !canAccessModule(session.user.role, 'pendencies.central')) {
    return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
  }

  // Escopo: garante que a pendência é do tenant do usuário (MASTER vê todas).
  const pendency = await prisma.pendency.findFirst({
    where: { id, ...(session.user.role !== 'MASTER' && session.user.tenantId ? { tenantId: session.user.tenantId } : {}) },
    select: { id: true },
  })
  if (!pendency) return NextResponse.json({ success: false, error: 'Pendência não encontrada' }, { status: 404 })

  const [events, statusHistory, comments, notificationLogs] = await Promise.all([
    prisma.pendencyEvent.findMany({ where: { pendencyId: id }, orderBy: { createdAt: 'desc' }, take: 200 }).catch(() => []),
    prisma.pendencyStatusHistory.findMany({ where: { pendencyId: id }, orderBy: { createdAt: 'desc' }, take: 200, include: { changedByUser: { select: { name: true } } } }).catch(() => []),
    prisma.pendencyComment.findMany({ where: { pendencyId: id }, orderBy: { createdAt: 'desc' }, take: 200, include: { user: { select: { name: true } } } }).catch(() => []),
    prisma.pendencyNotificationLog.findMany({ where: { pendencyId: id }, orderBy: { createdAt: 'desc' }, take: 200 }).catch(() => []),
  ])

  return NextResponse.json({ success: true, data: buildTimeline({ events, statusHistory, comments, notificationLogs }) })
}
