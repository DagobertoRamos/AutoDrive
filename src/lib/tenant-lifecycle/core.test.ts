import { describe, it, expect } from 'vitest'
import {
  addYears, isTenantBlocked, countsRetention, newRetentionRecord, pendingWarning, isPurgeDue, effectivePurgeAt, MIN_NOTICE_DAYS,
} from './core'

const DAY = 86_400_000

describe('tenant-lifecycle/core', () => {
  it('bloqueia desativada/suspensa/cancelada; libera ativa e teste', () => {
    expect(isTenantBlocked('BANIDO')).toBe(true)
    expect(isTenantBlocked('SUSPENSO')).toBe(true)
    expect(isTenantBlocked('CANCELADO')).toBe(true)
    expect(isTenantBlocked('ATIVO')).toBe(false)
    expect(isTenantBlocked('TESTE')).toBe(false)
    expect(countsRetention('BANIDO')).toBe(true)
    expect(countsRetention('SUSPENSO')).toBe(false)
  })

  it('prazo de 5 anos a partir da desativação', () => {
    const rec = newRetentionRecord('t1', 'Loja', new Date('2026-09-25T12:00:00Z'))
    expect(rec.purgeAt).toBe('2031-09-25T12:00:00.000Z')
    expect(addYears(new Date('2028-02-29T00:00:00Z'), 5).toISOString().slice(0, 10)).toBe('2033-03-01')
  })

  it('sem aviso antes de 180 dias; depois manda só o mais urgente alcançado', () => {
    const rec = newRetentionRecord('t1', 'Loja', new Date('2026-01-01T00:00:00Z'))
    const purge = new Date(rec.purgeAt).getTime()
    expect(pendingWarning(rec, new Date(purge - 200 * DAY))).toBeNull()
    expect(pendingWarning(rec, new Date(purge - 170 * DAY))).toEqual({ threshold: 180, markAsWarned: [180] })
    // cron parado: pulou de 170 para 20 dias → um aviso (30) e marca 180/90/60/30
    const w = pendingWarning({ ...rec, warned: [180] }, new Date(purge - 20 * DAY))!
    expect(w.threshold).toBe(30)
    expect(w.markAsWarned.sort((a, b) => a - b)).toEqual([30, 60, 90])
  })

  it('nunca apaga sem aviso prévio e respeita a carência mínima', () => {
    const rec = newRetentionRecord('t1', 'Loja', new Date('2020-01-01T00:00:00Z'))
    const after = new Date(new Date(rec.purgeAt).getTime() + 10 * DAY)
    expect(isPurgeDue(rec, after)).toBe(false) // nunca avisou
    const warnedLate = { ...rec, firstWarnedAt: new Date(after.getTime() - 5 * DAY).toISOString() }
    expect(isPurgeDue(warnedLate, after)).toBe(false) // avisou há só 5 dias
    expect(effectivePurgeAt(warnedLate).getTime()).toBe(new Date(warnedLate.firstWarnedAt).getTime() + MIN_NOTICE_DAYS * DAY)
    const warnedEarly = { ...rec, firstWarnedAt: new Date(new Date(rec.purgeAt).getTime() - 180 * DAY).toISOString() }
    expect(isPurgeDue(warnedEarly, after)).toBe(true)
    expect(isPurgeDue(warnedEarly, new Date(new Date(rec.purgeAt).getTime() - DAY))).toBe(false)
  })
})
