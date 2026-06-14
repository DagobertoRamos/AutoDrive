import { describe, it, expect } from 'vitest'
import { tenantWhere, assertTenantId, hasRole, MANAGEMENT_ROLES } from '@/lib/auth-guards'

describe('auth-guards (isolamento multi-tenant)', () => {
  it('tenantWhere: MASTER não filtra por tenant (vê tudo)', () => {
    expect(tenantWhere('MASTER', null)).toEqual({})
  })

  it('tenantWhere: demais filtram por tenantId obrigatório', () => {
    expect(tenantWhere('VENDEDOR', 't1')).toEqual({ tenantId: 't1' })
  })

  it('tenantWhere: combina filtros extras preservando o tenant', () => {
    expect(tenantWhere('GERENTE', 't1', { active: true })).toEqual({ tenantId: 't1', active: true })
  })

  it('assertTenantId: MASTER pode operar sem tenant (null)', () => {
    expect(assertTenantId(null, 'MASTER')).toBeNull()
  })

  it('assertTenantId: não-MASTER sem tenant lança erro', () => {
    expect(() => assertTenantId(null, 'VENDEDOR')).toThrow()
    expect(assertTenantId('t1', 'VENDEDOR')).toBe('t1')
  })

  it('hasRole / MANAGEMENT_ROLES', () => {
    expect(hasRole('GERENTE_ADMINISTRATIVO', MANAGEMENT_ROLES)).toBe(true)
    expect(hasRole('VENDEDOR', MANAGEMENT_ROLES)).toBe(false)
  })
})
