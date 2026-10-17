import { describe, expect, it } from 'vitest'
import { createDashboardAccess, evaluateModuleAccess } from '@/lib/dashboard/access'

describe('dashboard/access — acesso efetivo do colaborador', () => {
  it('papel define o padrão', () => {
    expect(evaluateModuleAccess({ role: 'VENDEDOR' }, 'finance')).toBe(false)
    expect(evaluateModuleAccess({ role: 'ADM' }, 'finance')).toBe(true)
  })

  it('bloqueio individual vence o papel', () => {
    expect(evaluateModuleAccess({ role: 'ADM', userDenied: ['finance'] }, 'finance')).toBe(false)
  })

  it('liberação individual dá acesso além do papel', () => {
    expect(evaluateModuleAccess({ role: 'VENDEDOR', userAllowed: ['finance'] }, 'finance')).toBe(true)
  })

  it('módulo desligado para a loja bloqueia mesmo com liberação individual (inclui ancestral)', () => {
    expect(evaluateModuleAccess({ role: 'ADM', disabledModules: ['finance'], userAllowed: ['finance'] }, 'finance')).toBe(false)
    expect(evaluateModuleAccess({ role: 'ADM', disabledModules: ['finance'] }, 'finance.manage')).toBe(false)
  })

  it('chavinha "liberado para todos" libera quem o papel não teria', () => {
    expect(evaluateModuleAccess({ role: 'VENDEDOR', openModules: ['finance'] }, 'finance')).toBe(true)
  })

  it('regra do CRM da loja por perfil é respeitada, e a exceção individual vence', () => {
    expect(evaluateModuleAccess({ role: 'VENDEDOR', crmDeny: ['crm.view.own'] }, 'crm.view.own')).toBe(false)
    expect(evaluateModuleAccess({ role: 'VENDEDOR', crmDeny: ['crm.view.own'], userAllowed: ['crm.view.own'] }, 'crm.view.own')).toBe(true)
  })

  it('MASTER usa só o papel (não é afetado por regra de loja)', () => {
    expect(evaluateModuleAccess({ role: 'MASTER', disabledModules: ['master'] }, 'master')).toBe(true)
  })

  it('canAny: lista vazia é livre; basta um liberado', () => {
    const access = createDashboardAccess({ role: 'VENDEDOR' })
    expect(access.canAny([])).toBe(true)
    expect(access.canAny(['finance', 'negotiations'])).toBe(true)
    expect(access.canAny(['finance'])).toBe(false)
  })
})
