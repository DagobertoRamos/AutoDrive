// =============================================================================
// Helper de histórico/auditoria para o módulo de Avaliação.
// Grava em `evaluation_history` (best-effort) — nunca lança exceção.
// =============================================================================

import { prisma } from '@/lib/prisma'

export interface HistoryEntry {
  tenantId:    string
  evaluationId:string
  itemId?:     string | null
  serviceId?:  string | null
  userId?:     string
  userName?:   string
  userRole?:   string
  action:      string  // REVALUATE | ADD_SERVICE | UPDATE_SERVICE | REMOVE_SERVICE | ADD_ATTACHMENT | REMOVE_ATTACHMENT | FINISH | REOPEN | UPDATE_ITEM
  oldValue?:   unknown
  newValue?:   unknown
  notes?:      string
}

export async function recordHistory(p: HistoryEntry): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).evaluationHistory.create({
      data: {
        tenantId:     p.tenantId,
        evaluationId: p.evaluationId,
        itemId:       p.itemId    ?? null,
        serviceId:    p.serviceId ?? null,
        userId:       p.userId    ?? null,
        userName:     p.userName  ?? null,
        userRole:     p.userRole  ?? null,
        action:       p.action,
        oldValue:     p.oldValue != null ? (p.oldValue as object) : undefined,
        newValue:     p.newValue != null ? (p.newValue as object) : undefined,
        notes:        p.notes ?? null,
      },
    })
  } catch { /* tabela ainda não migrada — degrada silenciosamente */ }

  // Também grava em AuditLog (espelhamento leve, sem dados volumosos)
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: p.tenantId,
        userId:   p.userId ?? null,
        userName: p.userName ?? null,
        userRole: p.userRole ?? null,
        action:   `EVAL_${p.action}`,
        entity:   'VehicleEvaluation',
        entityId: p.evaluationId,
        status:   'SUCCESS',
        afterData: (p.action === 'REMOVE_ATTACHMENT' || p.action === 'REMOVE_SERVICE')
                    ? ({ itemId: p.itemId, serviceId: p.serviceId } as never)
                    : undefined,
      },
    })
  } catch { /* ignore */ }
}
