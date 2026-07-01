// =============================================================================
// pendencies/reminders.ts — lembretes automáticos de pendência via PUSH.
// Reaproveita a mesma infra de push da fila (FCM Android + Web Push iPhone/PWA).
// Manda lembrete ao COLABORADOR RESPONSÁVEL na cadência configurada (por hora /
// dia / semana), dentro da janela (dias/horário) e até a pendência ser baixada
// (status sai de "aberto") ou atingir o máximo de envios. Disparado por cron.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { sendToTokens } from '@/lib/push/fcm'
import { sendWebPushToUser } from '@/lib/push/web-push'
import type { PendencyStatus } from '@prisma/client'

const OPEN: PendencyStatus[] = ['ABERTA', 'EM_ANDAMENTO', 'AGUARDANDO_RESPOSTA', 'PAUSADA', 'REATIVADA', 'VENCIDA']
const FREQ_MS: Record<string, number> = { HOURLY: 3_600_000, DAILY: 86_400_000, WEEKLY: 7 * 86_400_000 }
const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

interface AutoSend { enabled: boolean; allowedDays: string[]; startTime: string; endTime: string; frequency: string; maxSends: number; sendsPerDay: number }
const DEFAULT_AUTOSEND: AutoSend = { enabled: false, allowedDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], startTime: '08:00', endTime: '18:00', frequency: 'DAILY', maxSends: 5, sendsPerDay: 3 }

/** Lê a config de auto-envio de pendências da loja (SystemSetting JSON). */
async function loadAutoSend(tenantId: string): Promise<AutoSend> {
  const row = await prisma.systemSetting.findFirst({ where: { key: `t:${tenantId}:pendency_settings` }, select: { value: true } }).catch(() => null)
  let raw: { autoSend?: Partial<AutoSend> } = {}
  try { if (row?.value) raw = JSON.parse(row.value) } catch { /* default */ }
  const a = raw.autoSend ?? {}
  return {
    enabled: a.enabled ?? DEFAULT_AUTOSEND.enabled,
    allowedDays: Array.isArray(a.allowedDays) && a.allowedDays.length ? a.allowedDays : DEFAULT_AUTOSEND.allowedDays,
    startTime: typeof a.startTime === 'string' ? a.startTime : DEFAULT_AUTOSEND.startTime,
    endTime: typeof a.endTime === 'string' ? a.endTime : DEFAULT_AUTOSEND.endTime,
    frequency: typeof a.frequency === 'string' ? a.frequency : DEFAULT_AUTOSEND.frequency,
    maxSends: typeof a.maxSends === 'number' ? a.maxSends : DEFAULT_AUTOSEND.maxSends,
    sendsPerDay: typeof a.sendsPerDay === 'number' ? a.sendsPerDay : DEFAULT_AUTOSEND.sendsPerDay,
  }
}

/** Hora/dia atuais em Brasília. */
function brtNow(): { wd: string; hhmm: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(new Date())
    const hh = parts.find((p) => p.type === 'hour')?.value ?? '00'
    const mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
    const wdShort = (parts.find((p) => p.type === 'weekday')?.value ?? 'Sun').toUpperCase().slice(0, 3)
    return { wd: WD.includes(wdShort) ? wdShort : 'SUN', hhmm: `${hh === '24' ? '00' : hh}:${mm}` }
  } catch { return { wd: 'MON', hhmm: '12:00' } }
}

function withinWindow(a: AutoSend): boolean {
  const { wd, hhmm } = brtNow()
  if (a.allowedDays.length && !a.allowedDays.includes(wd)) return false
  if (a.startTime && a.endTime) return a.startTime <= a.endTime ? (hhmm >= a.startTime && hhmm <= a.endTime) : (hhmm >= a.startTime || hhmm <= a.endTime)
  return true
}

/** responsibleId pode ser Seller.id (mapeia p/ userId) ou já um User.id. */
async function responsibleUserId(responsibleId: string): Promise<string | null> {
  const s = await prisma.seller.findUnique({ where: { id: responsibleId }, select: { userId: true } }).catch(() => null)
  if (s?.userId) return s.userId
  const u = await prisma.user.findUnique({ where: { id: responsibleId }, select: { id: true } }).catch(() => null)
  return u?.id ?? null
}

interface EscalatePendency { id: string; tenantId: string | null; unitId: string; managerId: string | null; customerName: string; plate: string | null; type: string | null }

/** Escala pro gerente: cobrança esgotada sem resolver. Avisa o gerente vinculado
 *  (ou, se não houver, os gerentes/ADM da unidade). Best-effort, uma vez. */
async function escalateToManager(p: EscalatePendency): Promise<void> {
  const targets = new Set<string>()
  if (p.managerId) {
    const m = await prisma.manager.findUnique({ where: { id: p.managerId }, select: { userId: true } }).catch(() => null)
    if (m?.userId) targets.add(m.userId)
  }
  if (targets.size === 0 && p.tenantId) {
    const gers = await prisma.user.findMany({ where: { tenantId: p.tenantId, unitId: p.unitId, role: { in: ['GERENTE', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'ADM'] }, status: 'ATIVO' }, select: { id: true }, take: 10 }).catch(() => [])
    gers.forEach((g) => targets.add(g.id))
  }
  if (targets.size === 0) return
  const title = '⚠️ Pendência não resolvida — cobrança esgotada'
  const message = `${p.type ? p.type + ': ' : ''}${p.customerName}${p.plate ? ' — ' + p.plate : ''} não foi resolvida após os lembretes. Confira.`
  for (const uid of targets) {
    await prisma.notification.create({ data: { userId: uid, type: 'PENDENCIA_CRITICA', title, message, actionUrl: '/pendencias/central' } }).catch(() => {})
  }
}

export interface ReminderRunResult { processed: number; sent: number; skipped: number }

/**
 * Processa todas as pendências com lembrete automático vencidas e dispara o push.
 * Idempotente (avança nextSendAt). Pode rodar por cron ou manualmente.
 */
export async function sendDuePendencyReminders(opts?: { tenantId?: string }): Promise<ReminderRunResult> {
  const now = new Date()
  const due = await prisma.pendency.findMany({
    where: {
      status: { in: OPEN }, automaticSend: true,
      OR: [{ nextSendAt: null }, { nextSendAt: { lte: now } }],
      ...(opts?.tenantId ? { tenantId: opts.tenantId } : {}),
    },
    take: 500,
    select: { id: true, tenantId: true, unitId: true, responsibleId: true, managerId: true, customerName: true, plate: true, description: true, type: true, priority: true, totalSent: true, maxSends: true, sendsPerDay: true, frequency: true },
  })

  const cfgCache = new Map<string, AutoSend>()
  let processed = 0, sent = 0, skipped = 0
  for (const p of due) {
    const tid = p.tenantId ?? ''
    let cfg = cfgCache.get(tid)
    if (!cfg) { cfg = await loadAutoSend(tid); cfgCache.set(tid, cfg) }
    // A pendência com "Lembrar" ligado (automaticSend) já basta — a config da
    // loja só define os PADRÕES de janela/frequência/máximo (não é interruptor
    // que desliga o lembrete individual). A janela de horário/dias é respeitada.

    const maxSends = p.maxSends ?? cfg.maxSends
    if (maxSends && p.totalSent >= maxSends) {
      // Esgotou os lembretes sem resolver → para de cobrar e ESCALA pro gerente.
      await prisma.pendency.update({ where: { id: p.id }, data: { automaticSend: false } }).catch(() => {})
      await escalateToManager(p).catch(() => {})
      skipped++; continue
    }
    // Fora da janela (dias/horário): adia ~30min sem enviar.
    if (!withinWindow(cfg)) {
      await prisma.pendency.update({ where: { id: p.id }, data: { nextSendAt: new Date(now.getTime() + 30 * 60_000) } }).catch(() => {})
      skipped++; continue
    }

    const freq = p.frequency || cfg.frequency || 'DAILY'
    const sendsPerDay = p.sendsPerDay ?? cfg.sendsPerDay ?? 0
    // Intervalo: respeita a frequência E o máx. de envios por dia.
    let interval = FREQ_MS[freq] ?? FREQ_MS.DAILY
    if (sendsPerDay > 0) interval = Math.max(interval, Math.floor(86_400_000 / sendsPerDay))

    // CLAIM atômico: avança nextSendAt + conta o envio ANTES de mandar. Se dois
    // disparos (cron + pinger) competirem, só um "ganha" (count===1) e envia.
    const claim = await prisma.pendency.updateMany({
      where: { id: p.id, automaticSend: true, OR: [{ nextSendAt: null }, { nextSendAt: { lte: now } }] },
      data: { nextSendAt: new Date(now.getTime() + interval), lastSentAt: now, totalSent: { increment: 1 } },
    }).catch(() => ({ count: 0 }))
    if (claim.count !== 1) { skipped++; continue }

    const userId = await responsibleUserId(p.responsibleId)
    if (userId) {
      const devs = await prisma.mobileDevice.findMany({ where: { userId, isActive: true, platform: { in: ['ANDROID', 'IOS'] } }, select: { deviceToken: true } })
      const tipo = p.type || 'Pendência'
      const title = `🔔 ${tipo} pendente`
      const body = `${p.customerName ? p.customerName + ' — ' : ''}${p.description || 'Você tem uma pendência para resolver.'}`
      const data = { type: 'PENDENCY', pendencyId: p.id, url: '/pendencias/minhas' }
      const [fcm, web] = await Promise.all([
        sendToTokens(devs.map((d) => d.deviceToken), { title, body, ttlSeconds: 3600, data, notification: true }).catch(() => ({ sent: 0, invalid: [] as string[] })),
        sendWebPushToUser(userId, { title, body, data }).catch(() => ({ sent: 0 })),
      ])
      sent += fcm.sent + web.sent
    }
    processed++
  }
  return { processed, sent, skipped }
}

/**
 * Envio MANUAL ("cobrar agora"): dispara o lembrete na hora para o responsável,
 * fora da régua/janela. Usado por um botão da gestão. Registra o envio.
 */
export async function sendPendencyReminderNow(pendencyId: string): Promise<{ ok: boolean; sent: number; reason?: string }> {
  const p = await prisma.pendency.findUnique({ where: { id: pendencyId }, select: { responsibleId: true, customerName: true, plate: true, type: true, description: true, status: true } })
  if (!p) return { ok: false, sent: 0, reason: 'Pendência não encontrada.' }
  if (!OPEN.includes(p.status)) return { ok: false, sent: 0, reason: 'A pendência não está aberta.' }
  const userId = await responsibleUserId(p.responsibleId)
  if (!userId) return { ok: false, sent: 0, reason: 'Sem responsável definido.' }
  const devs = await prisma.mobileDevice.findMany({ where: { userId, isActive: true, platform: { in: ['ANDROID', 'IOS'] } }, select: { deviceToken: true } })
  const tipo = p.type || 'Pendência'
  const title = `🔔 ${tipo} pendente`
  const body = `${p.plate ? p.plate + ' — ' : ''}${p.customerName || ''}${p.description ? ': ' + p.description : ''}`.trim() || 'Você tem uma pendência para resolver.'
  const data = { type: 'PENDENCY', pendencyId, url: '/pendencias/central' }
  const [fcm, web] = await Promise.all([
    sendToTokens(devs.map((d) => d.deviceToken), { title, body, ttlSeconds: 3600, data, notification: true }).catch(() => ({ sent: 0, invalid: [] as string[] })),
    sendWebPushToUser(userId, { title, body, data }).catch(() => ({ sent: 0 })),
  ])
  await prisma.pendency.update({ where: { id: pendencyId }, data: { lastSentAt: new Date(), totalSent: { increment: 1 } } }).catch(() => {})
  return { ok: true, sent: fcm.sent + web.sent }
}
