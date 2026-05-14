import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })

    const settings = await prisma.systemSetting.findMany()

    // Converter para objeto chave-valor
    const settingsObj = settings.reduce<Record<string, string>>((acc, s) => {
      acc[s.key] = s.value
      return acc
    }, {})

    return NextResponse.json({ success: true, data: settingsObj })
  } catch {
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 })

    if (!['MASTER', 'ADM'].includes(session.user.role)) {
      return NextResponse.json({ success: false, error: 'Sem permissão' }, { status: 403 })
    }

    const body: Record<string, string> = await req.json()

    // Upsert cada configuração
    await Promise.all(
      Object.entries(body).map(([key, value]) =>
        prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: String(value), updatedByUserId: session.user.id },
          update: { value: String(value), updatedByUserId: session.user.id },
        })
      )
    )

    await prisma.auditLog.create({
      data: { userId: session.user.id, action: 'UPDATE', entity: 'SystemSetting' },
    })

    return NextResponse.json({ success: true, message: 'Configurações salvas.' })
  } catch {
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
