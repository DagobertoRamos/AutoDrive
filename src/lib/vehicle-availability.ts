// =============================================================================
// vehicle-availability.ts
//
// Fonte ÚNICA de verdade pra disponibilidade do veículo em VENDA.
// Usada por: /api/vehicles (listagem), VehicleInlineSearch (wizard nova venda),
// EstoquePage (cards), guard backend no POST /api/negotiations.
// =============================================================================

export type VehicleAvailabilityStatus =
  | 'AVAILABLE'                 // livre pra venda
  | 'IN_NEGOTIATION'            // tem negociação ativa (não aprovada)
  | 'BLOCKED_BY_APPROVED_SALE'  // venda já aprovada/liberada → fora do estoque
  | 'IN_PRICING'                // ainda em precificação (gerente não liberou)
  | 'BLOCKED'                   // VENDIDO / CANCELADO / DEVOLVIDO / BLOQUEADO

export interface VehicleAvailabilityResult {
  canShow:           boolean   // aparece no estoque?
  canSelect:         boolean   // pode ser escolhido em nova venda?
  status:            VehicleAvailabilityStatus
  warning:           string | null
  negotiationId?:    string | null
  negotiationNumber?: string | null
  negotiationStatus?: string | null
  sellerName?:       string | null
  sellerUnitName?:   string | null
}

export interface VehicleAvailabilityInput {
  stockStatus?:           string | null
  isAvailableForSale?:    boolean | null
  active?:                boolean | null
  hasOpenNegotiation?:    boolean | null
  openNegotiationId?:     string | null
  openNegotiationNumber?: string | null
  openNegotiationStatus?: string | null
  openNegotiationSeller?: string | null
  openNegotiationUnit?:   string | null
}

// Status do estoque que tiram o veículo do "disponível pra venda".
const TERMINAL_STATUSES = new Set([
  'VENDIDO', 'CANCELADO', 'DEVOLVIDO', 'BLOQUEADO',
])

// Status de negociação considerados "venda já aprovada" — bloqueiam
// completamente reuso, antes mesmo de finalizar.
const APPROVED_DEAL_STATUSES = new Set([
  'APROVADA', 'LIBERADA', 'SINAL_RECEBIDO', 'RESERVADA',
  'AGUARDANDO_FINANCEIRO', 'FINANCEIRO_APROVADO',
  'AGUARDANDO_DOCUMENTACAO', 'DOCUMENTACAO_CONCLUIDA',
  'AGUARDANDO_CONTRATO', 'CONTRATO_GERADO',
  'AGUARDANDO_ASSINATURA', 'ASSINADA',
  'AGUARDANDO_ENTREGA', 'ENTREGUE',
  'EM_ANDAMENTO', 'FINALIZADA',
])

export function getVehicleAvailabilityForSale(
  v: VehicleAvailabilityInput,
): VehicleAvailabilityResult {
  const stockStatus = (v.stockStatus ?? '').toUpperCase()

  // 1) Veículos terminais — fora do estoque
  if (TERMINAL_STATUSES.has(stockStatus)) {
    return { canShow: false, canSelect: false, status: 'BLOCKED', warning: 'Veículo fora do estoque.' }
  }

  // 2) Em precificação — não pode vender ainda
  if (stockStatus === 'EM_PRECIFICACAO') {
    return {
      canShow:   true,
      canSelect: false,
      status:    'IN_PRICING',
      warning:   'Aguardando precificação/liberação do gerente.',
    }
  }

  // 3) Tem negociação ativa?
  const negStatus = (v.openNegotiationStatus ?? '').toUpperCase()
  if (v.hasOpenNegotiation && v.openNegotiationId) {
    // Negociação já aprovada/liberada → veículo BLOQUEADO (não aparece como
    // disponível pra venda, mesmo que stockStatus ainda não tenha sido
    // atualizado — a regra de negociação prevalece).
    if (APPROVED_DEAL_STATUSES.has(negStatus)) {
      return {
        canShow:           false,
        canSelect:         false,
        status:            'BLOCKED_BY_APPROVED_SALE',
        warning:           `Venda já liberada pelo gerente${v.openNegotiationNumber ? ` na negociação ${v.openNegotiationNumber}` : ''}.`,
        negotiationId:     v.openNegotiationId,
        negotiationNumber: v.openNegotiationNumber,
        negotiationStatus: v.openNegotiationStatus,
        sellerName:        v.openNegotiationSeller,
        sellerUnitName:    v.openNegotiationUnit,
      }
    }
    // Negociação em aberto (aguardando aprovação etc) → aparece com aviso
    return {
      canShow:           true,
      canSelect:         false,
      status:            'IN_NEGOTIATION',
      warning:           `Veículo em negociação pelo vendedor ${v.openNegotiationSeller ?? 'não informado'}.`,
      negotiationId:     v.openNegotiationId,
      negotiationNumber: v.openNegotiationNumber,
      negotiationStatus: v.openNegotiationStatus,
      sellerName:        v.openNegotiationSeller,
      sellerUnitName:    v.openNegotiationUnit,
    }
  }

  // 4) Disponível
  if (v.isAvailableForSale === false || v.active === false) {
    return {
      canShow:   true,
      canSelect: false,
      status:    'IN_PRICING',
      warning:   'Veículo inativo ou não liberado para venda.',
    }
  }

  return { canShow: true, canSelect: true, status: 'AVAILABLE', warning: null }
}
