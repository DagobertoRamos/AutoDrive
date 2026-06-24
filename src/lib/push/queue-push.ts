// =============================================================================
// push/queue-push.ts — atalhos de push da Fila de Atendimento.
// Carrega os devices ativos do usuário, envia o push e DESATIVA tokens inválidos.
// Best-effort: nunca quebra o fluxo do servidor.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { sendToTokens, type PushMessage } from './fcm'

/** Envia um push para todos os aparelhos ativos do usuário. */
export async function pushToUser(userId: string, msg: PushMessage): Promise<void> {
  try {
    const devices = await prisma.mobileDevice.findMany({ where: { userId, isActive: true }, select: { deviceToken: true } })
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
  await pushToUser(opts.sellerId, {
    title: 'Você é o vendedor da vez 🔔',
    body: opts.customerName?.trim() ? `Cliente: ${opts.customerName.trim()} — aceite ou recuse.` : 'Cliente presencial aguardando — aceite ou recuse.',
    ttlSeconds: Math.max(30, opts.timeoutSeconds),
    data: {
      type: 'QUEUE_CALL',
      attendanceId: opts.attendanceId,
      customerName: opts.customerName?.trim() ?? '',
      timeoutSeconds: String(opts.timeoutSeconds),
    },
  })
}
