// =============================================================================
// push/queue-push.ts — atalhos de push da Fila de Atendimento.
// Carrega os devices ativos do usuário, envia o push e DESATIVA tokens inválidos.
// Best-effort: nunca quebra o fluxo do servidor.
// =============================================================================

import { after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendToTokens, type PushMessage } from './fcm'
import { sendWebPushToUser, type WebPushPayload } from './web-push'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// iPhone/PWA: a Apple NÃO permite alarme contínuo nem pop-up sobre a tela
// bloqueada (isso é só app nativo/APNs). O melhor viável é REFORÇAR a
// notificação enquanto a chamada segue pendente — cada notificação toca o som
// do sistema e vibra na tela bloqueada. Cadência: 1 push a CADA 4s, até vencer
// o prazo cadastrado (acceptTimeoutSeconds), parando ao aceitar/recusar/expirar.
// (Obs.: em serverless, o reforço em 2º plano roda enquanto a função vive —
// prazos muito longos podem não completar todos os reforços.)
const REINFORCE_STEP_SECONDS = 4
const REINFORCE_SAFETY_CAP_SECONDS = 1800 // trava de segurança contra prazo mal configurado
function reinforceSchedule(maxSeconds: number): number[] {
  const limit = Math.min(Math.max(4, maxSeconds) - 1, REINFORCE_SAFETY_CAP_SECONDS)
  const out: number[] = []
  for (let t = REINFORCE_STEP_SECONDS; t <= limit; t += REINFORCE_STEP_SECONDS) out.push(t)
  return out
}
function repeatWebPush(userId: string, attendanceId: string, payload: WebPushPayload, maxSeconds: number): void {
  const schedule = reinforceSchedule(maxSeconds)
  const run = async () => {
    let prevMs = 0
    for (const atSec of schedule) {
      await sleep(atSec * 1000 - prevMs)
      prevMs = atSec * 1000
      const att = await prisma.sellerQueueAttendance.findUnique({ where: { id: attendanceId }, select: { status: true } }).catch(() => null)
      if (!att || att.status !== 'CALLED') return // aceitou/recusou/venceu → para
      await sendWebPushToUser(userId, payload).catch(() => {})
    }
  }
  try { after(run) } catch { /* fora de contexto de request (cron): sem reforço */ }
}

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
    url: '/vendedor-da-vez/minha-fila', // deep-link: abre direto a tela de decisão
    requireInteraction: 'true',         // a notificação não some sozinha
  }
  // Nativo (Android/iOS) via FCM + PWA/iPhone via Web Push.
  await Promise.all([
    pushToUser(userId, { title, body, ttlSeconds: Math.max(30, opts.timeoutSeconds), data }),
    sendWebPushToUser(userId, { title, body, data }).catch(() => ({ sent: 0 })),
  ])
  // iPhone: reforça o "buzz" repetindo a notificação até aceitar/recusar/expirar.
  repeatWebPush(userId, opts.attendanceId, { title, body, data }, opts.timeoutSeconds)
}
