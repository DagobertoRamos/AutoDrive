import { prisma } from '@/lib/prisma'
import { notify, notifyByRole, type NotifyChannel } from '@/services/notification.service'
import type { Prisma } from '@prisma/client'

export const REMINDER_SENT = 'ATTENDANCE_REMINDER_SENT'
export const REMINDER_ACK = 'ATTENDANCE_STILL_ACTIVE_CONFIRMED'
export const REMINDER_FINISH_REQUESTED = 'ATTENDANCE_FINISH_REQUESTED_FROM_REMINDER'
export const REMINDER_ESCALATED = 'ATTENDANCE_REMINDER_MANAGER_ESCALATED'
export const REMINDER_SKIPPED = 'ATTENDANCE_REMINDER_SKIPPED'
export const QUEUE_ALERT_SENT = 'QUEUE_PUSH_ALERT_SENT'

const OPEN_ATTENDANCE_STATUSES = ['ACCEPTED', 'IN_ATTENDANCE']
const MANAGER_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER']

export type QueuePushTargetScope =
  | 'CURRENT_SELLER'
  | 'CALLED_SELLER'
  | 'ALL_ACTIVE_PARTICIPANTS'
  | 'MANAGERS'
  | 'MANAGERS_AND_CURRENT'
  | 'ALL_QUEUE'

export interface AttendanceReminderSettings {
  enabled: boolean
  firstAfterMinutes: number
  repeatIntervalSeconds: number
  maxReminders: number
  escalateAfter: number
  autoEscalate: boolean
  requireFinishOnNo: boolean
  allowSnooze: boolean
  logEveryReminder: boolean
}

export interface QueuePushSettings {
  enabled: boolean
  intervalSeconds: number
  targetScope: QueuePushTargetScope
  maxRetries: number
  resendUntil: 'ACKNOWLEDGED' | 'FINISHED' | 'MAX_RETRIES'
  antiSpamUserLimit: number
  antiSpamAttendanceLimit: number
  antiSpamQueueLimit: number
  antiSpamWindowMinutes: number
  allowedStartTime: string | null
  allowedEndTime: string | null
  allowOutsideHoursForAdmins: boolean
  urgency: 'NORMAL' | 'HIGH'
  sound: boolean
}

export interface SellerQueueReminderSettings {
  attendanceReminder: AttendanceReminderSettings
  queuePush: QueuePushSettings
}

export interface ReminderState {
  attendanceId: string
  reminderCount: number
  lastReminderAt: Date | null
  lastAcknowledgedAt: Date | null
  finishRequestedAt: Date | null
  escalatedAt: Date | null
  awaitingResponse: boolean
  nextReminderAt: Date | null
}

export interface AttendanceReminderPayload {
  id: string
  sellerId: string
  sellerName: string
  status: string
  calledAt: Date
  acceptedAt: Date | null
  startedAt: Date | null
  customerName: string | null
  customerPhone: string | null
  reminderState: ReminderState
}

interface AttendanceTiming {
  id: string
  status: string
  calledAt: Date
  acceptedAt: Date | null
  startedAt?: Date | null
}

export const DEFAULT_REMINDER_SETTINGS: SellerQueueReminderSettings = {
  attendanceReminder: {
    enabled: true,
    firstAfterMinutes: 15,
    repeatIntervalSeconds: 300,
    maxReminders: 6,
    escalateAfter: 3,
    autoEscalate: true,
    requireFinishOnNo: true,
    allowSnooze: false,
    logEveryReminder: true,
  },
  queuePush: {
    enabled: true,
    intervalSeconds: 300,
    targetScope: 'CURRENT_SELLER',
    maxRetries: 6,
    resendUntil: 'ACKNOWLEDGED',
    antiSpamUserLimit: 8,
    antiSpamAttendanceLimit: 6,
    antiSpamQueueLimit: 60,
    antiSpamWindowMinutes: 10,
    allowedStartTime: null,
    allowedEndTime: null,
    allowOutsideHoursForAdmins: true,
    urgency: 'HIGH',
    sound: true,
  },
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function str<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback
}

function timeOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return /^\d{2}:\d{2}$/.test(value) ? value : null
}

export function coerceReminderSettings(config: unknown): SellerQueueReminderSettings {
  const root = obj(config)
  const reminder = obj(root.attendanceReminder)
  const push = obj(root.queuePush)
  const defaults = DEFAULT_REMINDER_SETTINGS

  return {
    attendanceReminder: {
      enabled: bool(reminder.enabled, defaults.attendanceReminder.enabled),
      firstAfterMinutes: int(reminder.firstAfterMinutes, defaults.attendanceReminder.firstAfterMinutes, 1, 480),
      repeatIntervalSeconds: int(reminder.repeatIntervalSeconds, defaults.attendanceReminder.repeatIntervalSeconds, 30, 86400),
      maxReminders: int(reminder.maxReminders, defaults.attendanceReminder.maxReminders, 1, 50),
      escalateAfter: int(reminder.escalateAfter, defaults.attendanceReminder.escalateAfter, 1, 50),
      autoEscalate: bool(reminder.autoEscalate, defaults.attendanceReminder.autoEscalate),
      requireFinishOnNo: bool(reminder.requireFinishOnNo, defaults.attendanceReminder.requireFinishOnNo),
      allowSnooze: bool(reminder.allowSnooze, defaults.attendanceReminder.allowSnooze),
      logEveryReminder: bool(reminder.logEveryReminder, defaults.attendanceReminder.logEveryReminder),
    },
    queuePush: {
      enabled: bool(push.enabled, defaults.queuePush.enabled),
      intervalSeconds: int(push.intervalSeconds, defaults.queuePush.intervalSeconds, 30, 86400),
      targetScope: str(push.targetScope, ['CURRENT_SELLER', 'CALLED_SELLER', 'ALL_ACTIVE_PARTICIPANTS', 'MANAGERS', 'MANAGERS_AND_CURRENT', 'ALL_QUEUE'] as const, defaults.queuePush.targetScope),
      maxRetries: int(push.maxRetries, defaults.queuePush.maxRetries, 1, 50),
      resendUntil: str(push.resendUntil, ['ACKNOWLEDGED', 'FINISHED', 'MAX_RETRIES'] as const, defaults.queuePush.resendUntil),
      antiSpamUserLimit: int(push.antiSpamUserLimit, defaults.queuePush.antiSpamUserLimit, 1, 100),
      antiSpamAttendanceLimit: int(push.antiSpamAttendanceLimit, defaults.queuePush.antiSpamAttendanceLimit, 1, 100),
      antiSpamQueueLimit: int(push.antiSpamQueueLimit, defaults.queuePush.antiSpamQueueLimit, 1, 500),
      antiSpamWindowMinutes: int(push.antiSpamWindowMinutes, defaults.queuePush.antiSpamWindowMinutes, 1, 1440),
      allowedStartTime: timeOrNull(push.allowedStartTime),
      allowedEndTime: timeOrNull(push.allowedEndTime),
      allowOutsideHoursForAdmins: bool(push.allowOutsideHoursForAdmins, defaults.queuePush.allowOutsideHoursForAdmins),
      urgency: str(push.urgency, ['NORMAL', 'HIGH'] as const, defaults.queuePush.urgency),
      sound: bool(push.sound, defaults.queuePush.sound),
    },
  }
}

export function buildReminderState(attendanceId: string, logs: Array<{ action: string; createdAt: Date }>, settings = DEFAULT_REMINDER_SETTINGS): ReminderState {
  let reminderCount = 0
  let lastReminderAt: Date | null = null
  let lastAcknowledgedAt: Date | null = null
  let finishRequestedAt: Date | null = null
  let escalatedAt: Date | null = null

  for (const log of logs) {
    if (log.action === REMINDER_SENT) {
      reminderCount += 1
      if (!lastReminderAt || log.createdAt > lastReminderAt) lastReminderAt = log.createdAt
    }
    if (log.action === REMINDER_ACK && (!lastAcknowledgedAt || log.createdAt > lastAcknowledgedAt)) lastAcknowledgedAt = log.createdAt
    if (log.action === REMINDER_FINISH_REQUESTED && (!finishRequestedAt || log.createdAt > finishRequestedAt)) finishRequestedAt = log.createdAt
    if (log.action === REMINDER_ESCALATED && (!escalatedAt || log.createdAt > escalatedAt)) escalatedAt = log.createdAt
  }

  const lastResponseAt = [lastAcknowledgedAt, finishRequestedAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null
  const awaitingResponse = Boolean(lastReminderAt && (!lastResponseAt || lastResponseAt < lastReminderAt))
  const basis = lastResponseAt && (!lastReminderAt || lastResponseAt > lastReminderAt) ? lastResponseAt : lastReminderAt
  const nextReminderAt = basis ? new Date(basis.getTime() + settings.attendanceReminder.repeatIntervalSeconds * 1000) : null

  return { attendanceId, reminderCount, lastReminderAt, lastAcknowledgedAt, finishRequestedAt, escalatedAt, awaitingResponse, nextReminderAt }
}

export function isReminderDue(attendance: AttendanceTiming, state: ReminderState, settings: SellerQueueReminderSettings, now = new Date()): boolean {
  if (!settings.attendanceReminder.enabled) return false
  if (!OPEN_ATTENDANCE_STATUSES.includes(attendance.status)) return false
  if (state.reminderCount >= settings.attendanceReminder.maxReminders) return false
  if (state.awaitingResponse) return true

  const start = attendance.startedAt ?? attendance.acceptedAt ?? attendance.calledAt
  const firstAt = new Date(start.getTime() + settings.attendanceReminder.firstAfterMinutes * 60000)
  if (!state.lastReminderAt && now >= firstAt) return true
  const lastResponseAt = [state.lastAcknowledgedAt, state.finishRequestedAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null
  const basis = lastResponseAt && (!state.lastReminderAt || lastResponseAt > state.lastReminderAt) ? lastResponseAt : state.lastReminderAt
  if (!basis) return false
  return now >= new Date(basis.getTime() + settings.attendanceReminder.repeatIntervalSeconds * 1000)
}

async function loadReminderStates(attendanceIds: string[], settings: SellerQueueReminderSettings): Promise<Map<string, ReminderState>> {
  const map = new Map<string, ReminderState>()
  if (!attendanceIds.length) return map
  const logs = await prisma.auditLog.findMany({
    where: {
      entity: 'SellerQueueAttendance',
      entityId: { in: attendanceIds },
      action: { in: [REMINDER_SENT, REMINDER_ACK, REMINDER_FINISH_REQUESTED, REMINDER_ESCALATED] },
    },
    select: { action: true, entityId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  for (const id of attendanceIds) {
    map.set(id, buildReminderState(id, logs.filter((l) => l.entityId === id), settings))
  }
  return map
}

async function audit(action: string, data: {
  tenantId: string
  userId?: string | null
  userName?: string | null
  userRole?: string | null
  entity: string
  entityId?: string | null
  afterData?: Record<string, unknown>
}) {
  await prisma.auditLog.create({
    data: {
      tenantId: data.tenantId,
      userId: data.userId ?? null,
      userName: data.userName ?? null,
      userRole: data.userRole ?? null,
      action,
      entity: data.entity,
      entityId: data.entityId ?? null,
      afterData: data.afterData as Prisma.InputJsonValue,
    },
  }).catch(() => {})
}

function channelList(settings: SellerQueueReminderSettings): NotifyChannel[] {
  return settings.queuePush.enabled ? ['APP_WEB', 'APP_MOBILE', 'PUSH'] : ['APP_WEB']
}

function isInsideAllowedPushTime(settings: SellerQueueReminderSettings, now = new Date()): boolean {
  const start = settings.queuePush.allowedStartTime
  const end = settings.queuePush.allowedEndTime
  if (!start || !end) return true
  const current = now.getHours() * 60 + now.getMinutes()
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const s = sh * 60 + sm
  const e = eh * 60 + em
  return s <= e ? current >= s && current <= e : current >= s || current <= e
}

async function antiSpamAllows(att: { tenantId: string; unitId: string; queueId: string; sellerId: string; id: string }, settings: SellerQueueReminderSettings, now = new Date()): Promise<{ ok: true } | { ok: false; reason: string }> {
  const since = new Date(now.getTime() - settings.queuePush.antiSpamWindowMinutes * 60000)
  const logs = await prisma.auditLog.findMany({
    where: {
      tenantId: att.tenantId,
      action: { in: [REMINDER_SENT, QUEUE_ALERT_SENT] },
      createdAt: { gte: since },
    },
    select: { entityId: true, afterData: true },
    take: 1000,
  })
  const recent = logs.map((l) => ({ entityId: l.entityId, data: obj(l.afterData) }))
  const byUser = recent.filter((l) => l.data.sellerId === att.sellerId || l.data.targetUserId === att.sellerId).length
  const byAttendance = recent.filter((l) => l.entityId === att.id).length
  const byQueue = recent.filter((l) => l.data.queueId === att.queueId || l.data.unitId === att.unitId).length
  if (byUser >= settings.queuePush.antiSpamUserLimit) return { ok: false, reason: 'Limite por vendedor atingido.' }
  if (byAttendance >= settings.queuePush.antiSpamAttendanceLimit) return { ok: false, reason: 'Limite por atendimento atingido.' }
  if (byQueue >= settings.queuePush.antiSpamQueueLimit) return { ok: false, reason: 'Limite da fila atingido.' }
  return { ok: true }
}

async function sendReminderNotification(att: {
  tenantId: string
  unitId: string
  queueId: string
  id: string
  sellerId: string
  arrival?: { customerName: string | null } | null
}, sellerName: string, settings: SellerQueueReminderSettings, manual: boolean, actorId?: string | null) {
  const customer = att.arrival?.customerName?.trim()
  await notify({
    userId: att.sellerId,
    tenantId: att.tenantId,
    type: 'SISTEMA',
    title: 'Você ainda está em atendimento?',
    message: customer ? `Confirme se o atendimento de ${customer} continua em andamento.` : 'Confirme se este atendimento continua em andamento.',
    actionUrl: '/vendedor-da-vez',
    metadata: {
      kind: 'seller_queue_attendance_reminder',
      attendanceId: att.id,
      unitId: att.unitId,
      queueId: att.queueId,
      sellerId: att.sellerId,
      manual,
      pushType: 'QUEUE_ATTENDANCE_REMINDER',
      entityType: 'SellerQueueAttendance',
      entityId: att.id,
      priority: settings.queuePush.urgency === 'HIGH' ? 'high' : 'normal',
      pushData: { kind: 'seller_queue_attendance_reminder', attendanceId: att.id },
    },
    channels: channelList(settings),
  }).catch(() => {})
  await audit(REMINDER_SENT, {
    tenantId: att.tenantId,
    userId: actorId ?? null,
    entity: 'SellerQueueAttendance',
    entityId: att.id,
    afterData: { unitId: att.unitId, queueId: att.queueId, sellerId: att.sellerId, sellerName, manual },
  })
}

async function maybeEscalate(att: {
  tenantId: string
  unitId: string
  queueId: string
  id: string
  sellerId: string
}, sellerName: string, state: ReminderState, settings: SellerQueueReminderSettings, actorId?: string | null) {
  if (!settings.attendanceReminder.autoEscalate) return false
  const nextCount = state.reminderCount + 1
  if (nextCount < settings.attendanceReminder.escalateAfter) return false
  if (state.escalatedAt) return false

  await notifyByRole({
    tenantId: att.tenantId,
    unitId: att.unitId,
    roles: MANAGER_ROLES,
    type: 'SISTEMA',
    title: 'Atendimento sem confirmação',
    message: `${sellerName} recebeu ${nextCount} lembrete(s) de atendimento aberto sem confirmar.`,
    actionUrl: '/vendedor-da-vez',
    metadata: { kind: 'seller_queue_attendance_escalated', attendanceId: att.id, sellerId: att.sellerId, unitId: att.unitId },
    channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'],
  }).catch(() => {})
  await audit(REMINDER_ESCALATED, {
    tenantId: att.tenantId,
    userId: actorId ?? null,
    entity: 'SellerQueueAttendance',
    entityId: att.id,
    afterData: { unitId: att.unitId, queueId: att.queueId, sellerId: att.sellerId, sellerName, reminderCount: nextCount },
  })
  return true
}

export async function sendAttendanceReminderNow(attendanceId: string, opts: { tenantId: string; actorId?: string | null; manual?: boolean }) {
  const att = await prisma.sellerQueueAttendance.findFirst({
    where: { id: attendanceId, tenantId: opts.tenantId, status: { in: OPEN_ATTENDANCE_STATUSES } },
    include: { arrival: { select: { customerName: true } } },
  })
  if (!att) return { sent: false, error: 'Atendimento aberto não encontrado.' }
  const [cfg, seller] = await Promise.all([
    prisma.sellerQueueUnitConfig.findUnique({ where: { tenantId_unitId: { tenantId: att.tenantId, unitId: att.unitId } }, select: { config: true } }),
    prisma.user.findUnique({ where: { id: att.sellerId }, select: { name: true } }),
  ])
  const settings = coerceReminderSettings(cfg?.config)
  await sendReminderNotification(att, seller?.name ?? att.sellerId, settings, opts.manual ?? true, opts.actorId)
  return { sent: true }
}

export async function confirmAttendanceStillActive(attendanceId: string, opts: { tenantId: string; actorId: string; userName?: string | null; userRole?: string | null }) {
  const att = await prisma.sellerQueueAttendance.findFirst({ where: { id: attendanceId, tenantId: opts.tenantId } })
  if (!att) return { ok: false, error: 'Atendimento não encontrado.' }
  await audit(REMINDER_ACK, {
    tenantId: opts.tenantId,
    userId: opts.actorId,
    userName: opts.userName,
    userRole: opts.userRole,
    entity: 'SellerQueueAttendance',
    entityId: attendanceId,
    afterData: { unitId: att.unitId, queueId: att.queueId, sellerId: att.sellerId },
  })
  return { ok: true }
}

export async function requestAttendanceFinishFromReminder(attendanceId: string, opts: { tenantId: string; actorId: string; userName?: string | null; userRole?: string | null }) {
  const att = await prisma.sellerQueueAttendance.findFirst({ where: { id: attendanceId, tenantId: opts.tenantId } })
  if (!att) return { ok: false, error: 'Atendimento não encontrado.' }
  await audit(REMINDER_FINISH_REQUESTED, {
    tenantId: opts.tenantId,
    userId: opts.actorId,
    userName: opts.userName,
    userRole: opts.userRole,
    entity: 'SellerQueueAttendance',
    entityId: attendanceId,
    afterData: { unitId: att.unitId, queueId: att.queueId, sellerId: att.sellerId },
  })
  return { ok: true }
}

export async function processAttendanceReminders(opts: { tenantId?: string; unitId?: string; now?: Date } = {}) {
  const now = opts.now ?? new Date()
  const attendances = await prisma.sellerQueueAttendance.findMany({
    where: {
      ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
      ...(opts.unitId ? { unitId: opts.unitId } : {}),
      status: { in: OPEN_ATTENDANCE_STATUSES },
    },
    include: { arrival: { select: { customerName: true } } },
    orderBy: { acceptedAt: 'asc' },
    take: 500,
  })
  const sellers = attendances.length
    ? await prisma.user.findMany({ where: { id: { in: [...new Set(attendances.map((a) => a.sellerId))] } }, select: { id: true, name: true } })
    : []
  const sellerNames = new Map(sellers.map((u) => [u.id, u.name]))
  const configs = await prisma.sellerQueueUnitConfig.findMany({
    where: {
      ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
      ...(opts.unitId ? { unitId: opts.unitId } : {}),
    },
    select: { tenantId: true, unitId: true, config: true },
  })
  const configMap = new Map(configs.map((c) => [`${c.tenantId}:${c.unitId}`, coerceReminderSettings(c.config)]))
  const states = await loadReminderStates(attendances.map((a) => a.id), DEFAULT_REMINDER_SETTINGS)

  let processed = 0
  let sent = 0
  let skipped = 0
  let escalated = 0
  const errors: Array<{ attendanceId: string; error: string }> = []

  for (const att of attendances) {
    processed += 1
    const settings = configMap.get(`${att.tenantId}:${att.unitId}`) ?? DEFAULT_REMINDER_SETTINGS
    const state = states.get(att.id) ?? buildReminderState(att.id, [], settings)
    if (!isReminderDue(att, state, settings, now)) continue
    if (!isInsideAllowedPushTime(settings, now)) {
      skipped += 1
      await audit(REMINDER_SKIPPED, { tenantId: att.tenantId, entity: 'SellerQueueAttendance', entityId: att.id, afterData: { reason: 'outside_allowed_time', unitId: att.unitId, queueId: att.queueId, sellerId: att.sellerId } })
      continue
    }
    const antiSpam = await antiSpamAllows(att, settings, now)
    if (!antiSpam.ok) {
      skipped += 1
      await audit(REMINDER_SKIPPED, { tenantId: att.tenantId, entity: 'SellerQueueAttendance', entityId: att.id, afterData: { reason: antiSpam.reason, unitId: att.unitId, queueId: att.queueId, sellerId: att.sellerId } })
      continue
    }
    try {
      const sellerName = sellerNames.get(att.sellerId) ?? att.sellerId
      await sendReminderNotification(att, sellerName, settings, false)
      sent += 1
      if (await maybeEscalate(att, sellerName, state, settings)) escalated += 1
    } catch (err) {
      errors.push({ attendanceId: att.id, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return { success: errors.length === 0, processed, sent, skipped, escalated, errors }
}

export async function getReminderDashboard(opts: { tenantId: string; unitId: string; userId: string }) {
  const now = new Date()
  const [cfg, attendances] = await Promise.all([
    prisma.sellerQueueUnitConfig.findUnique({ where: { tenantId_unitId: { tenantId: opts.tenantId, unitId: opts.unitId } }, select: { config: true } }),
    prisma.sellerQueueAttendance.findMany({
      where: { tenantId: opts.tenantId, unitId: opts.unitId, status: { in: OPEN_ATTENDANCE_STATUSES } },
      include: { arrival: { select: { customerName: true, customerPhone: true } } },
      orderBy: { acceptedAt: 'asc' },
      take: 200,
    }),
  ])
  const settings = coerceReminderSettings(cfg?.config)
  const states = await loadReminderStates(attendances.map((a) => a.id), settings)
  const sellers = attendances.length
    ? await prisma.user.findMany({ where: { id: { in: [...new Set(attendances.map((a) => a.sellerId))] } }, select: { id: true, name: true } })
    : []
  const sellerNames = new Map(sellers.map((u) => [u.id, u.name]))
  const byAttendance: Record<string, ReminderState> = {}
  let myReminder: AttendanceReminderPayload | null = null
  let awaiting = 0
  let dueNow = 0
  let escalated = 0

  for (const att of attendances) {
    const state = states.get(att.id) ?? buildReminderState(att.id, [], settings)
    byAttendance[att.id] = state
    if (state.awaitingResponse) awaiting += 1
    if (state.escalatedAt) escalated += 1
    if (isReminderDue(att, state, settings, now)) dueNow += 1
    if (att.sellerId === opts.userId && !myReminder && (state.awaitingResponse || isReminderDue(att, state, settings, now))) {
      myReminder = {
        id: att.id,
        sellerId: att.sellerId,
        sellerName: sellerNames.get(att.sellerId) ?? att.sellerId,
        status: att.status,
        calledAt: att.calledAt,
        acceptedAt: att.acceptedAt,
        startedAt: att.startedAt,
        customerName: att.arrival?.customerName ?? null,
        customerPhone: att.arrival?.customerPhone ?? null,
        reminderState: state,
      }
    }
  }

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const todayLogs = await prisma.auditLog.findMany({
    where: { tenantId: opts.tenantId, createdAt: { gte: today }, action: { in: [REMINDER_SENT, REMINDER_ACK, REMINDER_FINISH_REQUESTED, REMINDER_ESCALATED, QUEUE_ALERT_SENT] } },
    select: { action: true, afterData: true },
    take: 2000,
  })
  const scoped = todayLogs.filter((l) => obj(l.afterData).unitId === opts.unitId)
  const stats = {
    activeAttendances: attendances.length,
    remindersToday: scoped.filter((l) => l.action === REMINDER_SENT).length,
    confirmationsToday: scoped.filter((l) => l.action === REMINDER_ACK).length,
    finishRequestsToday: scoped.filter((l) => l.action === REMINDER_FINISH_REQUESTED).length,
    escalationsToday: scoped.filter((l) => l.action === REMINDER_ESCALATED).length,
    queueAlertsToday: scoped.filter((l) => l.action === QUEUE_ALERT_SENT).length,
    awaitingResponses: awaiting,
    dueNow,
    escalatedOpen: escalated,
  }
  return { settings, stats, byAttendance, myReminder }
}

async function queueTargetUsers(tenantId: string, unitId: string, scope: QueuePushTargetScope) {
  if (scope === 'MANAGERS') {
    return prisma.user.findMany({ where: { tenantId, unitId, status: 'ATIVO', role: { in: MANAGER_ROLES as never[] } }, select: { id: true } }).then((rows) => rows.map((r) => r.id))
  }
  const queue = await prisma.sellerQueue.findFirst({ where: { tenantId, unitId, status: 'OPEN' }, orderBy: { date: 'desc' }, select: { id: true } })
  if (!queue) return []
  const entries = await prisma.sellerQueueEntry.findMany({
    where: { queueId: queue.id, status: { notIn: ['LEFT', 'BLOCKED'] } },
    orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
    select: { sellerId: true, status: true, blocked: true },
  })
  const managers = scope === 'MANAGERS_AND_CURRENT'
    ? await prisma.user.findMany({ where: { tenantId, unitId, status: 'ATIVO', role: { in: MANAGER_ROLES as never[] } }, select: { id: true } }).then((rows) => rows.map((r) => r.id))
    : []
  if (scope === 'ALL_QUEUE') return [...new Set(entries.map((e) => e.sellerId))]
  if (scope === 'ALL_ACTIVE_PARTICIPANTS') return [...new Set(entries.filter((e) => !e.blocked && ['WAITING', 'NEXT', 'CALLED', 'ACCEPTED', 'IN_ATTENDANCE'].includes(e.status)).map((e) => e.sellerId))]
  if (scope === 'CALLED_SELLER') return [...new Set(entries.filter((e) => ['CALLED', 'ACCEPTED', 'IN_ATTENDANCE'].includes(e.status)).map((e) => e.sellerId))]
  const current = entries.find((e) => !e.blocked && ['WAITING', 'NEXT'].includes(e.status))?.sellerId
  return [...new Set([...(current ? [current] : []), ...managers])]
}

export async function sendQueueAlert(opts: { tenantId: string; unitId: string; actorId: string; scope: QueuePushTargetScope; message: string; reason?: string | null }) {
  const users = await queueTargetUsers(opts.tenantId, opts.unitId, opts.scope)
  if (!users.length) return { sent: 0 }
  await Promise.all(users.map((userId) => notify({
    userId,
    tenantId: opts.tenantId,
    type: 'SISTEMA',
    title: 'Alerta da fila',
    message: opts.message,
    actionUrl: '/vendedor-da-vez',
    metadata: { kind: 'seller_queue_manual_alert', unitId: opts.unitId, scope: opts.scope, pushType: 'QUEUE_ALERT', pushData: { kind: 'seller_queue_manual_alert' } },
    channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'],
  }).catch(() => {})))
  await audit(QUEUE_ALERT_SENT, {
    tenantId: opts.tenantId,
    userId: opts.actorId,
    entity: 'SellerQueue',
    entityId: opts.unitId,
    afterData: { unitId: opts.unitId, scope: opts.scope, targetCount: users.length, message: opts.message, reason: opts.reason ?? null },
  })
  return { sent: users.length }
}
