import { describe, it, expect } from 'vitest'
import { effectiveRolePermission, sanitizeRolePermissions, systemDefault, isCrmPermission } from './permissions-core'

describe('permissões do CRM por loja', () => {
  it('padrão do sistema vem de MODULE_PERMISSIONS', () => {
    expect(systemDefault('ADM', 'crm.lead.delete')).toBe(true)
    expect(systemDefault('VENDEDOR', 'crm.settings.manage')).toBe(false)
    expect(isCrmPermission('crm.lead.create')).toBe(true)
    expect(isCrmPermission('financeiro')).toBe(false)
  })

  it('sanitiza: só chaves/perfis válidos, só o que difere do padrão', () => {
    const o = sanitizeRolePermissions({
      'crm.lead.create': { VENDEDOR: false, GERENTE: true /* = padrão */, HACKER: false },
      'crm.settings.manage': { GERENTE: false, ADM: false /* travado */ },
      'nao.existe': { ADM: true },
      'crm.lead.delete': { VENDEDOR: 'sim' },
    })
    expect(o).toEqual({ 'crm.lead.create': { VENDEDOR: false }, 'crm.settings.manage': { GERENTE: false } })
  })

  it('valor efetivo: regra da loja > padrão; ADM travado; MASTER intocado', () => {
    const o = { 'crm.lead.create': { VENDEDOR: false }, 'crm.settings.manage': { VENDEDOR_LIDER: true }, 'crm': { ADM: false } }
    expect(effectiveRolePermission('VENDEDOR', 'crm.lead.create', o)).toBe(false)
    expect(effectiveRolePermission('VENDEDOR_LIDER', 'crm.settings.manage', o)).toBe(true)
    expect(effectiveRolePermission('GERENTE', 'crm.lead.create', o)).toBe(true)
    expect(effectiveRolePermission('ADM', 'crm', o)).toBe(true)
    expect(effectiveRolePermission('MASTER', 'crm.lead.create', { 'crm.lead.create': { MASTER: false } })).toBe(true)
  })
})
