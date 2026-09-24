// =============================================================================
// CRM Pipelines — núcleo PURO (sem I/O, client-safe, 100% testado).
//
// Modelo: cada funil tem etapas livres; cada etapa aponta para um código do
// LeadStatus (statusCode). O status do lead continua sendo a verdade para
// integrações/relatórios; a etapa é "onde o lead está no funil".
//
// Regra de resolução da etapa efetiva de um lead:
//   1. placement.stageId, se a etapa existe, está ativa e bate com o status
//      atual (outros fluxos — converter, perder, SDR — mudam só o status);
//   2. senão, a primeira etapa ativa do funil com statusCode = status;
//   3. senão, null ("sem etapa neste funil").
// =============================================================================

import { CRM_REQUIRABLE_FIELDS } from './shared'

export const LEAD_STATUS_CODES = ['NEW', 'ASSIGNED', 'WORKING', 'QUALIFIED', 'CONVERTED', 'LOST', 'DISCARDED', 'RECYCLED'] as const
export type LeadStatusCode = (typeof LEAD_STATUS_CODES)[number]

export const STATUS_CATEGORY: Record<string, string> = {
  NEW: 'OPEN', ASSIGNED: 'OPEN', WORKING: 'OPEN', QUALIFIED: 'OPEN',
  CONVERTED: 'CONVERTED', LOST: 'LOST', DISCARDED: 'DISQUALIFIED', RECYCLED: 'RECYCLED',
}

/** Id do funil padrão enquanto o tenant não salvou nenhum funil (virtual). */
export const VIRTUAL_PIPELINE_ID = 'default'
/** Etapas do funil virtual: `status:NEW`, `status:WORKING`… */
export const virtualStageId = (code: string) => `status:${code}`

export interface PipelineStage {
  id: string
  pipelineId: string
  name: string
  color: string
  order: number
  active: boolean
  statusCode: string
  category: string
  requiredFields: string[]
  allowSkip: boolean
  allowBack: boolean
}

export interface Pipeline {
  id: string
  name: string
  description: string | null
  color: string | null
  order: number
  active: boolean
  isDefault: boolean
  /** true = funil padrão montado dos defaults/crm_stages (nada gravado ainda). */
  virtual: boolean
  stages: PipelineStage[]
}

export interface LeadPlacementRef {
  pipelineId: string | null
  stageId: string | null
}

export function isLeadStatusCode(v: unknown): v is LeadStatusCode {
  return typeof v === 'string' && (LEAD_STATUS_CODES as readonly string[]).includes(v)
}

export function sortedStages(p: Pipeline): PipelineStage[] {
  return [...p.stages].sort((a, b) => a.order - b.order)
}

export function defaultPipelineOf(pipelines: Pipeline[]): Pipeline | null {
  return pipelines.find((p) => p.isDefault) ?? pipelines[0] ?? null
}

/** Funil efetivo do lead: o do placement (mesmo inativo) ou o padrão. */
export function resolveLeadPipeline(pipelines: Pipeline[], placementPipelineId: string | null | undefined): Pipeline | null {
  if (placementPipelineId) {
    const p = pipelines.find((x) => x.id === placementPipelineId)
    if (p) return p
  }
  return defaultPipelineOf(pipelines)
}

/** Etapa efetiva do lead dentro do funil (ver regra no topo do arquivo). */
export function resolveLeadStage(
  pipeline: Pipeline,
  status: string,
  placementStageId: string | null | undefined,
): PipelineStage | null {
  if (placementStageId) {
    const s = pipeline.stages.find((x) => x.id === placementStageId)
    if (s && s.active && s.statusCode === status) return s
  }
  return sortedStages(pipeline).find((s) => s.active && s.statusCode === status) ?? null
}

/**
 * Etapa de chegada quando o lead troca de funil sem etapa explícita: mantém o
 * status se o funil destino tiver etapa para ele; senão, a primeira etapa
 * ABERTA ativa; senão, a primeira ativa.
 */
export function landingStage(pipeline: Pipeline, status: string): PipelineStage | null {
  const active = sortedStages(pipeline).filter((s) => s.active)
  return (
    active.find((s) => s.statusCode === status) ??
    active.find((s) => s.category === 'OPEN') ??
    active[0] ??
    null
  )
}

export type MovePlan =
  | {
      ok: true
      fromPipeline: Pipeline
      fromStage: PipelineStage | null
      toPipeline: Pipeline
      toStage: PipelineStage
      changesPipeline: boolean
      changesStage: boolean
    }
  | { ok: false; status: number; error: string }

/**
 * Planeja a movimentação de um lead para (funil, etapa). Não valida regras de
 * transição/campos — isso é do validateStageTransition; aqui só resolve origem e
 * destino e rejeita alvos inexistentes/inativos.
 */
export function planLeadMove(opts: {
  pipelines: Pipeline[]
  leadStatus: string
  placement: LeadPlacementRef | null
  targetPipelineId?: string | null
  targetStageId?: string | null
}): MovePlan {
  const { pipelines, leadStatus, placement } = opts
  const fromPipeline = resolveLeadPipeline(pipelines, placement?.pipelineId)
  if (!fromPipeline) return { ok: false, status: 500, error: 'Nenhum funil configurado.' }
  const fromStage = resolveLeadStage(fromPipeline, leadStatus, placement?.stageId)

  let toPipeline = fromPipeline
  if (opts.targetPipelineId && opts.targetPipelineId !== fromPipeline.id) {
    const p = pipelines.find((x) => x.id === opts.targetPipelineId)
    if (!p) return { ok: false, status: 400, error: 'Funil de destino não encontrado.' }
    if (!p.active) return { ok: false, status: 409, error: `O funil "${p.name}" está desativado.` }
    toPipeline = p
  }

  let toStage: PipelineStage | null
  if (opts.targetStageId) {
    toStage = toPipeline.stages.find((s) => s.id === opts.targetStageId) ?? null
    if (!toStage) return { ok: false, status: 400, error: 'Etapa de destino não pertence a este funil.' }
    if (!toStage.active) return { ok: false, status: 409, error: `A etapa "${toStage.name}" está desativada.` }
  } else {
    toStage = landingStage(toPipeline, leadStatus)
    if (!toStage) return { ok: false, status: 409, error: `O funil "${toPipeline.name}" não tem etapas ativas.` }
  }

  const changesPipeline = toPipeline.id !== fromPipeline.id
  return {
    ok: true, fromPipeline, fromStage, toPipeline, toStage,
    changesPipeline,
    changesStage: changesPipeline || fromStage?.id !== toStage.id,
  }
}

// ── Sanitização do payload de funil (config) ─────────────────────────────────

export interface PipelineStageInput {
  id?: string
  name: string
  color: string | null
  active: boolean
  statusCode: LeadStatusCode
  requiredFields: string[]
  allowSkip: boolean
  allowBack: boolean
}

export interface PipelineInput {
  name: string
  description: string | null
  color: string | null
  active: boolean
  stages: PipelineStageInput[]
}

const HEX = /^#[0-9a-fA-F]{6}$/
const VALID_FIELDS = new Set<string>(CRM_REQUIRABLE_FIELDS.map((f) => f.key))
export const MAX_PIPELINE_STAGES = 20

/** Valida/normaliza o corpo de criação/edição de funil. Ordem = ordem do array. */
export function sanitizePipelineInput(body: unknown): { ok: true; value: PipelineInput } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const name = String(b.name ?? '').trim().slice(0, 60)
  if (!name) return { ok: false, error: 'Informe o nome do funil.' }
  const rawStages = Array.isArray(b.stages) ? b.stages : []
  if (rawStages.length === 0) return { ok: false, error: 'O funil precisa de pelo menos uma etapa.' }
  if (rawStages.length > MAX_PIPELINE_STAGES) return { ok: false, error: `Máximo de ${MAX_PIPELINE_STAGES} etapas por funil.` }

  const stages: PipelineStageInput[] = []
  for (const [i, raw] of rawStages.entries()) {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const stageName = String(s.name ?? '').trim().slice(0, 60)
    if (!stageName) return { ok: false, error: `Dê um nome à etapa ${i + 1}.` }
    if (!isLeadStatusCode(s.statusCode)) return { ok: false, error: `Escolha o status da etapa "${stageName}".` }
    stages.push({
      ...(typeof s.id === 'string' && s.id ? { id: s.id } : {}),
      name: stageName,
      color: typeof s.color === 'string' && HEX.test(s.color) ? s.color : null,
      active: s.active === undefined ? true : Boolean(s.active),
      statusCode: s.statusCode,
      requiredFields: Array.isArray(s.requiredFields)
        ? [...new Set(s.requiredFields.filter((f): f is string => typeof f === 'string' && VALID_FIELDS.has(f)))]
        : [],
      allowSkip: s.allowSkip === undefined ? true : Boolean(s.allowSkip),
      allowBack: s.allowBack === undefined ? true : Boolean(s.allowBack),
    })
  }
  if (!stages.some((s) => s.active)) return { ok: false, error: 'Deixe pelo menos uma etapa ativa.' }

  return {
    ok: true,
    value: {
      name,
      description: String(b.description ?? '').trim().slice(0, 200) || null,
      color: typeof b.color === 'string' && HEX.test(b.color) ? b.color : null,
      active: b.active === undefined ? true : Boolean(b.active),
      stages,
    },
  }
}
