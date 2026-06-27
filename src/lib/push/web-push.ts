// =============================================================================
// push/web-push.ts — envio de Web Push (PWA / iPhone) via VAPID. As inscrições
// ficam em MobileDevice com platform='WEBPUSH' e deviceToken = JSON da
// subscription. Best-effort; remove inscrições expiradas (404/410).
// =============================================================================

import webpush from 'web-push'
import { prisma } from '@/lib/prisma'

let configured = false
function ensure(): boolean {
  if (configured) return true
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:contato@autodrive.app'
  if (!pub || !priv) return false
  try { webpush.setVapidDetails(subject, pub, priv); configured = true } catch { return false }
  return configured
}

export function webPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

export interface WebPushPayload { title: string; body: string; data?: Record<string, string> }

export async function sendWebPushToUser(userId: string, payload: WebPushPayload): Promise<{ sent: number }> {
  if (!ensure()) return { sent: 0 }
  const subs = await prisma.mobileDevice.findMany({
    where: { userId, isActive: true, platform: 'WEBPUSH' },
    select: { deviceToken: true },
  })
  let sent = 0
  await Promise.all(subs.map(async (s) => {
    try {
      const subscription = JSON.parse(s.deviceToken)
      // urgency 'high' = entrega IMEDIATA mesmo com o iPhone bloqueado/ocioso
      // (sem isso o iOS adia a entrega e não toca/vibra na tela bloqueada).
      await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60, urgency: 'high' })
      sent++
    } catch (err: unknown) {
      const code = (err as { statusCode?: number })?.statusCode
      if (code === 404 || code === 410) {
        await prisma.mobileDevice.updateMany({ where: { deviceToken: s.deviceToken }, data: { isActive: false, revokedAt: new Date() } }).catch(() => {})
      }
    }
  }))
  return { sent }
}
