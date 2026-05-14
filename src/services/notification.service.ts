// =============================================================================
// Notification Service — AutoDrive
//
// Serviço centralizado para criação e envio de notificações em todos os canais:
//   • APP_WEB   — persiste no banco (tabela Notification) → polling/SSE
//   • WHATSAPP  — delega ao meta-whatsapp.service
//   • EMAIL     — placeholder (implementar com nodemailer quando necessário)
//   • APP_MOBILE / PUSH — placeholder para FCM futuro
//
// Uso:
//   await NotificationService.notify({
//     userId:   'abc',
//     tenantId: 'xyz',
//     type:     'NOVA_PENDENCIA',
//     title:    'Nova pendência criada',
//     message:  'O vendedor João criou uma pendência urgente',
//     actionUrl: '/pendencias/central',
//     channels: ['APP_WEB', 'WHATSAPP'],
//   })
// =============================================================================

import { prisma } from '@/lib/prisma'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type NotifyChannel = 'APP_WEB' | 'APP_MOBILE' | 'WHATSAPP' | 'EMAIL' | 'PUSH'

export interface NotifyPayload {
  userId:    string
  tenantId?: string | null
  type:      string          // NotificationType enum value
  title:     string
  message:   string
  actionUrl?: string | null
  metadata?: Record<string, unknown>
  channels?: NotifyChannel[] // padrão: ['APP_WEB']
}

export interface BulkNotifyPayload extends Omit<NotifyPayload, 'userId'> {
  userIds: string[]
}

// ── Helpers internos ──────────────────────────────────────────────────────────

async function createWebNotification(payload: NotifyPayload): Promise<string | null> {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId:    payload.userId,
        tenantId:  payload.tenantId,
        type:      payload.type as never,
        title:     payload.title,
        message:   payload.message,
        actionUrl: payload.actionUrl,
        metadata:  payload.metadata as never ?? undefined,
      },
    })

    await prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        userId:         payload.userId,
        channel:        'APP_WEB',
        status:         'ENVIADO',
        sentAt:         new Date(),
      },
    })

    return notification.id
  } catch (err) {
    console.error('[NotificationService] createWebNotification error', err)
    return null
  }
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Envia notificação para um único usuário nos canais especificados.
 */
export async function notify(payload: NotifyPayload): Promise<void> {
  const channels = payload.channels ?? ['APP_WEB']

  await Promise.all(
    channels.map(async (ch) => {
      switch (ch) {
        case 'APP_WEB':
          await createWebNotification(payload)
          break

        case 'WHATSAPP':
          // Delegado ao serviço de WhatsApp existente quando integrado
          // TODO: buscar whatsapp do usuário e chamar meta-whatsapp.service
          break

        case 'EMAIL':
          // TODO: nodemailer / SMTP
          break

        case 'APP_MOBILE':
        case 'PUSH':
          // TODO: FCM via MobileDevice tokens
          break
      }
    }),
  )
}

/**
 * Envia notificação para múltiplos usuários de uma vez.
 */
export async function notifyMany(payload: BulkNotifyPayload): Promise<void> {
  const { userIds, ...rest } = payload
  await Promise.all(userIds.map((userId) => notify({ ...rest, userId })))
}

/**
 * Envia notificação para todos os usuários de um tenant com determinadas roles.
 */
export async function notifyByRole(params: {
  tenantId: string
  roles:     string[]
  unitId?:   string
  type:      string
  title:     string
  message:   string
  actionUrl?: string | null
  metadata?:  Record<string, unknown>
  channels?:  NotifyChannel[]
}): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      tenantId: params.tenantId,
      role:     { in: params.roles as never[] },
      status:   'ATIVO',
      ...(params.unitId ? { unitId: params.unitId } : {}),
    },
    select: { id: true },
  })

  if (!users.length) return

  await notifyMany({
    userIds:   users.map((u) => u.id),
    tenantId:  params.tenantId,
    type:      params.type,
    title:     params.title,
    message:   params.message,
    actionUrl: params.actionUrl,
    metadata:  params.metadata,
    channels:  params.channels,
  })
}

/**
 * Notifica sobre uma pendência nova ou atualizada.
 * Automaticamente determina quem notificar com base no role do usuário responsável.
 */
export async function notifyPendency(params: {
  pendencyId:   string
  tenantId:     string
  unitId:       string
  type:         string  // NOVA_PENDENCIA | PENDENCIA_CRITICA | ESCALONAMENTO | etc.
  title:        string
  message:      string
  actionUrl?:   string
  notifyRoles?: string[]
}): Promise<void> {
  const roles = params.notifyRoles ?? ['GERENTE', 'GERENTE_GERAL', 'ADM']

  await notifyByRole({
    tenantId:  params.tenantId,
    roles,
    unitId:    params.unitId,
    type:      params.type,
    title:     params.title,
    message:   params.message,
    actionUrl: params.actionUrl ?? `/pendencias/central`,
    metadata:  { pendencyId: params.pendencyId },
    channels:  ['APP_WEB'],
  })
}

// Re-export namespace style for backwards-compat
export const NotificationService = { notify, notifyMany, notifyByRole, notifyPendency }
export default NotificationService
