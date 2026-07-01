import { describe, expect, it } from 'vitest'
import { evaluateTenantServices } from '@/lib/tenant-services/resolveTenantServices'

describe('evaluateTenantServices', () => {
  it('honors tenant-disabled modules before role or open-module access', () => {
    const flags = evaluateTenantServices({
      role: 'ADM',
      disabledModules: ['marketing', 'marketing.leads.distribute', 'marketing.leads.claim'],
      openModules: ['marketing'],
    })

    expect(flags.marketing).toBe(false)
  })

  it('allows a service when the tenant opens one of its modules to every user', () => {
    const flags = evaluateTenantServices({
      role: 'USUARIO',
      openModules: ['finance'],
    })

    expect(flags.financeiro).toBe(true)
  })

  it('removes a service when the user is denied the only accessible module', () => {
    const flags = evaluateTenantServices({
      role: 'VENDEDOR',
      deniedModules: ['ranking'],
    })

    expect(flags.ranking).toBe(false)
  })

  it('keeps a service active when at least one mapped feature is still available', () => {
    const flags = evaluateTenantServices({
      role: 'VENDEDOR',
      disabledModules: ['stock.view'],
    })

    expect(flags.estoque).toBe(true)
    expect(flags.compras).toBe(true)
  })

  it('blocks child features when a parent module is disabled', () => {
    const flags = evaluateTenantServices({
      role: 'VENDEDOR',
      disabledModules: ['stock'],
    })

    expect(flags.estoque).toBe(false)
    expect(flags.compras).toBe(false)
  })
})
