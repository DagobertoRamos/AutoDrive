import { describe, it, expect } from 'vitest'
import { sanitizeAutomations, ruleMatches, matchingRules, readAutomationMarks, describeAction, type AutomationRule, type AutomationLeadCtx } from './automations-core'

const now = new Date('2026-09-23T12:00:00Z')

describe('sanitizeAutomations', () => {
  it('descarta regras sem nome, gatilho válido ou ações', () => {
    const r = sanitizeAutomations([
      { name: 'ok', trigger: 'LEAD_CREATED', actions: [{ type: 'NOTIFY', message: 'oi' }] },
      { name: '', trigger: 'LEAD_CREATED', actions: [{ type: 'NOTIFY', message: 'x' }] },
      { name: 'x', trigger: 'BOOM', actions: [{ type: 'NOTIFY', message: 'x' }] },
      { name: 'x', trigger: 'LEAD_CREATED', actions: [{ type: 'NOTIFY', message: '' }, { type: 'HACK' }] },
    ], now)
    expect(r.map((x) => x.name)).toEqual(['ok'])
    expect(r[0]).toMatchObject({ active: true, hours: 0, createdAt: now.toISOString() })
    expect(r[0].id).toMatch(/^auto-/)
  })

  it('normaliza ações, horas e condições por gatilho', () => {
    const [r] = sanitizeAutomations([{
      id: 'a1', name: 'parado', trigger: 'NO_CONTACT', hours: 0, createdAt: '2026-01-01T00:00:00Z',
      conditions: { stageId: 'st1', sources: ['autoconf', 'autoconf'], temperatures: [] },
      actions: [{ type: 'CREATE_TASK', title: 'Ligar', taskType: 'XX', dueInHours: -3 }, { type: 'SET_TEMPERATURE', value: 'LAVA' }, { type: 'NOTIFY', target: 'MANAGERS', message: 'm' }],
    }], now)
    expect(r.hours).toBe(1)
    expect(r.conditions).toEqual({ sources: ['AUTOCONF'] }) // stageId só vale p/ STAGE_ENTERED
    expect(r.actions).toEqual([{ type: 'CREATE_TASK', title: 'Ligar', taskType: 'FOLLOW_UP', dueInHours: 0 }, { type: 'NOTIFY', target: 'MANAGERS', message: 'm' }])
    expect(r.createdAt).toBe('2026-01-01T00:00:00Z')
  })

  it('ids provisórios/duplicados viram ids novos', () => {
    const r = sanitizeAutomations([
      { id: 'new-1', name: 'a', trigger: 'LEAD_CREATED', actions: [{ type: 'ADD_TAG', tagId: 't' }] },
      { id: 'x', name: 'b', trigger: 'LEAD_CREATED', actions: [{ type: 'ADD_TAG', tagId: 't' }] },
      { id: 'x', name: 'c', trigger: 'LEAD_CREATED', actions: [{ type: 'ADD_TAG', tagId: 't' }] },
    ], now)
    expect(new Set(r.map((x) => x.id)).size).toBe(3)
    expect(r[1].id).toBe('x')
  })
})

describe('ruleMatches', () => {
  const lead: AutomationLeadCtx = { pipelineId: 'p1', stageId: 's2', status: 'QUALIFIED', source: 'AutoConf', leadType: 'troca', temperature: 'HOT' }
  const base: AutomationRule = { id: 'r', name: 'r', active: true, trigger: 'STAGE_ENTERED', hours: 0, conditions: {}, actions: [{ type: 'ADD_TAG', tagId: 't' }], createdAt: now.toISOString() }

  it('gatilho e ativa', () => {
    expect(ruleMatches(base, { trigger: 'STAGE_ENTERED', lead })).toBe(true)
    expect(ruleMatches(base, { trigger: 'LEAD_CREATED', lead })).toBe(false)
    expect(ruleMatches({ ...base, active: false }, { trigger: 'STAGE_ENTERED', lead })).toBe(false)
  })

  it('condições em E, origem sem diferenciar maiúsculas', () => {
    const ev = { trigger: 'STAGE_ENTERED' as const, lead }
    expect(ruleMatches({ ...base, conditions: { stageId: 's2', sources: ['AUTOCONF'], leadTypes: ['troca'], temperatures: ['HOT'], pipelineId: 'p1' } }, ev)).toBe(true)
    expect(ruleMatches({ ...base, conditions: { stageId: 's3' } }, ev)).toBe(false)
    expect(ruleMatches({ ...base, conditions: { statusCode: 'QUALIFIED' } }, ev)).toBe(true)
    expect(ruleMatches({ ...base, conditions: { statusCode: 'LOST' } }, ev)).toBe(false)
    expect(ruleMatches({ ...base, conditions: { leadTypes: ['compra'] } }, ev)).toBe(false)
    expect(ruleMatches({ ...base, conditions: { temperatures: ['COLD'] } }, { trigger: 'STAGE_ENTERED', lead: { ...lead, temperature: null } })).toBe(false)
  })

  it('matchingRules filtra a lista', () => {
    expect(matchingRules([base, { ...base, id: 'x', conditions: { pipelineId: 'p9' } }], { trigger: 'STAGE_ENTERED', lead }).map((r) => r.id)).toEqual(['r'])
  })
})

describe('auxiliares', () => {
  it('marcas só com strings', () => {
    expect(readAutomationMarks({ automations: { a: 'done', b: 3 } })).toEqual({ a: 'done' })
    expect(readAutomationMarks(null)).toEqual({})
  })
  it('descrição das ações', () => {
    expect(describeAction({ type: 'CREATE_TASK', title: 'Ligar', taskType: 'CALL', dueInHours: 24 })).toBe('Criar tarefa "Ligar" (em 24h)')
    expect(describeAction({ type: 'NOTIFY', target: 'MANAGERS', message: 'x' })).toBe('Avisar gestores')
  })
})
