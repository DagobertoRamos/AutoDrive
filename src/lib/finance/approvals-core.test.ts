import { describe, expect, it } from 'vitest'
import { canDecide, normalizeConfig, rolesFor } from './approvals-core'

const cfg = normalizeConfig({ enabled: true, exemptUpTo: 500, bands: [{ upTo: null, roles: ['ADM'] }, { upTo: 5000, roles: ['FINANCEIRO', 'XYZ'] }] })

describe('alçadas', () => {
  it('ordena as faixas e descarta papel inválido', () => {
    expect(cfg.bands).toEqual([{ upTo: 5000, roles: ['FINANCEIRO'] }, { upTo: null, roles: ['ADM'] }])
  })
  it('isento, faixa intermediária e faixa final', () => {
    expect(rolesFor(cfg, 500)).toBeNull()
    expect(rolesFor(cfg, 1200)).toEqual(['FINANCEIRO', 'ADM', 'MASTER'])
    expect(rolesFor(cfg, 9000)).toEqual(['ADM', 'MASTER'])
    expect(rolesFor({ ...cfg, enabled: false }, 9000)).toBeNull()
  })
  it('quem pede não aprova (salvo ADM/MASTER)', () => {
    expect(canDecide(['FINANCEIRO', 'ADM'], { id: 'u1', role: 'FINANCEIRO' }, 'u1')).toMatch(/não pode/)
    expect(canDecide(['FINANCEIRO', 'ADM'], { id: 'u1', role: 'FINANCEIRO' }, 'u2')).toBeNull()
    expect(canDecide(['FINANCEIRO', 'ADM'], { id: 'u1', role: 'GERENTE' }, 'u2')).toMatch(/alçada/)
    expect(canDecide(['FINANCEIRO', 'ADM'], { id: 'u1', role: 'ADM' }, 'u1')).toBeNull()
  })
})
