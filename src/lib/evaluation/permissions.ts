// =============================================================================
// RBAC para o módulo Avaliação de Veículos.
// Centraliza regras de visualização, edição, reavaliação, finalização e reabertura.
// =============================================================================

const MANAGER_PLUS = new Set(['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'])
const ADM_PLUS     = new Set(['MASTER', 'ADM'])
const EDITABLE_STATUS = new Set(['DRAFT', 'IN_PROGRESS', 'PENDING_REVIEW', 'REOPENED'])

export interface EvaluationContext {
  status:           string
  tenantId?:        string | null
  unitId?:          string | null
  evaluatorId?:     string | null
}

export interface SessionUser {
  id:        string
  role:      string
  tenantId?: string | null
  unitId?:   string | null
}

/** O usuário pode visualizar a avaliação? Considera tenant isolation. */
export function canViewEvaluation(user: SessionUser, e: EvaluationContext): boolean {
  if (user.role === 'MASTER') return true
  if (e.tenantId && user.tenantId && e.tenantId !== user.tenantId) return false
  // VENDEDOR pode visualizar (a negociação dele pode estar vinculada)
  return true
}

/** O usuário pode editar campos comuns da avaliação? */
export function canEditEvaluation(user: SessionUser, e: EvaluationContext): boolean {
  if (!canViewEvaluation(user, e)) return false
  if (!EDITABLE_STATUS.has(e.status)) {
    // Finalizada/aprovada/rejeitada: só ADM+ pode editar
    return ADM_PLUS.has(user.role)
  }
  // Em estados editáveis: gerência sempre pode; avaliador (dono) também.
  if (MANAGER_PLUS.has(user.role)) return true
  if (e.evaluatorId && e.evaluatorId === user.id) return true
  // VENDEDOR não edita; pode apenas solicitar reavaliação.
  return false
}

/** O usuário pode reavaliar um item (adicionar/editar serviço)? */
export function canRevaluateItem(user: SessionUser, e: EvaluationContext): boolean {
  return canEditEvaluation(user, e)
}

/** O usuário pode adicionar anexo? */
export function canUploadAttachment(user: SessionUser, e: EvaluationContext): boolean {
  return canEditEvaluation(user, e)
}

/** O usuário pode remover anexo? Removeção exige gerência+. */
export function canDeleteAttachment(user: SessionUser, e: EvaluationContext): boolean {
  if (!canViewEvaluation(user, e)) return false
  return MANAGER_PLUS.has(user.role)
}

/** O usuário pode remover serviço? */
export function canDeleteService(user: SessionUser, e: EvaluationContext): boolean {
  if (!canViewEvaluation(user, e)) return false
  // Em rascunho: o próprio avaliador pode remover.
  if (EDITABLE_STATUS.has(e.status) && e.evaluatorId === user.id) return true
  return MANAGER_PLUS.has(user.role)
}

/** O usuário pode finalizar a avaliação? */
export function canFinishEvaluation(user: SessionUser, e: EvaluationContext): boolean {
  if (!canViewEvaluation(user, e)) return false
  if (!EDITABLE_STATUS.has(e.status)) return false
  if (MANAGER_PLUS.has(user.role)) return true
  // Avaliador pode finalizar a própria avaliação.
  return e.evaluatorId === user.id
}

/** O usuário pode reabrir avaliação finalizada/aprovada/rejeitada? */
export function canReopenEvaluation(user: SessionUser, e: EvaluationContext): boolean {
  if (!canViewEvaluation(user, e)) return false
  // Reabertura é ação sensível: somente gerência+.
  return MANAGER_PLUS.has(user.role)
}

/** O usuário pode aprovar/rejeitar serviços? */
export function canApproveServices(user: SessionUser): boolean {
  return MANAGER_PLUS.has(user.role)
}
