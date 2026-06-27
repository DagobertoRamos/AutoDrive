// =============================================================================
// push/queue-push.ts — atalhos de push da Fila de Atendimento.
// Carrega os devices ativos do usuário, envia o push e DESATIVA tokens inválidos.
// Best-effort: nunca quebra o fluxo do servidor.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { sendToTokens, type PushMessage } from './fcm'
import { sendWebPushToUser } from './web-push'

/** Envia um push FCM para os aparelhos NATIVOS ativos do usuário (Android/iOS). */
export async function pushToUser(userId: string, msg: PushMessage): Promise<void> {
  try {
    const devices = await prisma.mobileDevice.findMany({ where: { userId, isActive: true, platform: { in: ['ANDROID', 'IOS'] } }, select: { deviceToken: true } })
    if (!devices.length) return
    const { invalid } = await sendToTokens(devices.map((d) => d.deviceToken), msg)
    if (invalid.length) {
      await prisma.mobileDevice.updateMany({ where: { deviceToken: { in: invalid } }, data: { isActive: false, revokedAt: new Date() } }).catch(() => {})
    }
  } catch (err) {
    console.error('[queue-push] falhou:', err)
  }
}

/** Push de CHAMADA do vendedor da vez (estilo Uber/99 — o app mostra full-screen). */
export async function pushQueueCall(opts: { sellerId: string; attendanceId: string; customerName?: string | null; timeoutSeconds: number }): Promise<void> {
  // sellerId é o id do Seller; o aparelho é registrado pelo userId — resolver.
  // Fallback: se não houver Seller com esse id, talvez já seja o próprio userId.
  const seller = await prisma.seller.findUnique({ where: { id: opts.sellerId }, select: { userId: true } })
  const userId = seller?.userId ?? opts.sellerId
  const title = 'Você é o vendedor da vez 🔔'
  const body = opts.customerName?.trim() ? `Cliente: ${opts.customerName.trim()} — aceite ou recuse.` : 'Cliente presencial aguardando — aceite ou recuse.'
  const data = {
    type: 'QUEUE_CALL',
    attendanceId: opts.attendanceId,
    customerName: opts.customerName?.trim() ?? '',
    timeoutSeconds: String(opts.timeoutSeconds),
  }
  // Nativo (Android/iOS) via FCM + PWA/iPhone via Web Push.
  await Promise.all([
    pushToUser(userId, { title, body, ttlSeconds: Math.max(30, opts.timeoutSeconds), data }),
    sendWebPushToUser(userId, { title, body, data }).catch(() => ({ sent: 0 })),
  ])
}
