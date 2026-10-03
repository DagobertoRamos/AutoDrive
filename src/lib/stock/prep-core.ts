// =============================================================================
// Preparação do veículo + extrato financeiro — regras PURAS (testadas).
// =============================================================================

// ── Serviços ──────────────────────────────────────────────────────────────────
export const SERVICE_STATUS = ['AGUARDANDO', 'EM_SERVICO', 'CONCLUIDO', 'NEGADO', 'CANCELADO'] as const
export type ServiceStatus = (typeof SERVICE_STATUS)[number]
export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = {
  AGUARDANDO: 'Aguardando serviço', EM_SERVICO: 'Em serviço', CONCLUIDO: 'Concluído', NEGADO: 'Negado', CANCELADO: 'Cancelado',
}
const CLOSED: ServiceStatus[] = ['CONCLUIDO', 'NEGADO', 'CANCELADO']

export interface ServiceLike {
  status: string; estimatedCost?: number | string | null; actualCost?: number | string | null
  dueAt?: Date | string | null; finishedAt?: Date | string | null
}

const n = (v: unknown) => { const x = v == null || v === '' ? NaN : Number(v); return Number.isFinite(x) ? x : null }

export const isClosedService = (s: { status: string }) => (CLOSED as string[]).includes(s.status)

/** Custo efetivo: o real quando informado, senão o previsto. Negado/cancelado = 0. */
export function serviceCost(s: ServiceLike): number {
  if (s.status === 'NEGADO' || s.status === 'CANCELADO') return 0
  return n(s.actualCost) ?? n(s.estimatedCost) ?? 0
}

/** Em serviço com previsão vencida. */
export function isOverdue(s: ServiceLike, now = new Date()): boolean {
  if (s.status !== 'EM_SERVICO' || !s.dueAt) return false
  return new Date(s.dueAt).getTime() < now.getTime()
}

/** Etapa de serviços concluída: há serviços e todos estão encerrados. */
export function servicesDone(list: Array<{ status: string }>): boolean {
  return list.length > 0 && list.every(isClosedService)
}

export function servicesSummary(list: ServiceLike[], now = new Date()) {
  const byStatus = Object.fromEntries(SERVICE_STATUS.map((s) => [s, 0])) as Record<ServiceStatus, number>
  let estimated = 0; let actual = 0; let effective = 0; let overdue = 0
  for (const s of list) {
    if ((SERVICE_STATUS as readonly string[]).includes(s.status)) byStatus[s.status as ServiceStatus]++
    if (s.status !== 'NEGADO' && s.status !== 'CANCELADO') {
      estimated += n(s.estimatedCost) ?? 0
      actual += n(s.actualCost) ?? 0
    }
    effective += serviceCost(s)
    if (isOverdue(s, now)) overdue++
  }
  const round = (x: number) => Math.round(x * 100) / 100
  return { total: list.length, byStatus, estimated: round(estimated), actual: round(actual), effective: round(effective), overdue, done: servicesDone(list) }
}

/** Valida mudança de status (encerrado só volta por "reabrir" → AGUARDANDO). */
export function canMoveService(from: string, to: string): boolean {
  if (!(SERVICE_STATUS as readonly string[]).includes(to) || from === to) return false
  if (isClosedService({ status: from })) return to === 'AGUARDANDO' || to === 'EM_SERVICO'
  return true
}

// ── Recebimento ───────────────────────────────────────────────────────────────
export const RECEPTION_ITEMS = [
  { key: 'manual',        label: 'Manual do proprietário' },
  { key: 'revisoes',      label: 'Revisões (livro/notas)' },
  { key: 'chave_reserva', label: 'Chave reserva' },
  { key: 'macaco',        label: 'Macaco' },
  { key: 'chave_roda',    label: 'Chave de roda' },
  { key: 'triangulo',     label: 'Triângulo' },
  { key: 'estepe',        label: 'Estepe' },
] as const
export type ReceptionKey = (typeof RECEPTION_ITEMS)[number]['key']
export interface ReceptionItem { key: string; status: 'OK' | 'NAO_POSSUI' | 'PENDENTE'; note?: string | null }

/**
 * O que falta para confirmar o recebimento: cada item precisa de FOTO (status OK)
 * ou ser marcado "não possui" com justificativa.
 */
export function receptionMissing(items: ReceptionItem[], photosByKey: Record<string, number>): string[] {
  const byKey = new Map(items.map((i) => [i.key, i]))
  const missing: string[] = []
  for (const it of RECEPTION_ITEMS) {
    const cur = byKey.get(it.key)
    if (cur?.status === 'NAO_POSSUI') { if (!cur.note?.trim()) missing.push(`${it.label}: justifique por que não possui`); continue }
    if ((photosByKey[it.key] ?? 0) < 1) missing.push(`${it.label}: foto`)
  }
  return missing
}

// ── Perícia ───────────────────────────────────────────────────────────────────
/** Perícia resolvida: status registrado (pendente vale; "sem perícia" não) E laudo anexado. */
export function inspectionReady(cautelarStatus: string | null | undefined, laudoFiles: number): { ok: boolean; missing: string[] } {
  const s = String(cautelarStatus ?? '').toUpperCase()
  const missing: string[] = []
  if (!s || s === 'SEM_CAUTELAR') missing.push('status da perícia')
  if (laudoFiles < 1) missing.push('laudo anexado (PDF ou imagem)')
  return { ok: missing.length === 0, missing }
}

// ── Extrato financeiro ───────────────────────────────────────────────────────
export const EXPENSE_CATEGORIES = [
  ['COMPRA_VEICULO', 'Compra do veículo'], ['SERVICO', 'Serviços de preparação'], ['DOCUMENTACAO', 'Documentação'],
  ['MULTA', 'Multas'], ['DEBITO', 'Débitos do veículo (IPVA, licenciamento…)'], ['PECA', 'Peças'], ['COMBUSTIVEL', 'Combustível'],
  ['LAUDO', 'Laudos/perícia'], ['TERCEIRO', 'Terceiros'], ['PRESTADOR', 'Prestadores'], ['IMPOSTO', 'Impostos'],
  ['COMISSAO', 'Comissões'], ['REPASSE', 'Repasse ao proprietário (consignado)'], ['OUTRO', 'Outros'],
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number][0]
export const EXPENSE_LABEL = Object.fromEntries(EXPENSE_CATEGORIES) as Record<ExpenseCategory, string>
export const REVENUE_CATEGORIES = [['VENDA_VEICULO', 'Venda do veículo'], ['COBRADO_CLIENTE', 'Cobrado do cliente (documentação/débitos)'], ['RETORNO', 'Retorno financeiro'], ['OUTRA_RECEITA', 'Outras receitas']] as const
export const REVENUE_LABEL = Object.fromEntries(REVENUE_CATEGORIES) as Record<string, string>

export interface LedgerLine { type: 'RECEITA' | 'DESPESA'; category: string; amount: number; status: string }

/**
 * Resultado do veículo. Despesas/receitas canceladas não contam.
 * `pending` = o que ainda falta pagar/receber.
 */
export function vehicleResult(lines: LedgerLine[]) {
  const live = lines.filter((l) => l.status !== 'CANCELADO')
  const sum = (f: (l: LedgerLine) => boolean) => Math.round(live.filter(f).reduce((a, l) => a + l.amount, 0) * 100) / 100
  const revenue = sum((l) => l.type === 'RECEITA')
  const cost = sum((l) => l.type === 'DESPESA')
  const byCategory: Record<string, number> = {}
  for (const l of live) byCategory[l.category] = Math.round(((byCategory[l.category] ?? 0) + (l.type === 'DESPESA' ? -l.amount : l.amount)) * 100) / 100
  const profit = Math.round((revenue - cost) * 100) / 100
  return {
    revenue, cost, profit,
    margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null,
    toPay: sum((l) => l.type === 'DESPESA' && l.status === 'PREVISTO'),
    toReceive: sum((l) => l.type === 'RECEITA' && l.status === 'PREVISTO'),
    byCategory,
  }
}

/** Valor digitado → número: aceita "1.500,50", "1500,50", "1500.50" e "1500". Vazio/ inválido = null. */
export function parseMoneyInput(v: string | null | undefined): number | null {
  const s = String(v ?? '').trim().replace(/[^\d,.-]/g, '')
  if (!s) return null
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : /\.\d{3}$/.test(s) && !/\.\d{1,2}$/.test(s) ? s.replace(/\./g, '') : s
  const n = Number(normalized)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
