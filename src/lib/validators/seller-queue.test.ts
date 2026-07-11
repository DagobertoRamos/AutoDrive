import { describe, expect, it } from 'vitest'
import { configSchema } from './seller-queue'

const validAttendanceReminder = {
  enabled: true,
  firstAfterMinutes: 1440,
  repeatIntervalSeconds: 86400,
  maxReminders: 50,
  escalateAfter: 50,
  autoEscalate: true,
  requireFinishOnNo: true,
  allowSnooze: false,
  logEveryReminder: true,
}

const validQueuePush = {
  enabled: true,
  intervalSeconds: 86400,
  targetScope: 'CURRENT_SELLER',
  maxRetries: 50,
  resendUntil: 'ACKNOWLEDGED',
  antiSpamUserLimit: 100,
  antiSpamAttendanceLimit: 100,
  antiSpamQueueLimit: 500,
  antiSpamWindowMinutes: 1440,
  allowedStartTime: null,
  allowedEndTime: null,
  allowOutsideHoursForAdmins: true,
  urgency: 'HIGH',
  sound: true,
}

const validCompliancePilot = {
  enabled: true,
  notifyManagers: true,
  autoCreateManagerPendency: true,
  requireConfirmedFraudForRanking: true,
  timeoutPoints: 20,
  confirmedFraudMediumPoints: 100,
  confirmedFraudHighPoints: 200,
  reviewWindowDays: 30,
}

describe('seller queue config schema', () => {
  it('accepts the configured upper bounds for time and push intervals', () => {
    const parsed = configSchema.safeParse({
      maxPauseMinutes: 1440,
      attendanceReminder: validAttendanceReminder,
      queuePush: validQueuePush,
      compliancePilot: validCompliancePilot,
    })

    expect(parsed.success).toBe(true)
  })

  it('identifies the max retries field instead of returning a generic max 50 error', () => {
    const parsed = configSchema.safeParse({
      queuePush: { ...validQueuePush, maxRetries: 51 },
    })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.errors[0]?.message).toBe('A quantidade máxima de tentativas deve ser no máximo 50.')
      expect(parsed.error.errors[0]?.path).toEqual(['queuePush', 'maxRetries'])
    }
  })

  it('keeps reminder count capped with a clear field message', () => {
    const parsed = configSchema.safeParse({
      attendanceReminder: { ...validAttendanceReminder, maxReminders: 51 },
    })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.errors[0]?.message).toBe('A quantidade máxima de lembretes deve ser no máximo 50.')
      expect(parsed.error.errors[0]?.path).toEqual(['attendanceReminder', 'maxReminders'])
    }
  })

  it('keeps compliance pilot high-fraud points with a clear field message', () => {
    const parsed = configSchema.safeParse({
      compliancePilot: { ...validCompliancePilot, confirmedFraudHighPoints: 201 },
    })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.errors[0]?.message).toBe('Os pontos de fraude alta devem ser no máximo 200.')
      expect(parsed.error.errors[0]?.path).toEqual(['compliancePilot', 'confirmedFraudHighPoints'])
    }
  })
})
