// =============================================================================
// POST /api/auth/activate — Ativar conta via token
//
// Fluxo:
//   1. Admin aprova usuário PENDENTE e gera um PasswordReset token
//   2. Usuário recebe o link /ativar-cadastro?token=xxx
//   3. Esta rota valida o token, define a senha e ativa a conta
//
// Reutiliza a tabela PasswordReset para evitar tabela extra.
// =============================================================================

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  token:    z.string().min(1, 'Token obrigatório.'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres.'),
})

export async function POST(req: Request) {
  try {
    const { token, password } = schema.parse(await req.json())

    // ── Busca token ──────────────────────────────────────────────────────────
    const reset = await prisma.passwordReset.findUnique({
      where:   { token },
      include: { user: { select: { id: true, status: true, mustChangePassword: true } } },
    })

    if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
      return NextResponse.json(
        { success: false, error: 'Token inválido ou expirado. Solicite um novo link de ativação.' },
        { status: 400 },
      )
    }

    const passwordHash = await bcrypt.hash(password, 12)

    // ── Ativa conta + define senha em transação ──────────────────────────────
    await prisma.$transaction([
      prisma.user.update({
        where: { id: reset.userId },
        data: {
          passwordHash,
          status:             'ATIVO',
          mustChangePassword: false,
        },
      }),
      prisma.passwordReset.update({
        where: { id: reset.id },
        data:  { usedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          userId:   reset.userId,
          action:   'ACTIVATE',
          entity:   'User',
          entityId: reset.userId,
        },
      }),
    ])

    return NextResponse.json({ success: true, message: 'Conta ativada com sucesso.' })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0]?.message ?? 'Dados inválidos.' },
        { status: 400 },
      )
    }
    console.error('[POST /api/auth/activate]', err)
    return NextResponse.json({ success: false, error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }
}
