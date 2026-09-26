import { describe, expect, it } from 'vitest'
import {
  daysBetween, GATE_EVALUATION, GATE_INSPECTION, GATE_NEGOTIATION, GATE_RECEIVE, inspectionOk, intakeState, intakeTimeline, isGate, STAGE_SERVICES,
} from './intake-core'

const gates = (done: Partial<Record<string, boolean>> = {}) => [GATE_EVALUATION, GATE_NEGOTIATION, GATE_INSPECTION, GATE_RECEIVE]
  .map((label) => ({ label, resolved: !!done[label] }))

describe('perícia', () => {
  it('só "sem perícia" não vale', () => {
    expect(inspectionOk('PENDENTE')).toBe(true)
    expect(inspectionOk('APROVADA')).toBe(true)
    expect(inspectionOk('REPROVADA')).toBe(true)
    expect(inspectionOk('SEM_CAUTELAR')).toBe(false)
    expect(inspectionOk(null)).toBe(false)
  })
})

describe('intakeState', () => {
  it('carro sem esteira não é movido', () => {
    expect(intakeState([{ label: 'Documentação', resolved: false }], 'DISPONIVEL')).toMatchObject({ tracked: false, nextStatus: null })
  })
  it('portão faltando mantém em preparação e lista o que falta', () => {
    const s = intakeState(gates({ [GATE_EVALUATION]: true, [GATE_INSPECTION]: true }), 'PENDENTE_PREPARACAO')
    expect(s.nextStatus).toBeNull()
    expect(s.missingGates).toEqual([GATE_NEGOTIATION, GATE_RECEIVE])
    expect(s.gatesDone).toBe(2)
  })
  it('portões OK com serviços abertos → Em serviço', () => {
    const all = gates({ [GATE_EVALUATION]: true, [GATE_NEGOTIATION]: true, [GATE_INSPECTION]: true, [GATE_RECEIVE]: true })
    expect(intakeState([...all, { label: STAGE_SERVICES, resolved: false }], 'PENDENTE_PREPARACAO').nextStatus).toBe('EM_SERVICO')
  })
  it('portões OK e serviços concluídos (ou sem serviços) → Disponível', () => {
    const all = gates({ [GATE_EVALUATION]: true, [GATE_NEGOTIATION]: true, [GATE_INSPECTION]: true, [GATE_RECEIVE]: true })
    expect(intakeState([...all, { label: STAGE_SERVICES, resolved: true }], 'EM_SERVICO').nextStatus).toBe('DISPONIVEL')
    expect(intakeState(all, 'PENDENTE_PREPARACAO').nextStatus).toBe('DISPONIVEL')
  })
  it('portão reaberto volta para preparação; nunca mexe em vendido/reservado', () => {
    const one = gates({ [GATE_EVALUATION]: true, [GATE_NEGOTIATION]: true, [GATE_INSPECTION]: true })
    expect(intakeState(one, 'EM_SERVICO').nextStatus).toBe('PENDENTE_PREPARACAO')
    expect(intakeState(one, 'RESERVADO').nextStatus).toBeNull()
    expect(intakeState(one, 'VENDIDO').nextStatus).toBeNull()
  })
  it('reconhece rótulo sem acento/maiúsculas', () => {
    expect(isGate('pericia')).toBe(true)
    expect(isGate('NEGOCIACAO DE ENTRADA')).toBe(true)
    expect(isGate('Serviços da avaliação')).toBe(false)
  })
})

describe('linha do tempo', () => {
  it('dias desde a entrada por etapa', () => {
    const entry = '2026-09-01T12:00:00Z'
    const t = intakeTimeline({
      entryDate: entry,
      pendencies: [
        { label: GATE_EVALUATION, resolved: true, resolvedAt: entry },
        { label: GATE_RECEIVE, resolved: true, resolvedAt: '2026-09-04T12:00:00Z' },
        { label: STAGE_SERVICES, resolved: false },
      ],
      stockStatus: 'EM_SERVICO',
    })
    expect(t.map((s) => s.key)).toEqual(['entrada', 'avaliacao', 'negociacao-de-entrada', 'pericia', 'recebimento-do-veiculo', 'servicos', 'fotos', 'disponivel'])
    expect(t.find((s) => s.key === 'recebimento-do-veiculo')).toMatchObject({ done: true, days: 3 })
    expect(t.find((s) => s.key === 'servicos')?.done).toBe(false)
    expect(daysBetween('2026-09-01', '2026-09-11')).toBe(10)
  })
})
