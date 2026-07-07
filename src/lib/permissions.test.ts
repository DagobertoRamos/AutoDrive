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

  it('gestão de metas restrita a gestores (inclui GERENTE_ADMINISTRATIVO)', () => {
    expect(canAccessModule('GERENTE', 'goals.manage')).toBe(true)
    expect(canAccessModule('GERENTE_ADMINISTRATIVO', 'goals.manage')).toBe(true)
    expect(canAccessModule('VENDEDOR', 'goals.manage')).toBe(false)
  })

  it('ranking.configure: gestão geral configura pesos, gerente comum não', () => {
    expect(canAccessModule('ADM', 'ranking.configure')).toBe(true)
    expect(canAccessModule('GERENTE_GERAL', 'ranking.configure')).toBe(true)
    expect(canAccessModule('GERENTE_ADMINISTRATIVO', 'ranking.configure')).toBe(true)
    expect(canAccessModule('GERENTE', 'ranking.configure')).toBe(false)
  })

  it('ranking settings: gerente configura participantes da unidade, não do tenant', () => {
    expect(canAccessModule('GERENTE', 'ranking.settings.view')).toBe(true)
    expect(canAccessModule('GERENTE', 'ranking.settings.manage.unit')).toBe(true)
    expect(canAccessModule('GERENTE', 'ranking.settings.manage.tenant')).toBe(false)
    expect(canAccessModule('ADM', 'ranking.settings.manage.tenant')).toBe(true)
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

  it('permissões granulares da fila separam vendedor comum de gestão', () => {
    expect(canAccessModule('VENDEDOR', 'queue.call_current_seller')).toBe(false)
    expect(canAccessModule('GERENTE', 'queue.call_current_seller')).toBe(true)
    expect(canAccessModule('VENDEDOR', 'queue.transfer_attendance')).toBe(false)
    expect(canAccessModule('VENDEDOR_LIDER', 'queue.transfer_attendance')).toBe(true)
    expect(canAccessModule('GERENTE', 'queue.reorder')).toBe(true)
    expect(canAccessModule('VENDEDOR_LIDER', 'queue.reorder')).toBe(false)
  })

  it('getManageableRoles não inclui roles iguais ou acima', () => {
    const m = getManageableRoles('GERENTE')
    expect(m).not.toContain('MASTER')
    expect(m).not.toContain('ADM')
    expect(m).not.toContain('GERENTE')
    expect(m).toContain('VENDEDOR')
  })
})
