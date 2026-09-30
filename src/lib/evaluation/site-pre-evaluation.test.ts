import { describe, expect, it } from 'vitest'
import { ITEMS, type SectionKey } from './catalog'
import { canEvaluationVehicleBeUsed } from './availability'
import { blockConfirmStockEntry, blockRequestStockEntry } from './stock-entry-core'
import {
  activeSteps, buildPreEvalItems, DAMAGE_SHOT, findShot, intentionFromGoal, needsManagerReview, parseBrl, parseInspection,
  parseKm, parseYears, PRE_EVAL_MAX_PHOTOS, PRE_EVAL_STEPS, SITE_PRE_EVAL_SOURCE,
} from './site-pre-evaluation'

const inCatalog = (section: SectionKey, key: string) => ITEMS[section].some((i) => i.key === key)

describe('etapas da pré-avaliação do site', () => {
  it('segue a ordem pedida (painel → … → pneus esquerdos)', () => {
    expect(PRE_EVAL_STEPS.map((s) => s.key)).toEqual([
      'painel', 'interior', 'frente', 'motor', 'teto', 'lateral_direita', 'pneus_direitos',
      'traseira', 'placa', 'porta_malas', 'estepe', 'lateral_esquerda', 'pneus_esquerdos',
    ])
  })
  it('todo item citado existe no catálogo da seção', () => {
    for (const s of PRE_EVAL_STEPS) {
      expect(inCatalog(s.section, s.damageKey), s.damageKey).toBe(true)
      for (const shot of s.shots) if (shot.catalogKey) expect(inCatalog(s.section, shot.catalogKey), shot.catalogKey).toBe(true)
    }
  })
  it('teto solar só entra quando o carro tem', () => {
    expect(activeSteps(false).some((s) => s.key === 'teto')).toBe(false)
    expect(activeSteps(true).some((s) => s.key === 'teto')).toBe(true)
  })
  it('acha a foto pela etapa, inclusive a de avaria', () => {
    expect(findShot('pneus_direitos', 'traseiro')?.catalogKey).toBe('direita.pneu_traseiro')
    expect(findShot('frente', DAMAGE_SHOT)?.catalogKey).toBe('frente.recuperacao_frente')
    expect(findShot('frente', 'x')).toBeNull()
    expect(findShot('nada', 'foto')).toBeNull()
    expect(PRE_EVAL_MAX_PHOTOS).toBe(28)
  })
})

describe('parseInspection', () => {
  const base = { sunroof: false, tires: { RIGHT: 'BOM', LEFT: 'TROCAR' }, damages: {} }
  it('exige a condição dos pneus', () => {
    expect(parseInspection({ ...base, tires: { RIGHT: 'BOM' } }).ok).toBe(false)
    expect(parseInspection({ ...base, tires: { RIGHT: 'BOM', LEFT: 'xx' } }).ok).toBe(false)
  })
  it('exige descrição da avaria marcada e ignora etapas desconhecidas', () => {
    expect(parseInspection({ ...base, damages: { frente: '' } })).toEqual({ ok: false, error: 'Descreva a avaria marcada em "Frente".' })
    const r = parseInspection({ ...base, damages: { frente: 'risco no capô', hack: 'x', teto: 'sem teto' } })
    expect(r.ok && r.value.damages).toEqual({ frente: 'risco no capô' })
  })
})

describe('buildPreEvalItems', () => {
  it('marca avarias, pneus e teto nos itens certos', () => {
    const items = buildPreEvalItems({ sunroof: false, tires: { RIGHT: 'MEIA_VIDA', LEFT: 'TROCAR' }, damages: { frente: 'amassado', painel: 'luz de injeção acesa' } })
    const by = Object.fromEntries(items.map((i) => [i.catalogKey, i]))
    expect(by['frente.teto_solar'].status).toBe('NA')
    expect(by['direita.pneu_dianteiro'].status).toBe('ATENCAO')
    expect(by['esquerda.pneu_traseiro'].status).toBe('REPARO')
    expect(by['frente.recuperacao_frente']).toMatchObject({ status: 'ATENCAO', section: 'FRENTE' })
    expect(by['frente.recuperacao_frente'].notes).toContain('amassado')
    expect(by['interior.painel_km'].status).toBe('ATENCAO')
    expect(by['interior.painel_km'].notes).toContain('Foto enviada')
    expect(by['frente.motor'].status).toBe('CONFORME')
    expect(new Set(items.map((i) => i.catalogKey)).size).toBe(items.length)
  })
})

describe('conversões', () => {
  it('ano, valor, km e objetivo', () => {
    expect(parseYears('2020/2021')).toEqual({ manufactureYear: 2020, modelYear: 2021 })
    expect(parseYears('2019')).toEqual({ manufactureYear: 2019, modelYear: 2019 })
    expect(parseYears('abc')).toEqual({ manufactureYear: null, modelYear: null })
    expect(parseBrl('R$ 45.900,50')).toBe(45900.5)
    expect(parseBrl('')).toBeNull()
    expect(parseKm('65.000 km')).toBe(65000)
    expect(intentionFromGoal('Vender')).toBe('COMPRA')
    expect(intentionFromGoal('Trocar por outro carro')).toBe('TROCA')
    expect(intentionFromGoal(undefined)).toBe('APENAS_AVALIACAO')
  })
})

describe('conferência da gerência antes de negociar', () => {
  const site = { status: 'LIBERADA', evaluatedValue: 50000, customerDecision: 'ACEITA', lookupSource: SITE_PRE_EVAL_SOURCE }
  it('pré-avaliação do site liberada pelo sistema não entra em negociação', () => {
    expect(needsManagerReview({ lookupSource: SITE_PRE_EVAL_SOURCE, releasedByUserId: null })).toBe(true)
    const r = canEvaluationVehicleBeUsed({ ...site, releasedByUserId: null }, 'TROCA')
    expect(r.canUse).toBe(false)
    expect(r.reason).toMatch(/gerência precisa conferir/)
  })
  it('depois da conferência (gerente liberou) segue a regra normal', () => {
    expect(canEvaluationVehicleBeUsed({ ...site, releasedByUserId: 'u1' }, 'TROCA').canUse).toBe(true)
  })
  it('também não entra no estoque sem a conferência', () => {
    const ev = { status: 'LIBERADA', customerDecision: 'ACEITA', lookupSource: SITE_PRE_EVAL_SOURCE }
    expect(blockRequestStockEntry({ ...ev, releasedByUserId: null })).toMatch(/gerência precisa conferir/)
    expect(blockConfirmStockEntry({ ...ev, releasedByUserId: null })).toMatch(/gerência precisa conferir/)
    expect(blockConfirmStockEntry({ ...ev, releasedByUserId: 'u1' })).toBeNull()
  })
  it('avaliações feitas na loja não mudam', () => {
    expect(needsManagerReview({ lookupSource: 'manual', releasedByUserId: null })).toBe(false)
    expect(canEvaluationVehicleBeUsed({ ...site, lookupSource: null, releasedByUserId: null }, 'COMPRA').canUse).toBe(true)
  })
})
