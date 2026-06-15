// =============================================================================
// /api/reports/communication?view=whatsapp|email|avisos|logs — read-only
// Relatórios de comunicação. Multi-tenant; models sem tenantId são escopados
// via relação (pendency/notification). Gated por canAccessModule('logs').
//  - whatsapp: PendencyMessage (envios) + MessageReturn (recebidas)
//  - email:    NotificationDelivery channel EMAIL
//  - avisos:   Notification (avisos internos do app)
//  - logs:     NotificationDelivery (todos os canais) por canal/status
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, assertTenantId, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'

const VIEWS = ['whatsapp', 'email', 'avisos', 'logs'] as const
type View = (typeof VIEWS)[number]

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'logs')) return forbiddenResponse('Sem acesso a relatórios.')

  try {
    const tenantId = assertTenantId(user.tenantId, user.role) // null p/ MASTER
    const isMaster = user.role === 'MASTER'
    const { searchParams } = new URL(req.url)
    const viewParam = (searchParams.get('view') ?? 'whatsapp') as View
    const view: View = VIEWS.includes(viewParam) ? viewParam : 'whatsapp'

    // Escopo por relação para models sem tenantId.
    const viaRel = (rel: string): Record<string, unknown> => (isMaster ? {} : { [rel]: { tenantId } })

    // ---- Avisos internos (Notification: tem tenantId) -------------------
    if (view === 'avisos') {
      const where = isMaster ? {} : { tenantId }
      const [rows, byType] = await Promise.all([
        prisma.notification.findMany({
          where: where as never, orderBy: { createdAt: 'desc' }, take: 500,
          select: { id: true, title: true, message: true, type: true, read: true, createdAt: true, user: { select: { name: true } } },
        }),
        prisma.notification.groupBy({ by: ['type'], where: where as never, _count: { _all: true } }),
      ])
      const data = rows.map((n) => ({ id: n.id, title: n.title, message: n.message, type: n.type, read: n.read, createdAt: n.createdAt, destinatario: n.user?.name ?? '—' }))
      return NextResponse.json({
        success: true, view,
        summary: { count: data.length, lidas: data.filter((d) => d.read).length, naoLidas: data.filter((d) => !d.read).length },
        byType: byType.map((g) => ({ key: g.type, count: g._count._all })).sort((a, b) => b.count - a.count),
        data,
      })
    }

    // ---- WhatsApp (PendencyMessage via pendency + MessageReturn) ---------
    if (view === 'whatsapp') {
      const where = { ...viaRel('pendency'), channel: 'WHATSAPP' }
      const [rows, byStatus, recebidas] = await Promise.all([
        prisma.pendencyMessage.findMany({
          where: where as never, orderBy: { createdAt: 'desc' }, take: 500,
          select: { id: true, direction: true, status: true, content: true, sentAt: true, createdAt: true, pendency: { select: { customerName: true, plate: true } } },
        }),
        prisma.pendencyMessage.groupBy({ by: ['status'], where: where as never, _count: { _all: true } }),
        prisma.messageReturn.count({ where: viaRel('pendency') as never }),
      ])
      const data = rows.map((m) => ({ id: m.id, direction: m.direction, status: m.status, content: m.content, sentAt: m.sentAt, createdAt: m.createdAt, cliente: m.pendency?.customerName ?? '—', plate: m.pendency?.plate ?? null }))
      return NextResponse.json({
        success: true, view,
        summary: { count: data.length, enviadas: data.filter((d) => d.direction === 'OUTBOUND').length, recebidas },
        byStatus: byStatus.map((g) => ({ key: g.status ?? '—', count: g._count._all })).sort((a, b) => b.count - a.count),
        data,
      })
    }

    // ---- E-mail / Logs (NotificationDelivery via notification) ----------
    const isEmail = view === 'email'
    const where = { ...viaRel('notification'), ...(isEmail ? { channel: 'EMAIL' } : {}) }
    const [rows, byStatus, byChannel] = await Promise.all([
      prisma.notificationDelivery.findMany({
        where: where as never, orderBy: { createdAt: 'desc' }, take: 500,
        select: { id: true, channel: true, status: true, sentAt: true, deliveredAt: true, errorMessage: true, createdAt: true, user: { select: { name: true } }, notification: { select: { title: true } } },
      }),
      prisma.notificationDelivery.groupBy({ by: ['status'], where: where as never, _count: { _all: true } }),
      isEmail ? Promise.resolve([]) : prisma.notificationDelivery.groupBy({ by: ['channel'], where: where as never, _count: { _all: true } }),
    ])
    const data = rows.map((d) => ({ id: d.id, channel: d.channel, status: d.status, title: d.notification?.title ?? '—', destinatario: d.user?.name ?? '—', sentAt: d.sentAt, deliveredAt: d.deliveredAt, errorMessage: d.errorMessage, createdAt: d.createdAt }))
    return NextResponse.json({
      success: true, view,
      summary: { count: data.length, erros: data.filter((d) => d.status === 'ERRO').length, entregues: data.filter((d) => d.status === 'ENTREGUE' || d.status === 'LIDO').length },
      byStatus: byStatus.map((g) => ({ key: g.status, count: g._count._all })).sort((a, b) => b.count - a.count),
      byChannel: (byChannel as { channel: string; _count: { _all: number } }[]).map((g) => ({ key: g.channel, count: g._count._all })).sort((a, b) => b.count - a.count),
      data,
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
