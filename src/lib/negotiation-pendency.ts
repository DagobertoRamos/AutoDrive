// =============================================================================
// negotiation-pendency.ts — Pendências automáticas de negociações
// =============================================================================

import type { PrismaClient } from '@prisma/client'

type PendencyTrigger =
  | 'SELLER_NOT_FOUND'
  | 'DOCS_INCOMPLETE'
  | 'SIGNAL_PENDING'
  | 'FINANCING_PENDING'
  | 'PAYOFF_PENDING'
  | 'VEHICLE_INSPECTION'
  | 'APPROVAL_PENDING'
  | 'DELIVERY_PENDING'
  | 'CONSIGN_CONTRACT'

type DealRef = {
  id: string
  type: string
  status: string
  tenantId?: string | null
  unitId?: string | null
  sellerId?: string | null
}

const TRIGGER_DESCRIPTIONS: Record<PendencyTrigger, { type: string; description: string; priority: string }> = {
  SELLER_NOT_FOUND:   { type: 'NEGOCIACAO', description: 'Vendedor não encontrado na negociação. Vincule o vendedor correto.', priority: 'ALTA' },
  DOCS_INCOMPLETE:    { type: 'NEGOCIACAO', description: 'Documentação incompleta na negociação. Verifique os documentos necessários.', priority: 'ALTA' },
  SIGNAL_PENDING:     { type: 'NEGOCIACAO', description: 'Aguardando recebimento de sinal/entrada da negociação.', priority: 'MEDIA' },
  FINANCING_PENDING:  { type: 'NEGOCIACAO', description: 'Aguardando aprovação de financiamento.', priority: 'ALTA' },
  PAYOFF_PENDING:     { type: 'NEGOCIACAO', description: 'Aguardando quitação do veículo de troca.', priority: 'MEDIA' },
  VEHICLE_INSPECTION: { type: 'NEGOCIACAO', description: 'Veículo necessita de inspeção antes da entrega.', priority: 'MEDIA' },
  APPROVAL_PENDING:   { type: 'NEGOCIACAO', description: 'Negociação aguardando aprovação do gerente.', priority: 'ALTA' },
  DELIVERY_PENDING:   { type: 'NEGOCIACAO', description: 'Entrega do veículo pendente. Confirme a data de entrega.', priority: 'MEDIA' },
  CONSIGN_CONTRACT:   { type: 'NEGOCIACAO', description: 'Contrato de consignação necessário. Providencie a assinatura.', priority: 'ALTA' },
}

export async function createAutoPendencies(
  tx: PrismaClient,
  deal: DealRef,
  triggers: PendencyTrigger[],
): Promise<void> {
  if (!deal.unitId || triggers.length === 0) return

  for (const trigger of triggers) {
    const meta = TRIGGER_DESCRIPTIONS[trigger]
    if (!meta) continue

    await tx.pendency.create({
      data: {
        tenantId:       deal.tenantId ?? null,
        unitId:         deal.unitId,
        customerName:   `Negociação ${deal.id}`,
        type:           meta.type,
        priority:       meta.priority as any,
        status:         'ABERTA',
        description:    meta.description,
        responsibleId:  deal.sellerId ?? '',
        originModule:   'NEGOCIACAO',
        originRecordId: deal.id,
        allowedDays:    [],
        dealId:         deal.id,
      } as any,
    })
  }
}
