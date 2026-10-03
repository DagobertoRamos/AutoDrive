// =============================================================================
// Edição da negociação — pagamentos e débitos por id (PURO, testado).
// O que veio da tela é comparado com o banco: altera só o que mudou, inclui
// os novos e remove os retirados. Pagamento CONFIRMADO/CANCELADO (financeiro)
// nunca é alterado nem removido pela edição. Cada mudança vira uma linha de log.
// =============================================================================

export interface PaymentRow {
  id: string; type: string; status: string | null; value: number
  method: string | null; bank: string | null; cardBrand: string | null; pixKey: string | null
  installments: number | null; installmentValue: number | null; installmentIntervalDays: number | null
  returnPct: number | null; vehiclePlate: string | null; firstDueDate: string | null; dueDate: string | null
  notes: string | null; authorizationCode: string | null
}
export interface DebtRow {
  id: string; vehicleRole: string | null; type: string; description: string | null; value: number
  dueDate: string | null; responsavel: string | null; notes: string | null
}

export const PAYMENT_FIELDS = ['type', 'value', 'method', 'bank', 'cardBrand', 'pixKey', 'installments', 'installmentValue', 'installmentIntervalDays', 'returnPct', 'vehiclePlate', 'firstDueDate', 'dueDate', 'notes', 'authorizationCode'] as const
export const DEBT_FIELDS = ['vehicleRole', 'type', 'description', 'value', 'dueDate', 'responsavel', 'notes'] as const

const LOCKED = new Set(['CONFIRMADO', 'CANCELADO'])
export const isLockedPayment = (p: { status: string | null }) => LOCKED.has(String(p.status ?? '').toUpperCase())

const norm = (v: unknown): string => {
  if (v == null || v === '') return ''
  if (typeof v === 'number') return String(Math.round(v * 100) / 100)
  const s = String(v).trim()
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s
}

export interface ChildDiff<T> {
  create: T[]
  update: Array<{ id: string; data: Partial<T>; changes: Array<{ field: string; from: string; to: string }> }>
  remove: string[]
  /** Pagamentos travados que a tela tentou alterar/remover (mantidos). */
  kept: string[]
}

export function diffChildren<T extends { id: string }>(
  existing: T[], incoming: T[], fields: readonly (keyof T & string)[], isLocked: (row: T) => boolean = () => false,
): ChildDiff<T> {
  const byId = new Map(existing.map((e) => [e.id, e]))
  const seen = new Set<string>()
  const out: ChildDiff<T> = { create: [], update: [], remove: [], kept: [] }
  for (const inc of incoming) {
    const cur = inc.id ? byId.get(inc.id) : undefined
    if (!cur) { out.create.push(inc); continue }
    seen.add(cur.id)
    const changes = fields.filter((f) => norm(cur[f]) !== norm(inc[f])).map((f) => ({ field: f, from: norm(cur[f]), to: norm(inc[f]) }))
    if (!changes.length) continue
    if (isLocked(cur)) { out.kept.push(cur.id); continue }
    const data: Partial<T> = {}
    for (const c of changes) data[c.field as keyof T] = inc[c.field as keyof T]
    out.update.push({ id: cur.id, data, changes })
  }
  for (const e of existing) {
    if (seen.has(e.id)) continue
    if (isLocked(e)) out.kept.push(e.id)
    else out.remove.push(e.id)
  }
  return out
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const PAY_LABEL: Record<string, string> = { SINAL: 'Sinal', ENTRADA: 'Entrada', PIX: 'PIX', DINHEIRO: 'Dinheiro', FINANCIAMENTO: 'Financiamento', CARTAO_CREDITO: 'Cartão de crédito', CARTAO_DEBITO: 'Cartão de débito', BOLETO: 'Boleto', TRANSFERENCIA: 'Transferência', DUPLICATA: 'Duplicata', OUTROS: 'Outro', OUTRO: 'Outro' }
export const paymentLabel = (p: Pick<PaymentRow, 'type' | 'value' | 'method' | 'bank'>) =>
  `${PAY_LABEL[p.type] ?? p.type}${p.method ? ` (${PAY_LABEL[p.method] ?? p.method})` : ''} ${brl(Number(p.value) || 0)}${p.bank ? ` · ${p.bank}` : ''}`
export const debtLabel = (d: Pick<DebtRow, 'type' | 'description' | 'value' | 'responsavel'>) =>
  `${d.description?.trim() || d.type} ${brl(Number(d.value) || 0)}${d.responsavel ? ` (${d.responsavel.toLowerCase()})` : ''}`

const FIELD_LABEL: Record<string, string> = {
  type: 'forma', value: 'valor', method: 'forma do sinal', bank: 'banco', cardBrand: 'bandeira', pixKey: 'chave PIX', installments: 'parcelas',
  installmentValue: 'valor da parcela', installmentIntervalDays: 'intervalo', returnPct: 'retorno %', vehiclePlate: 'placa', firstDueDate: '1º vencimento',
  dueDate: 'vencimento', notes: 'observação', authorizationCode: 'autorização', vehicleRole: 'veículo', description: 'descrição', responsavel: 'responsável',
}
/** "valor: 500 → 1000; banco: — → C6" */
export const describeChanges = (changes: Array<{ field: string; from: string; to: string }>) =>
  changes.map((c) => `${FIELD_LABEL[c.field] ?? c.field}: ${c.from || '—'} → ${c.to || '—'}`).join('; ')
