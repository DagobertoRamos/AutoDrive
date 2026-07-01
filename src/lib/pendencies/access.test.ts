import { describe, expect, it } from 'vitest'
import {
  canAccessPendencyScope,
  deletedPendencyReason,
  isDeletedPendencyReason,
  isPendencyGeneralManagerPlus,
  isPendencyManagerPlus,
} from '@/lib/pendencies/access'

describe('pendency access helpers', () => {
  it('maps archive and delete permissions by role hierarchy', () => {
    expect(isPendencyManagerPlus('GERENTE')).toBe(true)
    expect(isPendencyManagerPlus('GERENTE_ADMINISTRATIVO')).toBe(true)
    expect(isPendencyManagerPlus('VENDEDOR')).toBe(false)

    expect(isPendencyGeneralManagerPlus('GERENTE_GERAL')).toBe(true)
    expect(isPendencyGeneralManagerPlus('ADM')).toBe(true)
    expect(isPendencyGeneralManagerPlus('GERENTE')).toBe(false)
  })

  it('marks logical deletion using cancelReason without colliding with archive reasons', () => {
    const reason = deletedPendencyReason('duplicada')

    expect(isDeletedPendencyReason(reason)).toBe(true)
    expect(isDeletedPendencyReason('Arquivada pelo gerente')).toBe(false)
    expect(isDeletedPendencyReason(null)).toBe(false)
  })

  it('keeps a gerente scoped to his own unit', () => {
    const actor = { id: 'u1', role: 'GERENTE', tenantId: 't1', unitId: 'unit-a' }

    expect(canAccessPendencyScope(actor, { tenantId: 't1', unitId: 'unit-a' })).toBe(true)
    expect(canAccessPendencyScope(actor, { tenantId: 't1', unitId: 'unit-b' })).toBe(false)
  })

  it('keeps regular users scoped to their own pendencies', () => {
    const actor = { id: 'u1', role: 'VENDEDOR', tenantId: 't1', unitId: 'unit-a' }

    expect(canAccessPendencyScope(actor, { tenantId: 't1', unitId: 'unit-a', responsible: { userId: 'u1' } })).toBe(true)
    expect(canAccessPendencyScope(actor, { tenantId: 't1', unitId: 'unit-a', responsible: { userId: 'u2' } })).toBe(false)
  })
})
