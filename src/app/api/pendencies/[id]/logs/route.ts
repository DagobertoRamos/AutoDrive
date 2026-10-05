// =============================================================================
// GET /api/pendencies/[id]/logs — histórico de envios (push/manual/escalonamento)
// da pendência, usado na aba "Envios" do modal. Mesmo gate/escopo da /timeline.
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'

export async function GET(_req: Request, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  const { id } = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session?.user) return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
  if (!canAccessModule(session.user.role, 'pendencies') && !canAccessModule(session.user.role, 'pendencies.central')) {
    return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
  }

  const pendency = await prisma.pendency.findFirst({
    where: { id, ...(session.user.role !== 'MASTER' && session.user.tenantId ? { tenantId: session.user.tenantId } : {}) },
    select: { id: true },
  })
  if (!pendency) return NextResponse.json({ success: false, error: 'Pendência não encontrada' }, { status: 404 })

  const logs = await prisma.pendencyNotificationLog.findMany({
    where: { pendencyId: id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, channel: true, status: true, sentCount: true, detail: true, createdAt: true },
  }).catch(() => [])

  return NextResponse.json({ success: true, data: logs })
}
