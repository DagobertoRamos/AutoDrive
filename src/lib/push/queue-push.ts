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
// notificação de tempos em tempos enquanto a chamada segue pendente — cada
// notificação toca o som do sistema e vibra na tela bloqueada, aproximando o
// "fica tocando". Cadência ~10s (persistente, mas não spam de 2-3s, que o iOS
// coalesce e penaliza). Para sozinho ao aceitar/recusar/expirar. Roda em 2º plano.
const REINFORCE_STEP_SECONDS = 10
const REINFORCE_MAX_SECONDS = 120 // teto de reforços (depois disso o escalonamento assume)
function reinforceSchedule(maxSeconds: number): number[] {
  const limit = Math.min(Math.max(5, maxSeconds) - 2, REINFORCE_MAX_SECONDS)
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
