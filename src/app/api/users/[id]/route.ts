// =============================================================================
// /api/users/[id]
//
// GET  — retorna dados do usuário (nome, telefone, e-mail) + prefs de notificação
// PUT  — atualiza nome, telefone e/ou prefs de notificação
//
// Segurança:
//   • Usuário só pode ler/editar o próprio perfil
//   • MASTER pode acessar qualquer usuário
//
// Prefs de notificação são armazenadas em SystemSetting com chave
//   u:<userId>:notification_prefs   (JSON stringificado no campo `value`)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'

const NOTIF_DEFAULTS = {
  emailAlerts:        true,
  whatsappAlerts:     true,
  newPending:         true,
  pendingUpdates:     true,
  commissionUpdates:  false,
  systemAlerts:       false,
}

function notifKey(userId: string) {
  return `u:${userId}:notification_prefs`
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session?.user) {
    return NextResponse.json({ success: false, error: 'Não autenticado.' }, { status: 401 })
  }

  const isSelf   = session.user.id === params.id
  const isMaster = session.user.role === 'MASTER'

  if (!isSelf && !isMaster) {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  try {
    const user = await prisma.user.findUnique({
      where:  { id: params.id },
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, image: true },
    })

    if (!user) {
      return NextResponse.json({ success: false, error: 'Usuário não encontrado.' }, { status: 404 })
    }

    // Lê prefs de notificação do SystemSetting
    const setting = await prisma.systemSetting.findUnique({
      where: { key: notifKey(params.id) },
    })

    let notificationPrefs = NOTIF_DEFAULTS
    if (setting?.value) {
      try {
        notificationPrefs = { ...NOTIF_DEFAULTS, ...JSON.parse(setting.value) }
      } catch {
        // mantém padrão se JSON inválido
      }
    }

    return NextResponse.json({
      success: true,
      data: { ...user, notificationPrefs },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const session = await getServerAuthSession()
  if (!session?.user) {
    return NextResponse.json({ success: false, error: 'Não autenticado.' }, { status: 401 })
  }

  const isSelf   = session.user.id === params.id
  const isMaster = session.user.role === 'MASTER'

  if (!isSelf && !isMaster) {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  try {
    const body = await req.json() as {
      name?:              string
      phone?:             string
      notificationPrefs?: Record<string, boolean>
    }

    const { name, phone, notificationPrefs } = body

    // ── Atualiza dados pessoais no User ───────────────────────────────────

    if (name !== undefined || phone !== undefined) {
      if (name !== undefined && !String(name).trim()) {
        return NextResponse.json(
          { success: false, error: 'O nome não pode ser vazio.' },
          { status: 400 },
        )
      }

      await prisma.user.update({
        where: { id: params.id },
        data: {
          ...(name  !== undefined && { name:  String(name).trim() }),
          ...(phone !== undefined && { phone: String(phone).trim() || null }),
        },
      })
    }

    // ── Atualiza prefs de notificação no SystemSetting ────────────────────

    if (notificationPrefs !== undefined) {
      const key   = notifKey(params.id)
      const value = JSON.stringify({ ...NOTIF_DEFAULTS, ...notificationPrefs })

      const existing = await prisma.systemSetting.findUnique({ where: { key } })

      if (existing) {
        await prisma.systemSetting.update({
          where: { key },
          data:  { value, updatedByUserId: session.user.id },
        })
      } else {
        await prisma.systemSetting.create({
          data: {
            key,
            value,
            description:    `Preferências de notificação do usuário ${params.id}`,
            group:          'user_prefs',
            isPublic:       false,
            updatedByUserId: session.user.id,
          },
        })
      }
    }

    return NextResponse.json({ success: true, message: 'Perfil atualizado com sucesso.' })
  } catch (err) {
    return handlePrismaError(err)
  }
}
