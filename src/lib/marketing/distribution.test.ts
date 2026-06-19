// =============================================================================
// Testes dos seletores puros do motor de distribuição (sem DB).
// =============================================================================

import { describe, it, expect } from 'vitest'
import { eligibleCandidates, pickCandidate, type Candidate } from './distribution'

const mk = (over: Partial<Candidate>): Candidate => ({
  memberId: 'm', userId: 'u', teamId: 't', weight: 1, openLeads: 0, maxOpenLeads: null,
  lastAssignedAt: null, unitId: null, presence: 'ONLINE', ...over,
})

describe('eligibleCandidates', () => {
  const cands = [
    mk({ userId: 'on', presence: 'ONLINE' }),
    mk({ userId: 'off', presence: 'OFFLINE' }),
    mk({ userId: 'full', presence: 'ONLINE', openLeads: 5, maxOpenLeads: 5 }),
    mk({ userId: 'unitA', presence: 'ONLINE', unitId: 'A' }),
  ]
  it('filtra por presença, limite e unidade', () => {
    const e = eligibleCandidates(cands, null, ['ONLINE']).map((c) => c.userId)
    expect(e).toContain('on'); expect(e).toContain('unitA')
    expect(e).not.toContain('off')   // offline
    expect(e).not.toContain('full')  // no limite
  })
  it('respeita a unidade do lead', () => {
    const e = eligibleCandidates(cands, 'B', ['ONLINE']).map((c) => c.userId)
    expect(e).toContain('on')        // sem unidade → elegível
    expect(e).not.toContain('unitA') // unidade A ≠ B
  })
})

describe('pickCandidate', () => {
  it('ROUND_ROBIN escolhe o há mais tempo sem receber', () => {
    const c = [mk({ userId: 'recent', lastAssignedAt: 2000 }), mk({ userId: 'old', lastAssignedAt: 1000 }), mk({ userId: 'never', lastAssignedAt: null })]
    expect(pickCandidate(c, 'ROUND_ROBIN')?.userId).toBe('never') // null = 0 = mais antigo
  })
  it('LOAD_BALANCED escolhe o de menor carga', () => {
    const c = [mk({ userId: 'a', openLeads: 3 }), mk({ userId: 'b', openLeads: 1 }), mk({ userId: 'c', openLeads: 2 })]
    expect(pickCandidate(c, 'LOAD_BALANCED')?.userId).toBe('b')
  })
  it('PERFORMANCE_WEIGHTED escolhe o de maior peso', () => {
    const c = [mk({ userId: 'a', weight: 1 }), mk({ userId: 'b', weight: 3 }), mk({ userId: 'c', weight: 2 })]
    expect(pickCandidate(c, 'PERFORMANCE_WEIGHTED')?.userId).toBe('b')
  })
  it('retorna null sem candidatos', () => {
    expect(pickCandidate([], 'ROUND_ROBIN')).toBeNull()
  })
})
