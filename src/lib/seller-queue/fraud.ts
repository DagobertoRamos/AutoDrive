// =============================================================================
// seller-queue/fraud.ts — flags de fraude automáticas (best-effort).
// Cria SellerQueueFraudFlag para revisão da gerência (aparece nos relatórios).
// NÃO bloqueia o fluxo; apenas registra a suspeita.
// =============================================================================

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export async function flagFraud(p: {
  tenantId: string
  unitId?: string | null
  sellerId?: string | null
  actorId?: string | null
  arrivalId?: string | null
  attendanceId?: string | null
  kind: string // CHECK_IN_OUTSIDE | DUPLICATE | FAVORITISM | MANIPULATION | ...
  severity?: 'LOW' | 'MEDIUM' | 'HIGH'
  detail?: string | null
  metadata?: Prisma.InputJsonValue
}): Promise<void> {
  try {
    await prisma.sellerQueueFraudFlag.create({
      data: {
        tenantId: p.tenantId, unitId: p.unitId ?? null, sellerId: p.sellerId ?? null, actorId: p.actorId ?? null,
        arrivalId: p.arrivalId ?? null, attendanceId: p.attendanceId ?? null,
        kind: p.kind, severity: p.severity ?? 'LOW', detail: p.detail ?? null,
        ...(p.metadata !== undefined ? { metadata: p.metadata } : {}),
      },
    })
  } catch { /* suspeita não bloqueia a operação */ }
}
