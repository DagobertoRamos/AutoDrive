import { describe, it, expect } from 'vitest'
import { validateStageTransition } from './transitions'
import type { CrmStageConfig } from './config'

function stage(code: string, order: number, over: Partial<CrmStageConfig> = {}): CrmStageConfig {
  return { code, displayName: code, color: '#000', order, active: true, category: 'OPEN', requiredFields: [], allowSkip: true, allowBack: true, ...over }
}

const LINEAR: CrmStageConfig[] = [stage('NEW', 0), stage('ASSIGNED', 1), stage('WORKING', 2), stage('QUALIFIED', 3), stage('CONVERTED', 4)]

describe('validateStageTransition — defaults irrestritos', () => {
  it('mesma etapa é sempre ok (no-op)', () => {
    expect(validateStageTransition({ fromCode: 'NEW', toCode: 'NEW', stages: LINEAR, lead: {} }).ok).toBe(true)
  })
  it('avança uma etapa, sem restrição configurada', () => {
    const r = validateStageTransition({ fromCode: 'NEW', toCode: 'ASSIGNED', stages: LINEAR, lead: {} })
    expect(r.ok).toBe(true)
  })
  it('pula etapas — permitido por padrão (allowSkip=true)', () => {
    const r = validateStageTransition({ fromCode: 'NEW', toCode: 'QUALIFIED', stages: LINEAR, lead: {} })
    expect(r.ok).toBe(true)
  })
  it('retrocede — permitido por padrão (allowBack=true)', () => {
    const r = validateStageTransition({ fromCode: 'QUALIFIED', toCode: 'NEW', stages: LINEAR, lead: {} })
    expect(r.ok).toBe(true)
  })
})

describe('validateStageTransition — bloqueios configurados', () => {
  it('bloqueia pular quando allowSkip=false na etapa de origem', () => {
    const stages = LINEAR.map((s) => s.code === 'NEW' ? { ...s, allowSkip: false } : s)
    const r = validateStageTransition({ fromCode: 'NEW', toCode: 'WORKING', stages, lead: {} })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/pular/i)
  })
  it('não bloqueia avanço de 1 etapa mesmo com allowSkip=false', () => {
    const stages = LINEAR.map((s) => s.code === 'NEW' ? { ...s, allowSkip: false } : s)
    expect(validateStageTransition({ fromCode: 'NEW', toCode: 'ASSIGNED', stages, lead: {} }).ok).toBe(true)
  })
  it('bloqueia retroceder quando allowBack=false na etapa de origem', () => {
    const stages = LINEAR.map((s) => s.code === 'QUALIFIED' ? { ...s, allowBack: false } : s)
    const r = validateStageTransition({ fromCode: 'QUALIFIED', toCode: 'NEW', stages, lead: {} })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/retroceder/i)
  })
  it('bloqueia etapa de destino inativa', () => {
    const stages = LINEAR.map((s) => s.code === 'WORKING' ? { ...s, active: false } : s)
    const r = validateStageTransition({ fromCode: 'NEW', toCode: 'WORKING', stages, lead: {} })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/desativada/i)
  })
})

describe('validateStageTransition — campos obrigatórios da etapa de destino', () => {
  const stages = LINEAR.map((s) => s.code === 'QUALIFIED' ? { ...s, requiredFields: ['name', 'phone'] } : s)
  it('bloqueia e lista os campos faltantes', () => {
    const r = validateStageTransition({ fromCode: 'WORKING', toCode: 'QUALIFIED', stages, lead: { name: 'João' } })
    expect(r.ok).toBe(false)
    expect(r.missingFields).toEqual(['phone'])
    expect(r.reason).toContain('Telefone')
  })
  it('passa quando todos os campos exigidos estão preenchidos', () => {
    const r = validateStageTransition({ fromCode: 'WORKING', toCode: 'QUALIFIED', stages, lead: { name: 'João', phone: '11999998888' } })
    expect(r.ok).toBe(true)
  })
  it('string vazia/whitespace não conta como preenchido', () => {
    const r = validateStageTransition({ fromCode: 'WORKING', toCode: 'QUALIFIED', stages, lead: { name: '  ', phone: '11999998888' } })
    expect(r.ok).toBe(false)
    expect(r.missingFields).toEqual(['name'])
  })
})

describe('validateStageTransition — sem etapa de origem conhecida', () => {
  it('não aplica regra de skip/back (só valida destino + campos)', () => {
    const r = validateStageTransition({ fromCode: 'UNKNOWN', toCode: 'NEW', stages: LINEAR, lead: {} })
    expect(r.ok).toBe(true)
  })
})
