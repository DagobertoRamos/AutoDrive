import { describe, expect, it } from 'vitest'
import { coerceAttendanceTypesConfig, readAttendanceTypesConfig, findActiveType, typeConsumesTurn, DEFAULT_ATTENDANCE_TYPES } from '@/lib/seller-queue/attendance-types-config'

describe('attendance-types-config', () => {
  it('default cobre os tipos da spec', () => {
    const codes = DEFAULT_ATTENDANCE_TYPES.map((t) => t.code)
    expect(codes).toContain('RETIRADA_CARRO')
    expect(codes).toContain('ENTREGA_VEICULO')
    expect(codes).toContain('DOCUMENTACAO')
    expect(codes).toContain('TEST_DRIVE')
    expect(codes).toContain('AVALIACAO')
  })

  it('cliente de porta consome a vez; agendamento não (padrão)', () => {
    const cfg = { types: DEFAULT_ATTENDANCE_TYPES }
    expect(typeConsumesTurn(cfg, 'CLIENTE_PORTA')).toBe(true)
    expect(typeConsumesTurn(cfg, 'AGENDAMENTO')).toBe(false)
    expect(typeConsumesTurn(cfg, 'RETIRADA_CARRO')).toBe(false)
  })

  it('tipo desconhecido → consome (conservador)', () => {
    expect(typeConsumesTurn({ types: DEFAULT_ATTENDANCE_TYPES }, 'ZZZ')).toBe(true)
  })

  it('findActiveType ignora inativo e normaliza código', () => {
    const cfg = coerceAttendanceTypesConfig({ types: [{ code: 'retorno', label: 'Retorno', active: true, consumesTurn: false }, { code: 'X', label: 'X', active: false, consumesTurn: true }] })
    expect(findActiveType(cfg, 'RETORNO')?.label).toBe('Retorno')
    expect(findActiveType(cfg, 'X')).toBeNull()
  })

  it('coerce descarta duplicados e itens sem código; normaliza', () => {
    const c = coerceAttendanceTypesConfig({ types: [{ code: 'retirada de carro', label: 'Retirada' }, { code: 'RETIRADA_DE_CARRO', label: 'dup' }, { label: 'sem code' }] })
    expect(c.types.length).toBe(1)
    expect(c.types[0].code).toBe('RETIRADA_DE_CARRO')
  })

  it('readAttendanceTypesConfig sem bloco → default', () => {
    expect(readAttendanceTypesConfig({ outra: 1 }).types.length).toBe(DEFAULT_ATTENDANCE_TYPES.length)
  })
})
