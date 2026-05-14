// =============================================================================
// POST /api/auth/change-password
// Troca de senha com critérios de segurança obrigatórios.
// Usado na troca forçada (mustChangePassword = true) e na troca voluntária.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import bcrypt from 'bcryptjs'

// ── Critérios mínimos de senha ────────────────────────────────────────────────

function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'A senha deve ter pelo menos 8 caracteres.' }
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'A senha deve conter pelo menos uma letra maiúscula.' }
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'A senha deve conter pelo menos uma letra minúscula.' }
  }
  if (!/\d/.test(password)) {
    return { valid: false, error: 'A senha deve conter pelo menos um número.' }
  }
  const specialCount = (password.match(/[^A-Za-z0-9]/g) ?? []).length
  if (specialCount < 2) {
    return { valid: false, error: 'A senha deve conter pelo menos 2 caracteres especiais (ex: @, #, !, %, &).' }
  }
  return { valid: true }
}

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session?.user) {
    return NextResponse.json({ success: false, error: 'Não autenticado.' }, { status: 401 })
  }

  try {
    const body                            = await req.json()
    const { currentPassword, newPassword, confirmPassword } = body as {
      currentPassword?: string
      newPassword:      string
      confirmPassword:  string
    }

    if (!newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'Nova senha e confirmação são obrigatórias.' },
        { status: 400 },
      )
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, error: 'Nova senha e confirmação não coincidem.' },
        { status: 400 },
      )
    }

    // Valida força da senha
    const strength = validatePasswordStrength(newPassword)
    if (!strength.valid) {
      return NextResponse.json(
        { success: false, error: strength.error },
        { status: 400 },
      )
    }

    const user = await prisma.user.findUnique({
      where:  { id: session.user.id },
      select: { id: true, passwordHash: true, mustChangePassword: true },
    })

    if (!user) {
      return NextResponse.json({ success: false, error: 'Usuário não encontrado.' }, { status: 404 })
    }

    // Se não é troca forçada, exige senha atual
    if (!user.mustChangePassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { success: false, error: 'Informe a senha atual.' },
          { status: 400 },
        )
      }
      const currentValid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!currentValid) {
        return NextResponse.json(
          { success: false, error: 'Senha atual incorreta.' },
          { status: 400 },
        )
      }
    }

    // Impede reutilizar senha que seja o CPF sem pontuação (a senha padrão)
    // Não salva o CPF aqui — apenas verifica pelo hash
    const newPasswordHash = await bcrypt.hash(newPassword, 12)

    await prisma.user.update({
      where: { id: session.user.id },
      data:  {
        passwordHash:      newPasswordHash,
        mustChangePassword: false,
      },
    })

    await createSafeAuditLog({
      userId:   session.user.id,
      tenantId: session.user.tenantId ?? null,
      action:   'CHANGE_PASSWORD',
      entity:   'User',
      entityId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
    })

    return NextResponse.json({
      success: true,
      message: 'Senha alterada com sucesso.',
      mustChangePassword: false,
    })

  } catch {
    return NextResponse.json(
      { success: false, error: 'Erro ao alterar senha.' },
      { status: 500 },
    )
  }
}
