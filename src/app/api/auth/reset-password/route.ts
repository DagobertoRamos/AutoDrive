import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})

export async function POST(req: Request) {
  try {
    const { token, password } = schema.parse(await req.json())

    const reset = await prisma.passwordReset.findUnique({ where: { token } })

    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: 'Token inválido ou expirado.' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    await Promise.all([
      prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
      prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      prisma.auditLog.create({
        data: { userId: reset.userId, action: 'UPDATE', entity: 'User', entityId: reset.userId },
      }),
    ])

    return NextResponse.json({ success: true, message: 'Senha redefinida com sucesso.' })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Dados inválidos.' }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: 'Erro interno.' }, { status: 500 })
  }
}
