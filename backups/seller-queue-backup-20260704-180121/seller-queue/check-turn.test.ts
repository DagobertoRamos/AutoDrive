import { describe, expect, it } from 'vitest'
import { computeCheckTurn, type CheckTurnEntry } from '@/lib/seller-queue/check-turn'

const NAMES: Record<string, string> = { s1: 'Anderson', s2: 'Bruno', s3: 'Carla', s4: 'Denis' }
const nameOf = (id: string) => NAMES[id] ?? id

function run(entries: CheckTurnEntry[], userId: string, opts?: { canCheckIn?: boolean; canManage?: boolean }) {
  return computeCheckTurn({ entries, userId, nameOf, canCheckIn: opts?.canCheckIn ?? true, canManage: opts?.canManage ?? false })
}

const line: CheckTurnEntry[] = [
  { sellerId: 's1', status: 'WAITING', blocked: false },
  { sellerId: 's2', status: 'WAITING', blocked: false },
  { sellerId: 's3', status: 'PAUSED', blocked: false },
  { sellerId: 's4', status: 'IN_ATTENDANCE', blocked: false },
]

describe('computeCheckTurn', () => {
  it('sou o da vez → posição 1, pode iniciar atendimento', () => {
    const r = run(line, 's1')
    expect(r.eligible).toBe(true)
    expect(r.isCurrentTurn).toBe(true)
    expect(r.userPosition).toBe(1)
    expect(r.canStartAttendance).toBe(true)
    expect(r.canCallCurrentSeller).toBe(false)
    expect(r.message).toBe('Você é o vendedor da vez.')
  })

  it('outro é o da vez → mostra minha posição e permite chamar', () => {
    const r = run(line, 's2')
    expect(r.isCurrentTurn).toBe(false)
    expect(r.userPosition).toBe(2)
    expect(r.currentSeller).toEqual({ id: 's1', name: 'Anderson' })
    expect(r.canCallCurrentSeller).toBe(true)
    expect(r.canStartAttendance).toBe(false)
    expect(r.message).toBe('Você é o 2º na fila. O vendedor da vez é Anderson.')
  })

  it('pausado → inelegível, não pode iniciar, mas ainda pode chamar o da vez', () => {
    const r = run(line, 's3')
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('Você está pausado. Retome para voltar à fila.')
    expect(r.canStartAttendance).toBe(false)
    expect(r.canCallCurrentSeller).toBe(true) // há vendedor da vez (Anderson)
  })

  it('atendendo → inelegível com motivo', () => {
    const r = run(line, 's4')
    expect(r.eligible).toBe(false)
    expect(r.reason).toBe('Você está em atendimento.')
  })

  it('não está na fila mas participa → motivo "entre na fila"', () => {
    const r = run(line, 'sX', { canCheckIn: true })
    expect(r.eligible).toBe(false)
    expect(r.reason).toContain('Entre na fila')
  })

  it('não participa da fila (cargo/módulo) → motivo específico', () => {
    const r = run(line, 'sX', { canCheckIn: false })
    expect(r.reason).toBe('Você não participa da fila de atendimento.')
  })

  it('bloqueado não conta como vendedor da vez', () => {
    const blocked: CheckTurnEntry[] = [
      { sellerId: 's1', status: 'WAITING', blocked: true },
      { sellerId: 's2', status: 'WAITING', blocked: false },
    ]
    const r = run(blocked, 's2')
    expect(r.currentSeller).toEqual({ id: 's2', name: 'Bruno' })
    expect(r.isCurrentTurn).toBe(true)
  })

  it('contadores: disponíveis/pausados/atendendo', () => {
    const r = run(line, 's1')
    expect(r.counts).toEqual({ available: 2, paused: 1, attending: 1, waiting: 2 })
    expect(r.nextUp).toEqual([{ name: 'Anderson', position: 1 }, { name: 'Bruno', position: 2 }])
  })

  it('fila vazia → sem vendedor da vez', () => {
    const r = run([], 's1')
    expect(r.currentSeller).toBeNull()
    expect(r.canCallCurrentSeller).toBe(false)
    expect(r.message).toContain('Você não está na fila')
  })
})
