import { describe, expect, it } from 'vitest'
import { resolveDashboardProfile } from '@/lib/dashboard/dashboardProfiles'
import type { UserRole } from '@/lib/permissions'
import type { DashboardRoleKind } from '@/lib/dashboard/types'

function profile(role: UserRole, positionName?: string, isSdrMember = false): DashboardRoleKind {
  return resolveDashboardProfile({
    role,
    positionName,
    unitName: 'Matriz',
    isSdrMember,
  }).kind
}

describe('resolveDashboardProfile', () => {
  it('maps native management and commercial roles to their dashboards', () => {
    expect(profile('VENDEDOR')).toBe('VENDEDOR')
    expect(profile('GERENTE')).toBe('GERENTE')
    expect(profile('VENDEDOR_LIDER')).toBe('VENDEDOR')
    expect(profile('GERENTE_GERAL')).toBe('GERENTE_GERAL')
    expect(profile('ADM')).toBe('ADMIN')
    expect(profile('MASTER')).toBe('ADMIN')
    expect(profile('FINANCEIRO')).toBe('FINANCEIRO')
  })

  it('uses position/cargo text to map operational dashboards without new database roles', () => {
    expect(profile('USUARIO', 'Marketing')).toBe('MARKETING')
    expect(profile('USUARIO', 'SDR / Pré-vendas')).toBe('SDR')
    expect(profile('USUARIO', 'F&I')).toBe('FI')
    expect(profile('USUARIO', 'Compras e Avaliações')).toBe('COMPRAS')
    expect(profile('USUARIO', 'Auxiliar de Documentação')).toBe('AUXILIAR')
  })

  it('uses active SDR membership when the position name is generic', () => {
    expect(profile('USUARIO', 'Atendimento', true)).toBe('SDR')
  })
})
