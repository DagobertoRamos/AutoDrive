// =============================================================================
// push/notification-push.ts — envio genérico de notificações comuns.
// Mantém o fluxo QUEUE_CALL separado: avisos comuns nunca usam tela cheia,
// alarme contínuo ou ações Aceitar/Recusar.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { fcmConfigured, sendToTokens } from './fcm'
import { sendWebPushToUser, webPushConfigured } from './web-push'

export type GenericPushPriority = 'LOW' | 'NORMAL' | 'HIGH'
export type GenericPushChannel = 'APP_MOBILE' | 'PUSH'

export interface GenericPushPayload {
  userId: string
  notificationId?: string | null
  type: string
  title: string
  body: string
  url?: string | null
  entityType?: string | null
  entityId?: string | null
  priority?: GenericPushPriority
  data?: Record<string, string>
}

export interface GenericPushResult {
  sent: number
  skipped: boolean
  reason?: string
}

function cleanData(payload: GenericPushPayload): Record<string, string> {
  const out: Record<string, string> = {
    type: payload.type || 'NOTIFICATION',
    title: payload.title,
    body: payload.body,
    url: payload.url || '/dashboard',
    priority: payload.priority || 'NORMAL',
    ...(payload.data ?? {}),
  }
  if (payload.notificationId) out.notificationId = payload.notificationId
  if (payload.entityType) out.entityType = payload.entityType
  if (payload.entityId) out.entityId = payload.entityId
  return out
}

async function recordDelivery(
  notificationId: string | null | undefined,
  userId: string,
  channel: GenericPushChannel,
  status: 'ENVIADO' | 'ERRO' | 'CANCELADO',
  errorMessage?: string,
): Promise<void> {
  if (!notificationId) return
  await prisma.notificationDelivery.create({
    data: {
      notificationId,
      userId,
      channel,
      status,
      sentAt: status === 'ENVIADO' ? new Date() : null,
      errorMessage: errorMessage ?? null,
    },
  }).catch(() => {})
}

export async function sendGenericNativePush(payload: GenericPushPayload): Promise<GenericPushResult> {
  try {
    if (!fcmConfigured()) {
      const reason = 'FCM não configurado no servidor.'
      await recordDelivery(payload.notificationId, payload.userId, 'APP_MOBILE', 'CANCELADO', reason)
      return { sent: 0, skipped: true, reason }
    }

    const devices = await prisma.mobileDevice.findMany({
      where: { userId: payload.userId, isActive: true, platform: { in: ['ANDROID', 'IOS'] } },
      select: { deviceToken: true },
    })

    if (!devices.length) {
      const reason = 'Sem token FCM ativo para este usuário.'
      await recordDelivery(payload.notificationId, payload.userId, 'APP_MOBILE', 'CANCELADO', reason)
      return { sent: 0, skipped: true, reason }
    }

    const { sent, invalid } = await sendToTokens(devices.map((d) => d.deviceToken), {
      title: payload.title,
      body: payload.body,
      ttlSeconds: payload.priority === 'HIGH' ? 300 : 1800,
      data: cleanData(payload),
    })

    if (invalid.length) {
      await prisma.mobileDevice.updateMany({
        where: { deviceToken: { in: invalid } },
        data: { isActive: false, revokedAt: new Date() },
      }).catch(() => {})
    }

    if (sent > 0) {
      await recordDelivery(payload.notificationId, payload.userId, 'APP_MOBILE', 'ENVIADO')
      return { sent, skipped: false }
    }

    const reason = 'FCM não aceitou nenhum token ativo.'
    await recordDelivery(payload.notificationId, payload.userId, 'APP_MOBILE', 'ERRO', reason)
    return { sent: 0, skipped: false, reason }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await recordDelivery(payload.notificationId, payload.userId, 'APP_MOBILE', 'ERRO', reason)
    return { sent: 0, skipped: false, reason }
  }
}

export async function sendGenericWebPush(payload: GenericPushPayload): Promise<GenericPushResult> {
  try {
    if (!webPushConfigured()) {
      const reason = 'VAPID não configurado no servidor.'
      await recordDelivery(payload.notificationId, payload.userId, 'PUSH', 'CANCELADO', reason)
      return { sent: 0, skipped: true, reason }
    }

    const subscriptions = await prisma.mobileDevice.count({
      where: { userId: payload.userId, isActive: true, platform: 'WEBPUSH' },
    })

    if (!subscriptions) {
      const reason = 'Sem inscrição Web Push ativa para este usuário.'
      await recordDelivery(payload.notificationId, payload.userId, 'PUSH', 'CANCELADO', reason)
      return { sent: 0, skipped: true, reason }
    }

    const { sent } = await sendWebPushToUser(payload.userId, {
      title: payload.title,
      body: payload.body,
      data: cleanData(payload),
    })

    if (sent > 0) {
      await recordDelivery(payload.notificationId, payload.userId, 'PUSH', 'ENVIADO')
      return { sent, skipped: false }
    }

    const reason = 'Web Push configurado, mas nenhuma inscrição foi entregue.'
    await recordDelivery(payload.notificationId, payload.userId, 'PUSH', 'ERRO', reason)
    return { sent: 0, skipped: false, reason }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await recordDelivery(payload.notificationId, payload.userId, 'PUSH', 'ERRO', reason)
    return { sent: 0, skipped: false, reason }
  }
}

export async function sendGenericPush(
  payload: GenericPushPayload,
  channels: GenericPushChannel[],
): Promise<{ native?: GenericPushResult; web?: GenericPushResult }> {
  const unique = [...new Set(channels)]
  const [native, web] = await Promise.all([
    unique.includes('APP_MOBILE') ? sendGenericNativePush(payload) : Promise.resolve(undefined),
    unique.includes('PUSH') ? sendGenericWebPush(payload) : Promise.resolve(undefined),
  ])
  return { native, web }
}
