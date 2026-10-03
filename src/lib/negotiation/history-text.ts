// =============================================================================
// Histórico da negociação em português claro. PURO (testado).
// Cada registro do log (DealAuditLog/DealStatusHistory) vira uma frase:
//   "Dagoberto alterou o valor de venda de R$ 55.890,00 para R$ 58.890,00."
// Valores ficam formatados (moeda, data, nomes) e nunca aparece nome de campo
// técnico (saleAmount, financedAmount...).
// =============================================================================

export type HistoryKind = 'STATUS' | 'VALOR' | 'PAGAMENTO' | 'DEBITO' | 'DADOS' | 'SERVICO' | 'VEICULO' | 'PENDENCIA' | 'GARANTIA' | 'OUTRO'

export interface HistoryItem {
  kind: HistoryKind
  /** Título curto (ex.: "Valor de venda alterado"). */
  title: string
  /** Frase completa com quem, o quê, de/para. */
  text: string
  user: string | null
  date: string
  /** Só a gerência vê (edições de valores, pagamentos e débitos). */
  restricted?: boolean
}

type Fmt = 'money' | 'date' | 'text' | 'percent' | 'ref'

/** Rótulo (com artigo) e formato de cada campo editável da negociação. */
export const FIELD_INFO: Record<string, { label: string; art: 'o' | 'a'; fmt: Fmt; kind: HistoryKind }> = {
  saleAmount: { label: 'valor de venda', art: 'o', fmt: 'money', kind: 'VALOR' },
  purchaseAmount: { label: 'valor de compra', art: 'o', fmt: 'money', kind: 'VALOR' },
  vehicleValue: { label: 'valor do veículo', art: 'o', fmt: 'money', kind: 'VALOR' },
  signalAmount: { label: 'sinal', art: 'o', fmt: 'money', kind: 'VALOR' },
  financedAmount: { label: 'valor financiado', art: 'o', fmt: 'money', kind: 'VALOR' },
  tradeValue: { label: 'valor da troca', art: 'o', fmt: 'money', kind: 'VALOR' },
  discountAmount: { label: 'desconto', art: 'o', fmt: 'money', kind: 'VALOR' },
  documentationFee: { label: 'taxa de documentação', art: 'a', fmt: 'money', kind: 'VALOR' },
  payoffAmount: { label: 'valor de quitação', art: 'o', fmt: 'money', kind: 'VALOR' },
  servicesAmount: { label: 'total de serviços', art: 'o', fmt: 'money', kind: 'SERVICO' },
  changeAmount: { label: 'troco', art: 'o', fmt: 'money', kind: 'VALOR' },
  consignMinValue: { label: 'valor mínimo da consignação', art: 'o', fmt: 'money', kind: 'VALOR' },
  consignCommPct: { label: 'comissão da consignação', art: 'a', fmt: 'percent', kind: 'VALOR' },
  returnRatePercent: { label: 'retorno do financiamento', art: 'o', fmt: 'percent', kind: 'VALOR' },
  deliveryDate: { label: 'data de entrega', art: 'a', fmt: 'date', kind: 'DADOS' },
  consignDeadline: { label: 'prazo da consignação', art: 'o', fmt: 'date', kind: 'DADOS' },
  paymentBank: { label: 'banco do pagamento', art: 'o', fmt: 'text', kind: 'DADOS' },
  paymentType: { label: 'forma de pagamento', art: 'a', fmt: 'text', kind: 'DADOS' },
  notes: { label: 'observações', art: 'a', fmt: 'text', kind: 'DADOS' },
  sellerId: { label: 'vendedor', art: 'o', fmt: 'ref', kind: 'DADOS' },
  managerId: { label: 'gerente responsável', art: 'o', fmt: 'ref', kind: 'DADOS' },
  unitId: { label: 'unidade', art: 'a', fmt: 'ref', kind: 'DADOS' },
  personId: { label: 'cliente', art: 'o', fmt: 'ref', kind: 'DADOS' },
  type: { label: 'tipo da negociação', art: 'o', fmt: 'text', kind: 'DADOS' },
  changeBeneficiary: { label: 'favorecido do troco', art: 'o', fmt: 'text', kind: 'DADOS' },
  changePix: { label: 'PIX do troco', art: 'o', fmt: 'text', kind: 'DADOS' },
}

export const STATUS_PT: Record<string, string> = {
  RASCUNHO: 'Rascunho', EM_PREENCHIMENTO: 'Em preenchimento', AGUARDANDO_LIBERACAO: 'Aguardando liberação',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação', LIBERADA: 'Liberada', APROVADA: 'Aprovada', RECUSADA: 'Recusada',
  DESAPROVADA: 'Desaprovada', DEVOLVIDA_PARA_CORRECAO: 'Devolvida para correção', AGUARDANDO_SINAL: 'Aguardando sinal',
  SINAL_RECEBIDO: 'Sinal recebido', RESERVADA: 'Reservada', AGUARDANDO_FINANCEIRO: 'Aguardando financeiro',
  FINANCEIRO_APROVADO: 'Financeiro aprovado', FINANCEIRO_REPROVADO: 'Financeiro reprovado',
  AGUARDANDO_DOCUMENTACAO: 'Aguardando documentação', DOCUMENTACAO_CONCLUIDA: 'Documentação concluída',
  AGUARDANDO_CONTRATO: 'Aguardando contrato', CONTRATO_GERADO: 'Contrato gerado', AGUARDANDO_ASSINATURA: 'Aguardando assinatura',
  ASSINADA: 'Assinada', AGUARDANDO_ENTREGA: 'Aguardando entrega', ENTREGUE: 'Entregue', EM_ANDAMENTO: 'Em andamento',
  FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada', REABERTA: 'Reaberta', BLOQUEADA: 'Bloqueada',
}

/** Verbo de quem mudou o status para cada situação nova. */
const STATUS_VERB: Record<string, string> = {
  RASCUNHO: 'criou a negociação como rascunho', AGUARDANDO_APROVACAO: 'enviou a negociação para aprovação',
  AGUARDANDO_LIBERACAO: 'enviou a negociação para liberação', APROVADA: 'aprovou a negociação', LIBERADA: 'liberou a negociação',
  RECUSADA: 'recusou a negociação', DESAPROVADA: 'desaprovou a negociação', DEVOLVIDA_PARA_CORRECAO: 'devolveu a negociação para correção',
  FINALIZADA: 'finalizou a negociação', CANCELADA: 'cancelou a negociação', REABERTA: 'reabriu a negociação', ENTREGUE: 'registrou a entrega do veículo',
  ASSINADA: 'registrou a assinatura do contrato', SINAL_RECEBIDO: 'registrou o recebimento do sinal',
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ')

function toNumber(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  // "1.500,00" (BR) ou "1500.00"/"1500"
  const n = /,\d{1,2}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return Number.isFinite(n) ? n : null
}

function fmtDate(v: string): string | null {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** Valor do log formatado para leitura ("—" quando vazio). */
export function formatValue(fmt: Fmt, v: string | number | null | undefined, refs: Record<string, string> = {}): string {
  if (v == null || v === '') return '—'
  if (fmt === 'money') { const n = toNumber(v); return n == null ? String(v) : brl(n) }
  if (fmt === 'percent') { const n = toNumber(v); return n == null ? String(v) : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` }
  if (fmt === 'date') return fmtDate(String(v)) ?? String(v)
  if (fmt === 'ref') return refs[String(v)] ?? 'outro registro'
  const s = String(v).trim()
  return s.length > 80 ? `${s.slice(0, 77)}…` : s
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const who = (u: string | null | undefined) => (u && u.trim() ? u.trim() : 'O sistema')

export interface AuditLike { action: string; field?: string | null; oldValue?: string | null; newValue?: string | null; userName?: string | null; reason?: string | null; createdAt: string | Date }

/** Uma linha do log da negociação → frase em português. `refs`: id → nome (vendedor, unidade...). */
export function describeAudit(a: AuditLike, refs: Record<string, string> = {}): HistoryItem {
  const date = new Date(a.createdAt).toISOString()
  const u = who(a.userName)
  const field = a.field ?? ''
  const action = String(a.action ?? '').toUpperCase()
  const base = { user: a.userName ?? null, date }

  // Pagamentos e débitos (edição por item): oldValue/newValue já vêm descritos.
  if (field === 'pagamento' || field === 'débito') {
    const kind: HistoryKind = field === 'pagamento' ? 'PAGAMENTO' : 'DEBITO'
    const noun = field === 'pagamento' ? 'pagamento' : 'débito'
    const o = a.oldValue?.trim(); const n = a.newValue?.trim()
    if (!o && n) return { ...base, kind, restricted: true, title: `${cap(noun)} incluído`, text: `${u} incluiu ${field === 'pagamento' ? 'o pagamento' : 'o débito'} ${n}.` }
    if (o && !n) return { ...base, kind, restricted: true, title: `${cap(noun)} removido`, text: `${u} removeu ${field === 'pagamento' ? 'o pagamento' : 'o débito'} ${o}.` }
    return { ...base, kind, restricted: true, title: `${cap(noun)} alterado`, text: `${u} alterou ${field === 'pagamento' ? 'o pagamento' : 'o débito'}: ${o ?? '—'} → ${n ?? '—'}.` }
  }

  if (action === 'ADICIONAR_SERVICO' || action === 'REMOVER_SERVICO') {
    const add = action === 'ADICIONAR_SERVICO'
    return { ...base, kind: 'SERVICO', title: add ? 'Serviço incluído' : 'Serviço removido', text: `${u} ${add ? 'incluiu' : 'removeu'} um serviço${a.reason ? ` (${a.reason})` : ''}. Total de serviços: ${formatValue('money', a.oldValue)} → ${formatValue('money', a.newValue)}.` }
  }
  if (action === 'VENDER_GARANTIA' || action === 'CANCELAR_GARANTIA') {
    const sell = action === 'VENDER_GARANTIA'
    return { ...base, kind: 'GARANTIA', title: sell ? 'Garantia vendida' : 'Garantia cancelada', text: `${u} ${sell ? 'registrou a venda de uma garantia' : 'cancelou uma garantia'}${a.reason ? `: ${a.reason}` : ''}.` }
  }

  const info = FIELD_INFO[field]
  if (info) {
    const label = info.label
    const from = formatValue(info.fmt, a.oldValue, refs)
    const to = formatValue(info.fmt, a.newValue, refs)
    const restricted = info.kind === 'VALOR' || info.kind === 'SERVICO'
    if (from === '—' && to !== '—') return { ...base, kind: info.kind, restricted, title: `${cap(label)} informad${info.art}`, text: `${u} informou ${info.art} ${label}: ${to}.` }
    if (to === '—' && from !== '—') return { ...base, kind: info.kind, restricted, title: `${cap(label)} removid${info.art}`, text: `${u} removeu ${info.art} ${label} (era ${from}).` }
    if (info.fmt === 'text' && field === 'notes') return { ...base, kind: info.kind, title: 'Observações alteradas', text: `${u} alterou as observações da negociação.` }
    return { ...base, kind: info.kind, restricted, title: `${cap(label)} alterad${info.art}`, text: `${u} alterou ${info.art} ${label} de ${from} para ${to}.` }
  }

  if (field === 'status' || ['CANCELAR', 'FINALIZAR', 'REABRIR', 'DEVOLVER_CORRECAO'].includes(action)) {
    const st = String(a.newValue ?? '').toUpperCase()
    return { ...base, kind: 'STATUS', title: STATUS_PT[st] ?? cap(st.toLowerCase().replace(/_/g, ' ')), text: `${u} ${STATUS_VERB[st] ?? `mudou a situação para ${STATUS_PT[st] ?? st}`}${a.reason ? `. Motivo: ${a.reason}` : ''}.` }
  }

  return { ...base, kind: 'OUTRO', title: 'Negociação atualizada', text: `${u} atualizou a negociação${a.reason ? `: ${a.reason}` : ''}.` }
}

/** Mudança de situação (DealStatusHistory) → frase. */
export function describeStatus(h: { newStatus: string; oldStatus?: string | null; reason?: string | null; createdAt: string | Date }, userName: string | null): HistoryItem {
  const st = String(h.newStatus).toUpperCase()
  const u = who(userName)
  return {
    kind: 'STATUS', user: userName, date: new Date(h.createdAt).toISOString(),
    title: STATUS_PT[st] ?? cap(st.toLowerCase().replace(/_/g, ' ')),
    text: `${u} ${STATUS_VERB[st] ?? `mudou a situação para ${STATUS_PT[st] ?? st}`}${h.reason ? `. Motivo: ${h.reason}` : ''}.`,
  }
}
