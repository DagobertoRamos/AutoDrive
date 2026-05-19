// =============================================================================
// Auditoria leve para consultas externas à BrasilAPI.
// Reaproveita o modelo AuditLog existente — não cria entidade nova.
// =============================================================================

import { prisma } from '@/lib/prisma'

interface IntegrationAuditParams {
  tenantId?: string | null
  userId?:   string
  userName?: string
  userRole?: string
  endpoint:  string   // ex: 'brasilapi.getCep'
  argument?: string   // valor consultado (cep, cnpj, etc) — não sensível
  ok:        boolean
  message?:  string
}

/**
 * Registra uma consulta externa em AuditLog.
 * Sempre fire-and-forget — nunca lança exceção.
 */
export function logIntegrationCall(p: IntegrationAuditParams): void {
  void prisma.auditLog
    .create({
      data: {
        tenantId: p.tenantId ?? null,
        userId:   p.userId   ?? null,
        userName: p.userName ?? null,
        userRole: p.userRole ?? null,
        action:   'INTEGRATION_CALL',
        entity:   'BrasilAPI',
        entityId: p.endpoint,
        status:   p.ok ? 'SUCCESS' : 'FAILED',
        afterData: p.argument
          ? ({ argument: p.argument, message: p.message } as never)
          : undefined,
      },
    })
    .catch(() => { /* nunca bloquear a consulta por falha de log */ })
}
