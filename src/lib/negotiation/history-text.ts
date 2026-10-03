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
  if (Number.isNaN(d.getTime())) return null
  // Data sem hora gravada como meia-noite UTC (ex.: entrega 07/10): no fuso do
  // Brasil viraria o dia anterior — mostra o dia como foi informado.
  const midnightUtc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
  return d.toLocaleDateString('pt-BR', { timeZone: midnightUtc ? 'UTC' : 'America/Sao_Paulo' })
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

// ── Eventos que não passam pelo log (cadastro, anexos, documentos…) ─────────

const PAY_PT: Record<string, string> = { SINAL: 'Sinal', ENTRADA: 'Entrada', PIX: 'PIX', DINHEIRO: 'Dinheiro', FINANCIAMENTO: 'Financiamento', CARTAO_CREDITO: 'Cartão de crédito', CARTAO_DEBITO: 'Cartão de débito', BOLETO: 'Boleto', TRANSFERENCIA: 'Transferência', DUPLICATA: 'Duplicata', OUTROS: 'Outro', OUTRO: 'Outro' }
const ATT_PT: Record<string, string> = { COMPROVANTE_PAGAMENTO: 'comprovante de pagamento', COMPROVANTE_QUITACAO: 'boleto/comprovante de quitação', COMPROVANTE_DEBITO: 'comprovante de débito', COMPROVANTE_TROCO: 'comprovante do troco', CONTRATO_ASSINADO: 'contrato assinado', PROCURACAO_ASSINADA: 'procuração assinada', NFE: 'nota fiscal', RECIBO: 'recibo', OUTRO: 'arquivo' }
const DOC_PT: Record<string, string> = { CONTRATO_COMPRA: 'contrato de compra', CONTRATO_VENDA: 'contrato de venda', CONTRATO_TROCA: 'contrato de troca', CONTRATO_CONSIGNACAO: 'contrato de consignação', PROCURACAO: 'procuração', RECIBO: 'recibo', TERMO_ENTREGA: 'termo de entrega', TERMO_RESPONSABILIDADE: 'termo de responsabilidade', OUTRO: 'documento' }
const toIso = (d: Date | string) => new Date(d).toISOString()
const amount = (v: unknown) => Number(v ?? 0) || 0
const near = (a: Date | string, b: Date | string, ms: number) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= ms

export interface ExtraSources {
  /** Log já registrado (para não repetir o que tem linha própria). */
  audit: Array<{ field?: string | null; newValue?: string | null; createdAt: Date | string }>
  payments: Array<{ type: string; method?: string | null; value: unknown; status?: string | null; bank?: string | null; createdAt: Date | string; paidAt?: Date | string | null }>
  debts: Array<{ type: string; description?: string | null; value: unknown; responsavel?: string | null; createdAt: Date | string }>
  attachments: Array<{ category: string; fileName: string; uploadedByName?: string | null; uploadedAt: Date | string }>
  documents: Array<{ type: string; name: string; createdAt: Date | string; signedAt?: Date | string | null; signedBy?: string | null }>
  discounts: Array<{ requestedValue: unknown; approvedValue?: unknown; reason?: string | null; status: string; createdAt: Date | string; decidedAt?: Date | string | null; decisionNote?: string | null; requestedBy?: string | null; decidedBy?: string | null }>
  changes: Array<{ value: unknown; beneficiary: string; createdAt: Date | string }>
  reopens: Array<{ reason: string; createdAt: Date | string; by?: string | null }>
  releases: Array<{ status: string; reason?: string | null; requestedAt: Date | string; reviewedAt?: Date | string | null; by?: string | null; reviewer?: string | null }>
  imported: Array<{ summary?: string | null; userName?: string | null; createdAt: Date | string }>
}

/** Eventos de cadastro e acompanhamento que não geram linha no log da negociação. */
export function extraHistory(s: ExtraSources): HistoryItem[] {
  const out: HistoryItem[] = []
  const logged = (field: string, at: Date | string, word: string, ms = 15_000) =>
    s.audit.some((a) => a.field === field && near(a.createdAt, at, ms) && String(a.newValue ?? '').toLowerCase().includes(word))
  for (const p of s.payments) {
    const label = `${PAY_PT[p.type] ?? p.type}${p.method ? ` (${PAY_PT[p.method] ?? p.method})` : ''} de ${brl(amount(p.value))}${p.bank ? ` · ${p.bank}` : ''}`
    if (!logged('pagamento', p.createdAt, 'incluído')) out.push({ kind: 'PAGAMENTO', restricted: true, user: null, date: toIso(p.createdAt), title: 'Pagamento lançado', text: `Pagamento lançado: ${label}.` })
    if (String(p.status).toUpperCase() === 'CONFIRMADO' && p.paidAt && !logged('pagamento', p.paidAt, 'confirmado', 36 * 3_600_000)) {
      out.push({ kind: 'PAGAMENTO', restricted: true, user: null, date: toIso(p.paidAt), title: 'Pagamento confirmado', text: `Pagamento confirmado pelo financeiro: ${label}.` })
    }
  }
  for (const d of s.debts) {
    if (logged('débito', d.createdAt, 'incluído')) continue
    out.push({ kind: 'DEBITO', restricted: true, user: null, date: toIso(d.createdAt), title: 'Débito lançado', text: `Débito lançado: ${d.description?.trim() || d.type.toLowerCase()} de ${brl(amount(d.value))}${d.responsavel ? ` (responsável: ${d.responsavel.toLowerCase()})` : ''}.` })
  }
  for (const a of s.attachments) {
    out.push({ kind: 'DADOS', user: a.uploadedByName ?? null, date: toIso(a.uploadedAt), title: 'Arquivo anexado', text: `${who(a.uploadedByName)} anexou ${ATT_PT[a.category] ?? 'arquivo'}: ${a.fileName}.` })
  }
  for (const d of s.documents) {
    out.push({ kind: 'DADOS', user: null, date: toIso(d.createdAt), title: 'Documento gerado', text: `${cap(DOC_PT[d.type] ?? 'documento')} gerado: ${d.name}.` })
    if (d.signedAt) out.push({ kind: 'DADOS', user: d.signedBy ?? null, date: toIso(d.signedAt), title: 'Documento assinado', text: `${cap(DOC_PT[d.type] ?? 'documento')} assinado${d.signedBy ? ` por ${d.signedBy}` : ''}.` })
  }
  for (const r of s.discounts) {
    out.push({ kind: 'VALOR', restricted: true, user: r.requestedBy ?? null, date: toIso(r.createdAt), title: 'Desconto solicitado', text: `${who(r.requestedBy)} solicitou desconto de ${brl(amount(r.requestedValue))}${r.reason ? `. Motivo: ${r.reason}` : ''}.` })
    const st = String(r.status).toUpperCase()
    if (r.decidedAt && (st === 'APROVADO' || st === 'RECUSADO')) {
      out.push({ kind: 'VALOR', restricted: true, user: r.decidedBy ?? null, date: toIso(r.decidedAt), title: st === 'APROVADO' ? 'Desconto aprovado' : 'Desconto recusado', text: `${who(r.decidedBy)} ${st === 'APROVADO' ? `aprovou desconto de ${brl(amount(r.approvedValue ?? r.requestedValue))}` : 'recusou o desconto'}${r.decisionNote ? `. Obs.: ${r.decisionNote}` : ''}.` })
    }
  }
  for (const c of s.changes) out.push({ kind: 'PAGAMENTO', restricted: true, user: null, date: toIso(c.createdAt), title: 'Troco registrado', text: `Troco de ${brl(amount(c.value))} para ${c.beneficiary}.` })
  for (const r of s.reopens) out.push({ kind: 'STATUS', user: r.by ?? null, date: toIso(r.createdAt), title: 'Reaberta', text: `${who(r.by)} reabriu a negociação. Motivo: ${r.reason}.` })
  for (const r of s.releases) {
    out.push({ kind: 'STATUS', user: r.by ?? null, date: toIso(r.requestedAt), title: 'Liberação solicitada', text: `${who(r.by)} solicitou liberação${r.reason ? `. Motivo: ${r.reason}` : ''}.` })
    const st = String(r.status).toUpperCase()
    const ok = st === 'APROVADA' || st === 'APROVADO'
    if (r.reviewedAt && st !== 'PENDENTE') out.push({ kind: 'STATUS', user: r.reviewer ?? null, date: toIso(r.reviewedAt), title: ok ? 'Liberação aprovada' : 'Liberação recusada', text: `${who(r.reviewer)} ${ok ? 'aprovou' : 'recusou'} a liberação.` })
  }
  for (const h of s.imported) if (h.summary?.trim()) out.push({ kind: 'OUTRO', user: h.userName ?? null, date: toIso(h.createdAt), title: 'Histórico importado', text: `${h.summary.trim()}${h.userName ? ` (${h.userName})` : ''}` })
  return out
}
