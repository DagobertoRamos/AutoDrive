import { NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

const schema = z.object({ email: z.string().email() })

export async function POST(req: Request) {
  try {
    const { email } = schema.parse(await req.json())
    const user = await prisma.user.findUnique({ where: { email } })

    if (user) {
      const token = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1h

      await prisma.passwordReset.create({
        data: { userId: user.id, token, expiresAt },
      })

      // TODO: enviar e-mail com o token
      console.info(`[forgot-password] Token para ${email}: ${token}`)
    }

    // Sempre retornar sucesso para não revelar se o e-mail existe
    return NextResponse.json({
      success: true,
      message: 'Se o e-mail existir, você receberá as instruções de recuperação.',
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'E-mail inválido.' }, { status: 400 })
    }
    return NextResponse.json({ success: false, error: 'Erro interno.' }, { status: 500 })
  }
}
