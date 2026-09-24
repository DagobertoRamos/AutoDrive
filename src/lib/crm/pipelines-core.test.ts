import { describe, it, expect } from 'vitest'
import {
  resolveLeadPipeline, resolveLeadStage, landingStage, planLeadMove, sanitizePipelineInput,
  type Pipeline, type PipelineStage,
} from './pipelines-core'

function stage(id: string, statusCode: string, order: number, extra: Partial<PipelineStage> = {}): PipelineStage {
  const category = ['CONVERTED', 'LOST', 'DISCARDED', 'RECYCLED'].includes(statusCode)
    ? ({ CONVERTED: 'CONVERTED', LOST: 'LOST', DISCARDED: 'DISQUALIFIED', RECYCLED: 'RECYCLED' } as Record<string, string>)[statusCode]
    : 'OPEN'
  return { id, pipelineId: 'p', name: id, color: '#000000', order, active: true, statusCode, category, requiredFields: [], allowSkip: true, allowBack: true, ...extra }
}

const vendas: Pipeline = {
  id: 'vendas', name: 'Vendas', description: null, color: null, order: 0, active: true, isDefault: true, virtual: false,
  stages: [
    stage('v-novo', 'NEW', 0),
    stage('v-contato', 'WORKING', 1),
    stage('v-proposta', 'WORKING', 2),
    stage('v-ganho', 'CONVERTED', 3),
    stage('v-perdido', 'LOST', 4),
  ],
}
const repasse: Pipeline = {
  id: 'repasse', name: 'Repasse', description: null, color: null, order: 1, active: true, isDefault: false, virtual: false,
  stages: [
    stage('r-avaliacao', 'QUALIFIED', 0),
    stage('r-oferta', 'WORKING', 1),
    stage('r-off', 'NEW', 2, { active: false }),
  ],
}
const inativo: Pipeline = { ...repasse, id: 'inativo', name: 'Antigo', isDefault: false, active: false }
const all = [vendas, repasse, inativo]

describe('resolveLeadPipeline', () => {
  it('sem placement → funil padrão', () => {
    expect(resolveLeadPipeline(all, null)?.id).toBe('vendas')
  })
  it('placement aponta para funil existente (mesmo inativo)', () => {
    expect(resolveLeadPipeline(all, 'repasse')?.id).toBe('repasse')
    expect(resolveLeadPipeline(all, 'inativo')?.id).toBe('inativo')
  })
  it('placement órfão → padrão', () => {
    expect(resolveLeadPipeline(all, 'sumiu')?.id).toBe('vendas')
  })
})

describe('resolveLeadStage', () => {
  it('usa o stageId do placement quando bate com o status', () => {
    expect(resolveLeadStage(vendas, 'WORKING', 'v-proposta')?.id).toBe('v-proposta')
  })
  it('stageId desatualizado (status mudou por outro fluxo) → etapa pelo status', () => {
    expect(resolveLeadStage(vendas, 'LOST', 'v-proposta')?.id).toBe('v-perdido')
  })
  it('sem placement → primeira etapa ativa do status', () => {
    expect(resolveLeadStage(vendas, 'WORKING', null)?.id).toBe('v-contato')
  })
  it('ignora etapa inativa', () => {
    expect(resolveLeadStage(repasse, 'NEW', 'r-off')).toBeNull()
  })
  it('status sem etapa no funil → null', () => {
    expect(resolveLeadStage(repasse, 'CONVERTED', null)).toBeNull()
  })
})

describe('landingStage', () => {
  it('mantém o status se o funil tiver etapa para ele', () => {
    expect(landingStage(repasse, 'WORKING')?.id).toBe('r-oferta')
  })
  it('senão cai na primeira etapa aberta', () => {
    expect(landingStage(repasse, 'CONVERTED')?.id).toBe('r-avaliacao')
  })
})

describe('planLeadMove', () => {
  it('move dentro do funil', () => {
    const r = planLeadMove({ pipelines: all, leadStatus: 'WORKING', placement: null, targetStageId: 'v-proposta' })
    expect(r.ok && r.fromStage?.id).toBe('v-contato')
    expect(r.ok && r.toStage.id).toBe('v-proposta')
    expect(r.ok && r.changesPipeline).toBe(false)
    expect(r.ok && r.changesStage).toBe(true)
  })
  it('mesma etapa → sem mudança', () => {
    const r = planLeadMove({ pipelines: all, leadStatus: 'WORKING', placement: { pipelineId: 'vendas', stageId: 'v-contato' }, targetStageId: 'v-contato' })
    expect(r.ok && r.changesStage).toBe(false)
  })
  it('troca de funil sem etapa → etapa de chegada', () => {
    const r = planLeadMove({ pipelines: all, leadStatus: 'NEW', placement: null, targetPipelineId: 'repasse' })
    expect(r.ok && r.toPipeline.id).toBe('repasse')
    expect(r.ok && r.toStage.id).toBe('r-avaliacao')
    expect(r.ok && r.changesPipeline).toBe(true)
  })
  it('rejeita etapa de outro funil', () => {
    const r = planLeadMove({ pipelines: all, leadStatus: 'NEW', placement: null, targetStageId: 'r-oferta' })
    expect(r.ok).toBe(false)
  })
  it('rejeita etapa inativa e funil inativo', () => {
    expect(planLeadMove({ pipelines: all, leadStatus: 'NEW', placement: { pipelineId: 'repasse', stageId: null }, targetStageId: 'r-off' }).ok).toBe(false)
    const r = planLeadMove({ pipelines: all, leadStatus: 'NEW', placement: null, targetPipelineId: 'inativo' })
    expect(!r.ok && r.status).toBe(409)
  })
})

describe('sanitizePipelineInput', () => {
  const ok = { name: ' Repasse ', stages: [{ name: 'Avaliação', statusCode: 'QUALIFIED', color: '#10b981', requiredFields: ['phone', 'phone', 'hack'] }] }
  it('normaliza nome, cor, campos e defaults', () => {
    const r = sanitizePipelineInput(ok)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.name).toBe('Repasse')
    expect(r.value.stages[0]).toMatchObject({ active: true, allowSkip: true, allowBack: true, requiredFields: ['phone'], color: '#10b981' })
  })
  it('exige nome, etapas, status válido e uma etapa ativa', () => {
    expect(sanitizePipelineInput({ ...ok, name: '' }).ok).toBe(false)
    expect(sanitizePipelineInput({ ...ok, stages: [] }).ok).toBe(false)
    expect(sanitizePipelineInput({ ...ok, stages: [{ name: 'X', statusCode: 'FOO' }] }).ok).toBe(false)
    expect(sanitizePipelineInput({ ...ok, stages: [{ name: '', statusCode: 'NEW' }] }).ok).toBe(false)
    expect(sanitizePipelineInput({ ...ok, stages: [{ name: 'X', statusCode: 'NEW', active: false }] }).ok).toBe(false)
  })
  it('preserva id de etapa existente', () => {
    const r = sanitizePipelineInput({ name: 'A', stages: [{ id: 'abc', name: 'X', statusCode: 'NEW' }] })
    expect(r.ok && r.value.stages[0].id).toBe('abc')
  })
})
