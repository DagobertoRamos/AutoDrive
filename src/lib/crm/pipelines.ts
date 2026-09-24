// =============================================================================
// CRM Pipelines — camada de dados. TOLERANTE: sem a migration crm_pipelines (ou
// sem nenhum funil salvo) devolve o funil padrão VIRTUAL, montado das etapas
// configuradas em crm_stages (F1/F3). O primeiro salvamento de funil
// "materializa" esse padrão em linhas reais, preservando nomes/cores/regras.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { loadStages } from './config'
import { STATUS_CATEGORY, VIRTUAL_PIPELINE_ID, virtualStageId, type Pipeline, type PipelineStage, type LeadPlacementRef } from './pipelines-core'
import { CRM_REQUIRABLE_FIELDS } from './shared'

export * from './pipelines-core'

const DEFAULT_PIPELINE_NAME = 'Funil principal'
const VALID_FIELDS = new Set<string>(CRM_REQUIRABLE_FIELDS.map((f) => f.key))

function parseRequiredFields(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && VALID_FIELDS.has(x)) : []
}

async function virtualPipeline(tenantId: string): Promise<Pipeline> {
  const stages = await loadStages(tenantId)
  return {
    id: VIRTUAL_PIPELINE_ID, name: DEFAULT_PIPELINE_NAME, description: null, color: null,
    order: 0, active: true, isDefault: true, virtual: true,
    stages: stages.map((s) => ({
      id: virtualStageId(s.code), pipelineId: VIRTUAL_PIPELINE_ID, name: s.displayName, color: s.color,
      order: s.order, active: s.active, statusCode: s.code, category: STATUS_CATEGORY[s.code] ?? 'OPEN',
      requiredFields: s.requiredFields, allowSkip: s.allowSkip, allowBack: s.allowBack,
    })),
  }
}

type PipelineRow = Prisma.CrmPipelineGetPayload<{ include: { stages: true } }>

function toPipeline(row: PipelineRow): Pipeline {
  return {
    id: row.id, name: row.name, description: row.description, color: row.color,
    order: row.order, active: row.active, isDefault: row.isDefault, virtual: false,
    stages: row.stages
      .map((s): PipelineStage => ({
        id: s.id, pipelineId: row.id, name: s.name, color: s.color || '#6b7280',
        order: s.order, active: s.active, statusCode: s.statusCode, category: STATUS_CATEGORY[s.statusCode] ?? 'OPEN',
        requiredFields: parseRequiredFields(s.requiredFields), allowSkip: s.allowSkip, allowBack: s.allowBack,
      }))
      .sort((a, b) => a.order - b.order),
  }
}

/** Funis do tenant (ordenados; o padrão primeiro). Nunca vazio. */
export async function loadPipelines(tenantId: string): Promise<Pipeline[]> {
  try {
    const rows = await prisma.crmPipeline.findMany({ where: { tenantId }, include: { stages: true } })
    if (rows.length) {
      return rows.map(toPipeline).sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.order - b.order || a.name.localeCompare(b.name))
    }
  } catch {
    // tabela ainda não migrada → funil virtual
  }
  return [await virtualPipeline(tenantId)]
}

/** Os funis já foram gravados (tabelas existem e há linhas)? */
export function isMaterialized(pipelines: Pipeline[]): boolean {
  return pipelines.some((p) => !p.virtual)
}

/**
 * Grava o funil padrão a partir do virtual, se ainda não existir. Idempotente
 * (re-checa dentro da transação). Lança se a migration não foi aplicada.
 * Devolve o id real do funil padrão.
 */
export async function materializeDefaultPipeline(tenantId: string): Promise<string> {
  const virtual = await virtualPipeline(tenantId)
  return prisma.$transaction(async (tx) => {
    const existing = await tx.crmPipeline.findFirst({ where: { tenantId, isDefault: true }, select: { id: true } })
    if (existing) return existing.id
    const created = await tx.crmPipeline.create({
      data: {
        tenantId, name: virtual.name, order: 0, active: true, isDefault: true,
        stages: {
          create: virtual.stages.map((s) => ({
            tenantId, name: s.name, color: s.color, order: s.order, active: s.active, statusCode: s.statusCode,
            requiredFields: s.requiredFields, allowSkip: s.allowSkip, allowBack: s.allowBack,
          })),
        },
      },
      select: { id: true },
    })
    return created.id
  })
}

/** Placement do lead (null se não tiver ou se a tabela não existir). */
export async function loadPlacement(leadId: string): Promise<LeadPlacementRef | null> {
  try {
    const p = await prisma.crmLeadPlacement.findUnique({ where: { leadId }, select: { pipelineId: true, stageId: true } })
    return p ?? null
  } catch {
    return null
  }
}

/** Placements em lote (mapa leadId → ref). Tolerante. */
export async function loadPlacements(leadIds: string[]): Promise<Map<string, LeadPlacementRef>> {
  if (!leadIds.length) return new Map()
  try {
    const rows = await prisma.crmLeadPlacement.findMany({ where: { leadId: { in: leadIds } }, select: { leadId: true, pipelineId: true, stageId: true } })
    return new Map(rows.map((r) => [r.leadId, { pipelineId: r.pipelineId, stageId: r.stageId }]))
  } catch {
    return new Map()
  }
}

/** Grava funil/etapa do lead. `stageChanged` reinicia o relógio da etapa. */
export async function savePlacement(opts: {
  tenantId: string
  leadId: string
  pipelineId: string
  stageId: string | null
  stageChanged: boolean
}): Promise<void> {
  const { tenantId, leadId, pipelineId, stageId, stageChanged } = opts
  await prisma.crmLeadPlacement.upsert({
    where: { leadId },
    create: { tenantId, leadId, pipelineId, stageId },
    update: { pipelineId, stageId, ...(stageChanged ? { enteredStageAt: new Date() } : {}) },
  })
}

/** Filtro Prisma de leads que pertencem ao funil (inclui sem placement no padrão). */
export function pipelineLeadWhere(pipeline: Pipeline): Prisma.MarketingLeadWhereInput {
  if (pipeline.virtual) return {}
  return pipeline.isDefault
    ? { OR: [{ placement: { is: null } }, { placement: { is: { pipelineId: pipeline.id } } }] }
    : { placement: { is: { pipelineId: pipeline.id } } }
}
