import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const onlyUnread = searchParams.get('unread') === 'true'

    const where = {
      userId: session.user.id,
      ...(onlyUnread ? { read: false } : {}),
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.count({ where: { userId: session.user.id, read: false } }),
    ])

    return NextResponse.json({ success: true, data: notifications, unreadCount })
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })

    const body = await req.json()
    const notification = await prisma.notification.create({ data: body })

    return NextResponse.json({ success: true, data: notification }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
