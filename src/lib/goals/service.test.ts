import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getGoalPeriod, resolveGoalForUser } from './service'
import { GoalScope, GoalPeriod, GoalType, UserRole } from '@prisma/client'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    goal: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

function formatTz(d: Date): string {
  // Retorna no formato "DD/MM/YYYY HH:mm:ss" no fuso America/Sao_Paulo
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d).map((p) => [p.type, p.value])
  )
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`
}

describe('getGoalPeriod - Periodicidade Mensal Recorrente', () => {
  it('Julho de 2026', () => {
    const ref = new Date('2026-07-15T12:00:00Z')
    const result = getGoalPeriod({ frequency: 'monthly', referenceDate: ref })
    expect(formatTz(result.startsAt)).toBe('01/07/2026 00:00:00')
    expect(formatTz(result.endsAt)).toBe('31/07/2026 23:59:59')
    expect(result.periodKey).toBe('2026-07')
  })

  it('Agosto de 2026', () => {
    const ref = new Date('2026-08-01T08:00:00Z')
    const result = getGoalPeriod({ frequency: 'monthly', referenceDate: ref })
    expect(formatTz(result.startsAt)).toBe('01/08/2026 00:00:00')
    expect(formatTz(result.endsAt)).toBe('31/08/2026 23:59:59')
    expect(result.periodKey).toBe('2026-08')
  })

  it('Setembro de 2026', () => {
    const ref = new Date('2026-09-10T15:30:00Z')
    const result = getGoalPeriod({ frequency: 'monthly', referenceDate: ref })
    expect(formatTz(result.startsAt)).toBe('01/09/2026 00:00:00')
    expect(formatTz(result.endsAt)).toBe('30/09/2026 23:59:59')
    expect(result.periodKey).toBe('2026-09')
  })

  it('Fevereiro de ano comum (2027)', () => {
    const ref = new Date('2027-02-10T12:00:00Z')
    const result = getGoalPeriod({ frequency: 'monthly', referenceDate: ref })
    expect(formatTz(result.startsAt)).toBe('01/02/2027 00:00:00')
    expect(formatTz(result.endsAt)).toBe('28/02/2027 23:59:59')
    expect(result.periodKey).toBe('2027-02')
  })

  it('Fevereiro de ano bissexto (2028)', () => {
    const ref = new Date('2028-02-10T12:00:00Z')
    const result = getGoalPeriod({ frequency: 'monthly', referenceDate: ref })
    expect(formatTz(result.startsAt)).toBe('01/02/2028 00:00:00')
    expect(formatTz(result.endsAt)).toBe('29/02/2028 23:59:59')
    expect(result.periodKey).toBe('2028-02')
  })

  it('Virada de ano - Dezembro de 2026 para Janeiro de 2027', () => {
    const dec = new Date('2026-12-31T12:00:00Z')
    const jan = new Date('2027-01-01T12:00:00Z')
    
    const resDec = getGoalPeriod({ frequency: 'monthly', referenceDate: dec })
    expect(formatTz(resDec.startsAt)).toBe('01/12/2026 00:00:00')
    expect(formatTz(resDec.endsAt)).toBe('31/12/2026 23:59:59')
    expect(resDec.periodKey).toBe('2026-12')

    const resJan = getGoalPeriod({ frequency: 'monthly', referenceDate: jan })
    expect(formatTz(resJan.startsAt)).toBe('01/01/2027 00:00:00')
    expect(formatTz(resJan.endsAt)).toBe('31/01/2027 23:59:59')
    expect(resJan.periodKey).toBe('2027-01')
  })
})

describe('resolveGoalForUser - Ordem de Prioridades (USER > ROLE > UNIT > TENANT)', () => {
  const mockGoals = [
    {
      id: 'g-tenant',
      tenantId: 'tenant-1',
      unitId: null,
      userId: null,
      targetRole: null,
      type: GoalType.SALES_EXCHANGE,
      scope: GoalScope.TENANT,
      period: GoalPeriod.MONTHLY,
      startDate: new Date('2026-07-01T00:00:00Z'),
      endDate: new Date('2099-12-31T23:59:59Z'),
      targetValue: 10,
    },
    {
      id: 'g-unit',
      tenantId: 'tenant-1',
      unitId: 'unit-1',
      userId: null,
      targetRole: null,
      type: GoalType.SALES_EXCHANGE,
      scope: GoalScope.UNIT,
      period: GoalPeriod.MONTHLY,
      startDate: new Date('2026-07-01T00:00:00Z'),
      endDate: new Date('2099-12-31T23:59:59Z'),
      targetValue: 12,
    },
    {
      id: 'g-role',
      tenantId: 'tenant-1',
      unitId: null,
      userId: null,
      targetRole: UserRole.VENDEDOR,
      type: GoalType.SALES_EXCHANGE,
      scope: GoalScope.ROLE,
      period: GoalPeriod.MONTHLY,
      startDate: new Date('2026-07-01T00:00:00Z'),
      endDate: new Date('2099-12-31T23:59:59Z'),
      targetValue: 15,
    },
    {
      id: 'g-user',
      tenantId: 'tenant-1',
      unitId: null,
      userId: 'user-1',
      targetRole: null,
      type: GoalType.SALES_EXCHANGE,
      scope: GoalScope.USER,
      period: GoalPeriod.MONTHLY,
      startDate: new Date('2026-07-01T00:00:00Z'),
      endDate: new Date('2099-12-31T23:59:59Z'),
      targetValue: 20,
    },
  ]

  beforeEach(() => {
    prismaMock.goal.findMany.mockReset()
  })

  it('Deve retornar a meta USER (prioridade máxima)', async () => {
    prismaMock.goal.findMany.mockResolvedValue(mockGoals)
    const resolved = await resolveGoalForUser({
      userId: 'user-1',
      role: UserRole.VENDEDOR,
      unitId: 'unit-1',
      tenantId: 'tenant-1',
      type: GoalType.SALES_EXCHANGE,
      period: GoalPeriod.MONTHLY,
      referenceDate: new Date('2026-07-15T12:00:00Z'),
    })
    expect(resolved?.id).toBe('g-user')
  })

  it('Deve retornar a meta ROLE se não houver USER', async () => {
    prismaMock.goal.findMany.mockResolvedValue(mockGoals.filter(g => g.id !== 'g-user'))
    const resolved = await resolveGoalForUser({
      userId: 'user-1',
      role: UserRole.VENDEDOR,
      unitId: 'unit-1',
      tenantId: 'tenant-1',
      type: GoalType.SALES_EXCHANGE,
      period: GoalPeriod.MONTHLY,
      referenceDate: new Date('2026-07-15T12:00:00Z'),
    })
    expect(resolved?.id).toBe('g-role')
  })

  it('Deve retornar a meta UNIT se não houver USER ou ROLE', async () => {
    prismaMock.goal.findMany.mockResolvedValue(mockGoals.filter(g => g.id !== 'g-user' && g.id !== 'g-role'))
    const resolved = await resolveGoalForUser({
      userId: 'user-1',
      role: UserRole.VENDEDOR,
      unitId: 'unit-1',
      tenantId: 'tenant-1',
      type: GoalType.SALES_EXCHANGE,
      period: GoalPeriod.MONTHLY,
      referenceDate: new Date('2026-07-15T12:00:00Z'),
    })
    expect(resolved?.id).toBe('g-unit')
  })

  it('Deve retornar a meta TENANT (geral) se não houver regras mais específicas', async () => {
    prismaMock.goal.findMany.mockResolvedValue(mockGoals.filter(g => g.id === 'g-tenant'))
    const resolved = await resolveGoalForUser({
      userId: 'user-1',
      role: UserRole.VENDEDOR,
      unitId: 'unit-1',
      tenantId: 'tenant-1',
      type: GoalType.SALES_EXCHANGE,
      period: GoalPeriod.MONTHLY,
      referenceDate: new Date('2026-07-15T12:00:00Z'),
    })
    expect(resolved?.id).toBe('g-tenant')
  })
})
