// =============================================================================
// Baixa detalhada de lançamento — regras puras (testadas).
//   • Itens de custo: a soma é o valor REAL do lançamento.
//   • Cobrado × custo real: o que a loja cobrou do cliente (chargedAmount) menos o
//     que gastou de fato = lucro bruto; menos as comissões de documento = líquido.
// =============================================================================

export const COST_ITEM_KINDS = [
  ['LICENCIAMENTO', 'Licenciamento'],
  ['TRANSFERENCIA', 'Taxa de transferência (Detran)'],
  ['PLACA', 'Placa'],
  ['LAUDO_ECV', 'Laudo ECV / vistoria'],
  ['TAXA_DETRAN', 'Outras taxas Detran'],
  ['IPVA', 'IPVA'],
  ['MULTA', 'Multas'],
  ['CARTORIO', 'Cartório / reconhecimento de firma'],
  ['HONORARIO', 'Honorário do despachante'],
  ['CAUTELAR', 'Cautelar / perícia'],
  ['QUITACAO', 'Quitação de financiamento'],
  ['OUTRO', 'Outros'],
] as const
export type CostItemKind = (typeof COST_ITEM_KINDS)[number][0]
export const COST_ITEM_LABEL = Object.fromEntries(COST_ITEM_KINDS) as Record<CostItemKind, string>

/** Atalhos por tipo de débito da negociação — o que normalmente compõe o custo. */
export const SUGGESTED_ITEMS: Record<string, CostItemKind[]> = {
  DOCUMENTACAO: ['TRANSFERENCIA', 'LICENCIAMENTO', 'PLACA', 'LAUDO_ECV', 'CARTORIO', 'HONORARIO'],
  DESPACHANTE: ['TRANSFERENCIA', 'LICENCIAMENTO', 'PLACA', 'LAUDO_ECV', 'CARTORIO', 'HONORARIO'],
  LICENCIAMENTO: ['LICENCIAMENTO', 'TAXA_DETRAN'],
  IPVA: ['IPVA'],
  MULTA: ['MULTA'],
  CAUTELAR: ['CAUTELAR', 'LAUDO_ECV'],
  FINANCIAMENTO: ['QUITACAO'],
}

/** Débitos que são DOCUMENTAÇÃO (base da comissão de documento e do lucro de despachante). */
export const DOC_DEBT_TYPES = ['DOCUMENTACAO', 'DESPACHANTE']

export interface CostItemInput { kind: string; description?: string | null; amount: number; supplierId?: string | null }

const round2 = (n: number) => Math.round(n * 100) / 100

/** Normaliza os itens digitados: descarta vazios, valor ≥ 0, descrição padrão pelo tipo. */
export function normalizeItems(items: CostItemInput[]): Array<{ kind: string; description: string; amount: number; supplierId: string | null }> {
  return items
    .map((i) => ({
      kind: (COST_ITEM_LABEL as Record<string, string>)[i.kind] ? i.kind : 'OUTRO',
      description: String(i.description ?? '').trim().slice(0, 200),
      amount: round2(Math.max(0, Number(i.amount) || 0)),
      supplierId: i.supplierId || null,
    }))
    .filter((i) => i.amount > 0)
    .map((i) => ({ ...i, description: i.description || (COST_ITEM_LABEL as Record<string, string>)[i.kind] }))
}

export const itemsTotal = (items: Array<{ amount: number }>) => round2(items.reduce((s, i) => s + (Number(i.amount) || 0), 0))

/**
 * Resultado de um débito cobrado do cliente:
 *   lucro bruto = cobrado − custo real;  líquido = bruto − comissões de documento.
 * Comissões canceladas não entram. `charged` 0 = débito assumido pela loja (só custo).
 */
export function chargeResult(input: { charged: number; cost: number; commissions: Array<{ amount: number; status: string }> }) {
  const charged = round2(Math.max(0, input.charged))
  const cost = round2(Math.max(0, input.cost))
  const commissions = round2(input.commissions.filter((c) => c.status !== 'CANCELADO').reduce((s, c) => s + c.amount, 0))
  const gross = round2(charged - cost)
  const net = round2(gross - commissions)
  return { charged, cost, gross, commissions, net, margin: charged > 0 ? Math.round((net / charged) * 1000) / 10 : null }
}

/** Quem arca com o débito → o valor é cobrado do cliente? */
export const isChargedToCustomer = (responsavel: string | null | undefined) => ['COMPRADOR', 'CLIENTE'].includes(String(responsavel ?? '').toUpperCase())

/** Quitação do financiamento do carro da troca: compõe a compra do carro, não é despesa extra dele. */
export const isPayoffDebt = (d: { type: string; description?: string | null }) => d.type === 'FINANCIAMENTO' || /quita/i.test(d.description ?? '')
