// =============================================================================
// POST /api/auth/forgot-password — Solicita link de redefinição de senha
//
// Fluxo:
//   1. Recebe e-mail
//   2. Se o usuário existir e estiver ATIVO:
//      a. Invalida tokens anteriores não usados (defesa contra reuso)
//      b. Cria PasswordReset (token randômico, 1h de validade)
//      c. Envia e-mail via @/lib/auth-mailer (template PASSWORD_RESET)
//   3. SEMPRE retorna 200 com a mesma mensagem genérica — não revela se o
//      e-mail existe, conforme melhor prática de segurança (enumeration).
//
// O envio do e-mail é "best-effort": falhas de SMTP são logadas mas não
// retornadas ao cliente. O master operador deve monitorar pelos logs.
// =============================================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendPasswordResetEmail } from '@/lib/auth-mailer'

export const dynamic = 'force-dynamic'

const schema = z.object({ email: z.string().email() })

const EXPIRES_MS = 60 * 60 * 1000 // 1 hora

export async function POST(req: Request) {
  try {
    const { email } = schema.parse(await req.json())
    const normalizedEmail = email.trim().toLowerCase()

    const user = await prisma.user.findUnique({
      where:  { email: normalizedEmail },
      select: { id: true, name: true, email: true, tenantId: true, status: true },
    })

    if (user && user.status === 'ATIVO') {
      // Invalida tokens antigos não-usados do mesmo usuário antes de gerar um novo
      await prisma.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
        data:  { usedAt: new Date() },
      })

      const token     = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + EXPIRES_MS)

      await prisma.passwordReset.create({
        data: { userId: user.id, token, expiresAt },
      })

      // Envio fire-and-log — não bloqueia a resposta com falhas SMTP
      const result = await sendPasswordResetEmail({
        user: {
          id:       user.id,
          name:     user.name,
          email:    user.email,
          tenantId: user.tenantId,
        },
        token,
        expiresAtMs: EXPIRES_MS,
      })

      if (!result.success) {
        console.error(
          `[forgot-password] FALHA AO ENVIAR para ${user.email}:`,
          result.errorCode, result.errorMessage,
        )
      } else {
        console.info(
          `[forgot-password] enviado para ${user.email} (messageId=${result.messageId ?? '-'}, ${result.responseMs}ms)`,
        )
      }
    }

    // Sempre 200 com mensagem genérica
    return NextResponse.json({
      success: true,
      message: 'Se o e-mail existir, você receberá as instruções de recuperação.',
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'E-mail inválido.' }, { status: 400 })
    }
    console.error('[POST /api/auth/forgot-password]', err)
    return NextResponse.json({ success: false, error: 'Erro interno.' }, { status: 500 })
  }
}
