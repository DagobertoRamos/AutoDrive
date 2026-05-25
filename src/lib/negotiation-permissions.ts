// =============================================================================
// negotiation-permissions.ts — Permissões de negociações
// =============================================================================

// Re-export: a checagem "status permite edição?" agora vive em negotiation-rbac.
// Callers que só conhecem o status devem usar isDealStatusEditable; quem possui
// actor + deal deve preferir canEditDeal(actor, deal) de negotiation-rbac.
import { isDealStatusEditable, canEditDeal } from '@/lib/negotiation-rbac'
export { isDealStatusEditable, canEditDeal }

const SELLER_ROLES   = ['VENDEDOR', 'VENDEDOR_LIDER']
const MANAGER_ROLES  = ['GERENTE', 'GERENTE_GERAL', 'ADM', 'MASTER']
const APPROVAL_ROLES = ['GERENTE', 'GERENTE_GERAL', 'ADM', 'MASTER', 'VENDEDOR_LIDER']
const ADMIN_ROLES    = ['ADM', 'MASTER']

// Exportados para uso nas rotas — evita duplicação de listas de status
export const EDITABLE_STATUSES    = ['RASCUNHO', 'EM_PREENCHIMENTO', 'DEVOLVIDA_PARA_CORRECAO', 'REABERTA']
export const SUBMITTABLE_STATUSES = new Set([...EDITABLE_STATUSES, 'REABERTA'])
export const APPROVABLE_STATUSES  = new Set(['AGUARDANDO_APROVACAO', 'AGUARDANDO_LIBERACAO'])
export const FINALIZABLE_STATUSES = new Set(['APROVADA', 'LIBERADA', 'ASSINADA', 'AGUARDANDO_ENTREGA', 'ENTREGUE'])
export const CANCELLABLE_BY_ALL   = new Set(['DESAPROVADA', 'RECUSADA'])

export const SENSITIVE_FIELDS: string[] = [
  'saleAmount',
  'purchaseAmount',
  'tradeValue',
  'discountAmount',
  'marginAmount',
  'financedAmount',
  'payoffAmount',
  'signalAmount',
  'sellerId',
  'managerId',
  'personId',
  'customerId',
  'vehicleValue',
]

export function canCreateDeal(role: string): boolean {
  return [...SELLER_ROLES, ...MANAGER_ROLES].includes(role)
}

export function canEditSensitiveFields(role: string): boolean {
  return [...MANAGER_ROLES, 'VENDEDOR_LIDER'].includes(role)
}

export function canSubmitForApproval(role: string): boolean {
  return [...SELLER_ROLES, ...MANAGER_ROLES].includes(role)
}

export function canApproveDeal(role: string): boolean {
  return APPROVAL_ROLES.includes(role)
}

export function canReturnForCorrection(role: string): boolean {
  return APPROVAL_ROLES.includes(role)
}

export function canCancelDeal(role: string, status: string): boolean {
  if (canForceCancelDeal(role)) return true
  if (role === 'VENDEDOR' || role === 'VENDEDOR_LIDER') {
    return status === 'DESAPROVADA' || status === 'RECUSADA'
  }
  return false
}

export function canForceCancelDeal(role: string): boolean {
  return [...MANAGER_ROLES].includes(role)
}

export function canReopenDeal(role: string): boolean {
  return ADMIN_ROLES.includes(role)
}

export function canFinalizeDeal(role: string): boolean {
  return MANAGER_ROLES.includes(role)
}

export function canViewAllDeals(role: string): boolean {
  return [...MANAGER_ROLES, 'VENDEDOR_LIDER'].includes(role)
}

export function canViewCrossUnit(role: string): boolean {
  return ['GERENTE_GERAL', 'ADM', 'MASTER'].includes(role)
}

export type DealAction =
  | 'edit'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'return_correction'
  | 'cancel'
  | 'reopen'
  | 'finalize'
  | 'edit_sensitive'

export function assertDealPermission(role: string, action: DealAction, status?: string): void {
  let allowed = false

  switch (action) {
    case 'edit':
      // assertDealPermission só recebe (role, status), então usamos a checagem
      // pura de status + uma verificação leve de role (sem actor completo).
      allowed = ([...MANAGER_ROLES, 'VENDEDOR_LIDER'].includes(role)
        ? isDealStatusEditable(status ?? '')
        : role === 'VENDEDOR' && EDITABLE_STATUSES.includes(status ?? ''))
      break
    case 'submit':
      allowed = canSubmitForApproval(role)
      break
    case 'approve':
      allowed = canApproveDeal(role)
      break
    case 'reject':
      allowed = canApproveDeal(role)
      break
    case 'return_correction':
      allowed = canReturnForCorrection(role)
      break
    case 'cancel':
      allowed = canCancelDeal(role, status ?? '')
      break
    case 'reopen':
      allowed = canReopenDeal(role)
      break
    case 'finalize':
      allowed = canFinalizeDeal(role)
      break
    case 'edit_sensitive':
      allowed = canEditSensitiveFields(role)
      break
  }

  if (!allowed) {
    throw new Error(`Sem permissão para executar ação '${action}' com role '${role}'`)
  }
}
