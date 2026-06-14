import { describe, it, expect } from 'vitest'
import { canAccessModule, getManageableRoles } from '@/lib/permissions'

describe('permissions (RBAC por módulo)', () => {
  it('MASTER acessa painel master e configuração de ranking', () => {
    expect(canAccessModule('MASTER', 'master')).toBe(true)
    expect(canAccessModule('MASTER', 'ranking.configure')).toBe(true)
  })

  it('VENDEDOR não acessa master nem cadastro de garantia', () => {
    expect(canAccessModule('VENDEDOR', 'master')).toBe(false)
    expect(canAccessModule('VENDEDOR', 'registrations.warranties')).toBe(false)
  })

  it('gestão de metas restrita a gestores', () => {
    expect(canAccessModule('GERENTE', 'goals.manage')).toBe(true)
    expect(canAccessModule('VENDEDOR', 'goals.manage')).toBe(false)
    // NOTA: GERENTE_ADMINISTRATIVO hoje NÃO está em goals.manage (módulo criado
    // antes desse perfil). Está em MANAGEMENT_ROLES — possível inconsistência a
    // decidir (ver pendência no README_ROBOTS). Teste documenta o estado atual:
    expect(canAccessModule('GERENTE_ADMINISTRATIVO', 'goals.manage')).toBe(false)
  })

  it('ranking.configure apenas MASTER/ADM', () => {
    expect(canAccessModule('ADM', 'ranking.configure')).toBe(true)
    expect(canAccessModule('GERENTE', 'ranking.configure')).toBe(false)
  })

  it('negotiations.financing inclui FINANCEIRO, exclui VENDEDOR', () => {
    expect(canAccessModule('FINANCEIRO', 'negotiations.financing')).toBe(true)
    expect(canAccessModule('GERENTE_ADMINISTRATIVO', 'negotiations.financing')).toBe(true)
    expect(canAccessModule('VENDEDOR', 'negotiations.financing')).toBe(false)
  })

  it('cadastro de garantia: FINANCEIRO sim, GERENTE não (spec 2.1)', () => {
    expect(canAccessModule('FINANCEIRO', 'registrations.warranties')).toBe(true)
    expect(canAccessModule('GERENTE', 'registrations.warranties')).toBe(false)
  })

  it('VENDEDOR vê dashboard, ranking e comissões (leitura)', () => {
    expect(canAccessModule('VENDEDOR', 'dashboard')).toBe(true)
    expect(canAccessModule('VENDEDOR', 'ranking')).toBe(true)
    expect(canAccessModule('VENDEDOR', 'commissions')).toBe(true)
  })

  it('getManageableRoles não inclui roles iguais ou acima', () => {
    const m = getManageableRoles('GERENTE')
    expect(m).not.toContain('MASTER')
    expect(m).not.toContain('ADM')
    expect(m).not.toContain('GERENTE')
    expect(m).toContain('VENDEDOR')
  })
})
