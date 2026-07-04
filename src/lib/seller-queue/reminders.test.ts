import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_REMINDER_SETTINGS,
  buildReminderState,
  coerceReminderSettings,
  isReminderDue,
  REMINDER_ACK,
  REMINDER_SENT,
} from './reminders'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/services/notification.service', () => ({ notify: vi.fn(), notifyByRole: vi.fn() }))

const baseAttendance = {
  id: 'att-1',
  status: 'IN_ATTENDANCE',
  calledAt: new Date('2026-07-04T12:00:00.000Z'),
  acceptedAt: new Date('2026-07-04T12:00:00.000Z'),
  startedAt: new Date('2026-07-04T12:00:00.000Z'),
}

describe('seller queue attendance reminders', () => {
  it('uses safe defaults from partial config', () => {
    const settings = coerceReminderSettings({
      attendanceReminder: { firstAfterMinutes: 5 },
      queuePush: { intervalSeconds: 10, targetScope: 'NOPE' },
    })

    expect(settings.attendanceReminder.firstAfterMinutes).toBe(5)
    expect(settings.attendanceReminder.maxReminders).toBe(DEFAULT_REMINDER_SETTINGS.attendanceReminder.maxReminders)
    expect(settings.queuePush.intervalSeconds).toBe(30)
    expect(settings.queuePush.targetScope).toBe('CURRENT_SELLER')
  })

  it('keeps reminder minutes aligned with the config screen limit', () => {
    const settings = coerceReminderSettings({
      attendanceReminder: { firstAfterMinutes: 2000 },
    })

    expect(settings.attendanceReminder.firstAfterMinutes).toBe(1440)
  })

  it('becomes due after the first configured interval', () => {
    const state = buildReminderState('att-1', [])
    const due = isReminderDue(baseAttendance, state, DEFAULT_REMINDER_SETTINGS, new Date('2026-07-04T12:16:00.000Z'))

    expect(due).toBe(true)
  })

  it('waits for the repeat interval after an acknowledgement', () => {
    const state = buildReminderState('att-1', [
      { action: REMINDER_SENT, createdAt: new Date('2026-07-04T12:16:00.000Z') },
      { action: REMINDER_ACK, createdAt: new Date('2026-07-04T12:17:00.000Z') },
    ])

    expect(isReminderDue(baseAttendance, state, DEFAULT_REMINDER_SETTINGS, new Date('2026-07-04T12:20:00.000Z'))).toBe(false)
    expect(isReminderDue(baseAttendance, state, DEFAULT_REMINDER_SETTINGS, new Date('2026-07-04T12:23:00.000Z'))).toBe(true)
  })

  it('stops after the maximum number of reminders', () => {
    const logs = Array.from({ length: DEFAULT_REMINDER_SETTINGS.attendanceReminder.maxReminders }, (_, index) => ({
      action: REMINDER_SENT,
      createdAt: new Date(Date.UTC(2026, 6, 4, 12, index, 0)),
    }))
    const state = buildReminderState('att-1', logs)

    expect(isReminderDue(baseAttendance, state, DEFAULT_REMINDER_SETTINGS, new Date('2026-07-04T14:00:00.000Z'))).toBe(false)
  })
})
