// =============================================================================
// Centros de resultado por serviço — regras PURAS do deal-finance-sync (testadas).
//   • Serviço da negociação (DealService) → custo previsto (21.x) no centro do tipo.
//   • Garantia vendida (WarrantySale) → custo previsto 21.5 no centro GARANTIAS.
//   • F&I do financiamento → receitas previstas: retorno (2.1), PLUS (2.5) e
//     agregados com receita da loja (2.2 seguro / 4.x pelo tipo).
//   • Débitos da negociação → centro DOCUMENTACAO (21.1) ou VENDAS.
// =============================================================================

import { SERVICE_KIND_BY_KEY, serviceKindOf } from './result-centers-core'
import { parseAddOns } from './fi-receipt-core'
import { baseSource } from './settlement-core'

export const SERVICE_SOURCE_PREFIX = 'NEG_SERV_'
export const WARRANTY_SOURCE_PREFIX = 'NEG_GAR_'
export const FI_RETURN_SOURCE_PREFIX = 'NEG_RETORNO_'
export const FI_PLUS_SOURCE_PREFIX = 'NEG_PLUS_'
export const FI_ADDON_SOURCE_PREFIX = 'NEG_AGREG_'

export const FI_RETURN_CODE = '2.1'
export const FI_PLUS_CODE = '2.5'
export const WARRANTY_COST_CODE = '21.5'
export const DOC_COST_CODE = '21.1'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const toNum = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Tipo, conta de custo e centro de um serviço vendido (tipo vazio → pelo nome). */
export function serviceCostSpec(s: { kind?: string | null; name?: string | null; supplier?: string | null }) {
  const kind = serviceKindOf(s)
  const def = SERVICE_KIND_BY_KEY[kind] ?? SERVICE_KIND_BY_KEY.OUTRO
  return { kind, costCode: def.costCode, centerKey: def.center }
}

/** Garantia vendida que ainda vale (não cancelada/estornada). */
export const isLiveWarrantySale = (status: string | null | undefined) => !['CANCELADA', 'ESTORNADA'].includes(String(status ?? '').toUpperCase())

/** Débitos que são documentação (mesmo conjunto dos centros de resultado). */
export const DOC_DEBT_TYPES_FOR_CENTER = ['DOCUMENTACAO', 'DESPACHANTE', 'TRANSFERENCIA', 'LICENCIAMENTO', 'VISTORIA', 'LAUDO']

/**
 * Centro do débito da negociação: documentação cobrada do cliente é custo do
 * serviço de documentação (21.1, centro DOCUMENTACAO); o resto fica em VENDAS
 * (conta inalterada).
 */
export function debtCenterSpec(d: { type: string; responsavel?: string | null }): { centerKey: string; costCode: string | null } {
  const charged = ['COMPRADOR', 'CLIENTE'].includes(String(d.responsavel ?? '').toUpperCase())
  if (charged && DOC_DEBT_TYPES_FOR_CENTER.includes(String(d.type ?? '').toUpperCase())) return { centerKey: 'DOCUMENTACAO', costCode: DOC_COST_CODE }
  return { centerKey: 'VENDAS', costCode: null }
}

/**
 * Retorno líquido a receber do banco por este contrato. O valor do pagamento
 * vence; sem ele, o da negociação vale só se houver UM financiamento.
 */
export function fiReturnAmount(paymentNet: unknown, dealNet: unknown, financingCount: number): number | null {
  const own = toNum(paymentNet)
  const v = own != null ? own : financingCount === 1 ? toNum(dealNet) : null
  return v != null && v > 0 ? round2(v) : null
}

/** Vencimento do recebível de F&I: vencimento do pagamento → pago em → aprovação + 30 dias. */
export function fiDueDate(p: { dueDate?: Date | null; paidAt?: Date | null }, approvedAt: Date): Date {
  return p.dueDate ?? p.paidAt ?? new Date(approvedAt.getTime() + 30 * 86_400_000)
}

/** Tipo de agregado do F&I → linha de serviço. */
const ADDON_KIND_TO_SERVICE: Record<string, string> = {
  SEGURO: 'SEGURO', PROTECAO: 'SEGURO', GARANTIA: 'GARANTIA', RASTREADOR: 'ACESSORIO',
  ACESSORIO: 'ACESSORIO', DESPACHANTE: 'DOCUMENTACAO', OUTRO: 'OUTRO',
}

export interface AddOnRevenue { index: number; name: string; kind: string; amount: number; revenueCode: string; centerKey: string }

/** Agregados do contrato cuja receita fica com a loja (beneficiário LOJA e receita > 0). */
export function storeAddOnRevenues(raw: unknown): AddOnRevenue[] {
  return parseAddOns(raw)
    .map((a, index) => ({ a, index }))
    // A loja ganha a "receita da loja" mesmo quando o agregado é pago a terceiro
    // (ex.: comissão do seguro prestamista) — mesma regra do resumo do contrato.
    .filter(({ a }) => (a.storeRevenue ?? 0) > 0)
    .map(({ a, index }) => {
      const kind = ADDON_KIND_TO_SERVICE[a.kind] ?? 'OUTRO'
      const def = SERVICE_KIND_BY_KEY[kind] ?? SERVICE_KIND_BY_KEY.OUTRO
      return { index, name: a.name, kind, amount: round2(a.storeRevenue ?? 0), revenueCode: kind === 'SEGURO' ? '2.2' : def.revenueCode, centerKey: def.center }
    })
}

/**
 * Lançamento automático ainda "do sistema": previsto e sem custo real detalhado.
 * Depois disso a sincronização só atualiza o valor cobrado.
 */
export const isSyncEditable = (e: { status: string; itemCount: number }) => e.status === 'PREVISTO' && e.itemCount === 0

/** Id do serviço/garantia a partir da origem do lançamento. */
export function serviceRefOfSource(source: string | null | undefined): { kind: 'SERVICE' | 'WARRANTY'; id: string } | null {
  if (!source) return null
  source = baseSource(source)
  if (source.startsWith(SERVICE_SOURCE_PREFIX)) return { kind: 'SERVICE', id: source.slice(SERVICE_SOURCE_PREFIX.length) }
  if (source.startsWith(WARRANTY_SOURCE_PREFIX)) return { kind: 'WARRANTY', id: source.slice(WARRANTY_SOURCE_PREFIX.length) }
  return null
}

export const isFiSource = (s: string | null | undefined) =>
  !!s && (s.startsWith(FI_RETURN_SOURCE_PREFIX) || s.startsWith(FI_PLUS_SOURCE_PREFIX) || s.startsWith(FI_ADDON_SOURCE_PREFIX))
