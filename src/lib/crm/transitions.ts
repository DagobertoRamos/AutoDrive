// =============================================================================
// CRM F3 — Kanban profissional: validação de TRANSIÇÃO de etapa. Função PURA
// (sem I/O) para ficar 100% testada. Decide se um lead pode ir de `fromCode`
// para `toCode` dado o config das etapas (CrmStageConfig) e os dados do lead —
// bloqueia pular/retroceder quando a etapa não permite, e exige campos
// obrigatórios da etapa DE DESTINO. Defaults das etapas são irrestritos, então
// nada quebra até o admin configurar regras mais rígidas.
// =============================================================================

import type { CrmStageConfig } from './config'

export interface TransitionLeadData {
  name?: string | null
  phone?: string | null
  email?: string | null
  vehicleId?: string | null
  assignedToUserId?: string | null
}

export interface TransitionResult {
  ok: boolean
  reason?: string
  missingFields?: string[]
}

const FIELD_LABEL: Record<string, string> = {
  name: 'Nome', phone: 'Telefone', email: 'E-mail', vehicleId: 'Veículo de interesse', assignedToUserId: 'Responsável',
}

/** Um valor de campo do lead conta como "preenchido"? */
function hasValue(lead: TransitionLeadData, field: string): boolean {
  const v = (lead as Record<string, unknown>)[field]
  return typeof v === 'string' ? v.trim().length > 0 : v != null
}

export function validateStageTransition(opts: {
  fromCode: string
  toCode: string
  stages: CrmStageConfig[]
  lead: TransitionLeadData
}): TransitionResult {
  const { fromCode, toCode, stages, lead } = opts
  if (fromCode === toCode) return { ok: true }

  const from = stages.find((s) => s.code === fromCode)
  const to = stages.find((s) => s.code === toCode)
  if (!to) return { ok: false, reason: 'Etapa de destino desconhecida.' }
  if (!to.active) return { ok: false, reason: `A etapa "${to.displayName}" está desativada.` }

  // Regras de ordem (pular/retroceder) — só se sabemos a etapa de origem.
  if (from) {
    const forward = to.order > from.order
    const backward = to.order < from.order
    const isSkip = forward && to.order - from.order > 1
    if (isSkip && !from.allowSkip) {
      return { ok: false, reason: `A etapa "${from.displayName}" não permite pular etapas. Avance uma de cada vez.` }
    }
    if (backward && !from.allowBack) {
      return { ok: false, reason: `A etapa "${from.displayName}" não permite retroceder.` }
    }
  }

  // Campos obrigatórios para ENTRAR na etapa de destino.
  const missing = (to.requiredFields ?? []).filter((f) => !hasValue(lead, f))
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `Para mover para "${to.displayName}", preencha: ${missing.map((f) => FIELD_LABEL[f] ?? f).join(', ')}.`,
      missingFields: missing,
    }
  }

  return { ok: true }
}
