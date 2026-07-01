import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PENDENCY_SETTINGS,
  mergePendencySettings,
  sanitizeAutoArchiveSettings,
  sanitizePendencySettings,
  tenantIdFromPendencySettingsKey,
} from '@/lib/pendencies/settings'

describe('pendency settings', () => {
  it('keeps auto archive disabled by default with conservative rules', () => {
    const settings = sanitizePendencySettings({})

    expect(settings.autoArchive).toEqual({
      enabled: false,
      afterValue: 7,
      afterUnit: 'days',
      onlyAfterManagerApproval: true,
      onlyIfNotReopened: true,
    })
  })

  it('sanitizes invalid auto archive values', () => {
    const autoArchive = sanitizeAutoArchiveSettings({
      enabled: true,
      afterValue: 0,
      afterUnit: 'weeks',
      onlyAfterManagerApproval: false,
      onlyIfNotReopened: false,
    })

    expect(autoArchive).toEqual({
      ...DEFAULT_PENDENCY_SETTINGS.autoArchive,
      enabled: true,
      onlyAfterManagerApproval: false,
      onlyIfNotReopened: false,
    })
  })

  it('preserves auto archive when legacy settings page saves only SLA and reminders', () => {
    const current = sanitizePendencySettings({
      autoArchive: { enabled: true, afterValue: 3, afterUnit: 'hours' },
    })

    const next = mergePendencySettings(current, {
      slaByPriority: { ALTA: 120 },
      autoSend: { maxSends: 8 },
    })

    expect(next.slaByPriority.ALTA).toBe(120)
    expect(next.autoSend.maxSends).toBe(8)
    expect(next.autoArchive).toEqual({
      enabled: true,
      afterValue: 3,
      afterUnit: 'hours',
      onlyAfterManagerApproval: true,
      onlyIfNotReopened: true,
    })
  })

  it('parses tenant id from tenant scoped settings key', () => {
    expect(tenantIdFromPendencySettingsKey('t:tenant-1:pendency_settings')).toBe('tenant-1')
    expect(tenantIdFromPendencySettingsKey('global:pendency_settings')).toBeNull()
  })
})
