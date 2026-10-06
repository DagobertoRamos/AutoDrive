// =============================================================================
// Cancelamento de negociação × dinheiro já movimentado.
//   O cancelamento NÃO mexe no que já entrou/saiu: o valor recebido do cliente
//   continua na conta (lançamento RECEBIDO) até o financeiro marcar o estorno.
//   • Estorno ao cliente (venda/troca)  → DESPESA PAGO "Devoluções e distratos"
//       (código 8 — deduz a receita na DRE), na conta de onde o dinheiro saiu.
//       source = NEG_ESTORNO_<paymentId>; o pagamento vira ESTORNADO.
//   • Devolução do proprietário (compra/consignação já paga) → RECEITA RECEBIDO
//       "Outras receitas" (código 5). source = NEG_DEVOLUCAO_<entryId>.
//   Os dois aparecem no extrato da conta, no fluxo de caixa, na DRE e no
//   relatório "Cancelamentos e estornos". Desfazer = cancela o lançamento do estorno.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { createDealAudit } from '@/lib/negotiation-service'
import { PAYMENT_SOURCE_PREFIX } from './deal-finance-sync'
import { baseSource } from './settlement-core'
import { categoryIdByCode, resultCenterIds } from './setup'
import { periodError } from './period-lock'

export const REFUND_SOURCE_PREFIX = 'NEG_ESTORNO_'
export const OWNER_RETURN_SOURCE_PREFIX = 'NEG_DEVOLUCAO_'
const REFUND_CODE = '8' // Devoluções e distratos (DED_DEVOLUCOES)
const OWNER_RETURN_CODE = '5' // Outras receitas
const ACQUISITION_SOURCES = ['VEICULO_COMPRA_VEICULO', 'VEICULO_REPASSE']
/** Não entram dinheiro (quitação/troco são débitos da negociação). */
const NON_INCOMING = ['QUITACAO', 'TROCO']

const PAYMENT_LABEL: Record<string, string> = {
  DINHEIRO: 'Dinheiro', PIX: 'PIX', SINAL: 'Sinal', ENTRADA: 'Entrada', FINANCIAMENTO: 'Financiamento',
  CARTAO_CREDITO: 'Cartão de crédito', CARTAO_DEBITO: 'Cartão de débito', BOLETO: 'Boleto', DUPLICATA: 'Duplicata',
  TRANSFERENCIA: 'Transferência', CHEQUE: 'Cheque', OUTRO: 'Outro', OUTROS: 'Outro',
}

const r2 = (n: number) => Math.round(n * 100) / 100

export type RefundKind = 'ESTORNO_CLIENTE' | 'DEVOLUCAO_PROPRIETARIO'

export interface RefundLine {
  /** paymentId (estorno) ou id do lançamento de compra/repasse (devolução). */
  refId: string
  kind: RefundKind
  label: string
  party: string | null
  /** Valor da negociação (pagamento) ou do lançamento pago. */
  value: number
  /** Quanto efetivamente entrou (estorno) / saiu (devolução). */
  moved: number
  refunded: number
  /** Retido: entrou e ainda não foi devolvido (ou saiu e não voltou). */
  pending: number
  refund: { entryId: string; amount: number; date: string | null; accountId: string | null; accountName: string | null; method: string | null; notes: string | null } | null
}

const refundSource = (kind: RefundKind, refId: string) => `${kind === 'ESTORNO_CLIENTE' ? REFUND_SOURCE_PREFIX : OWNER_RETURN_SOURCE_PREFIX}${refId}`

/** Linhas de estorno/devolução de UMA negociação (qualquer status). */
export async function loadDealRefundLines(dealId: string): Promise<RefundLine[]> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true, payments: { select: { id: true, type: true, method: true, bank: true, value: true, status: true } },
      customer: { select: { name: true } }, person: { select: { nomeCompleto: true } },
      vehicles: { select: { vehicleId: true, role: true } },
    },
  })
  if (!deal) return []
  const customer = deal.person?.nomeCompleto ?? deal.customer?.name ?? null
  const entries = await prisma.financialEntry.findMany({
    where: { dealId },
    select: { id: true, source: true, status: true, amount: true, paidDate: true, accountId: true, paymentMethod: true, notes: true, account: { select: { name: true } } },
  })
  const refundOf = (source: string) => {
    const e = entries.find((x) => x.source === source)
    return e ? { entryId: e.id, amount: Number(e.amount), date: e.paidDate?.toISOString() ?? null, accountId: e.accountId, accountName: e.account?.name ?? null, method: e.paymentMethod, notes: e.notes } : null
  }

  const lines: RefundLine[] = []
  for (const p of deal.payments) {
    if (NON_INCOMING.includes(p.type) || !(Number(p.value) > 0)) continue
    const own = entries.filter((e) => baseSource(e.source) === `${PAYMENT_SOURCE_PREFIX}${p.id}` && e.status === 'RECEBIDO')
    const st = String(p.status ?? '').toUpperCase()
    // Sem lançamento (negociação antiga/importada): conciliado = recebido.
    const moved = own.length ? own.reduce((s, e) => s + Number(e.amount), 0) : st === 'CONFIRMADO' || st === 'ESTORNADO' ? Number(p.value) : 0
    const refund = refundOf(refundSource('ESTORNO_CLIENTE', p.id))
    if (!(moved > 0) && !refund) continue
    const kind = PAYMENT_LABEL[p.type] ?? p.type
    const how = p.method && p.method !== p.type ? ` (${PAYMENT_LABEL[p.method] ?? p.method})` : ''
    const refunded = refund?.amount ?? 0
    lines.push({
      refId: p.id, kind: 'ESTORNO_CLIENTE', label: `${kind}${how}`, party: p.type === 'FINANCIAMENTO' && p.bank ? p.bank : customer,
      value: Number(p.value), moved: r2(moved), refunded: r2(refunded), pending: refund ? 0 : r2(moved), refund,
    })
  }

  // Compra/consignação: o que a loja já pagou ao proprietário pelo carro de entrada.
  const entering = deal.vehicles.filter((v) => v.vehicleId && (v.role === 'COMPRADO' || v.role === 'CONSIGNADO')).map((v) => v.vehicleId as string)
  if (entering.length) {
    const paid = await prisma.financialEntry.findMany({
      where: { vehicleId: { in: entering }, status: 'PAGO', type: 'DESPESA' },
      select: { id: true, source: true, amount: true, description: true, counterparty: true },
    })
    for (const e of paid.filter((x) => ACQUISITION_SOURCES.includes(baseSource(x.source) ?? ''))) {
      const refund = refundOf(refundSource('DEVOLUCAO_PROPRIETARIO', e.id))
      lines.push({
        refId: e.id, kind: 'DEVOLUCAO_PROPRIETARIO', label: e.description, party: e.counterparty ?? customer,
        value: Number(e.amount), moved: Number(e.amount), refunded: refund?.amount ?? 0, pending: refund ? 0 : Number(e.amount), refund,
      })
    }
  }
  return lines
}

export interface RefundInput {
  dealId: string
  refId: string
  kind: RefundKind
  amount: number
  date: Date
  accountId: string | null
  method: string | null
  notes: string | null
  actor: { id: string; name?: string | null; role?: string | null }
}

/** Marca o estorno/devolução: cria o lançamento realizado e atualiza o pagamento. */
export async function registerRefund(tenantId: string, input: RefundInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const deal = await prisma.deal.findFirst({ where: { id: input.dealId, tenantId }, select: { id: true, tenantId: true, unitId: true, sellerId: true, status: true, dealNumber: true } })
  if (!deal) return { ok: false, error: 'Negociação não encontrada.' }
  if (deal.status !== 'CANCELADA') return { ok: false, error: 'Só negociações canceladas têm estorno.' }
  const line = (await loadDealRefundLines(deal.id)).find((l) => l.refId === input.refId && l.kind === input.kind)
  if (!line) return { ok: false, error: 'Item não encontrado nesta negociação.' }
  if (line.refund) return { ok: false, error: 'Este valor já foi marcado como estornado.' }
  const closed = await periodError(tenantId, [input.date])
  if (closed) return { ok: false, error: closed }
  if (!(input.amount > 0)) return { ok: false, error: 'Informe o valor.' }
  if (input.amount > line.moved + 0.009) return { ok: false, error: 'O valor é maior do que o que foi movimentado.' }
  if (input.accountId) {
    const acc = await prisma.financialAccount.findFirst({ where: { id: input.accountId, tenantId }, select: { id: true } })
    if (!acc) return { ok: false, error: 'Conta financeira inválida.' }
  }

  const refund = input.kind === 'ESTORNO_CLIENTE'
  const ref = deal.dealNumber ?? deal.id.slice(0, 8)
  const categoryId = await categoryIdByCode(tenantId, refund ? REFUND_CODE : OWNER_RETURN_CODE)
  const centers = await resultCenterIds(tenantId).catch(() => ({} as Record<string, string>))
  await prisma.$transaction(async (tx) => {
    await tx.financialEntry.create({
      data: {
        tenantId, unitId: deal.unitId, sellerId: deal.sellerId, dealId: deal.id, source: refundSource(input.kind, input.refId),
        type: refund ? 'DESPESA' : 'RECEITA', status: refund ? 'PAGO' : 'RECEBIDO',
        description: refund ? `Estorno ao cliente — ${line.label} · negociação ${ref}` : `Devolução do proprietário — ${line.label} · negociação ${ref}`,
        amount: r2(input.amount), dueDate: input.date, paidDate: input.date, competenceDate: input.date,
        accountId: input.accountId, categoryId, costCenterId: centers.VENDAS ?? null,
        counterparty: line.party, paymentMethod: input.method, notes: input.notes, createdById: input.actor.id,
      },
    })
    if (refund) await tx.dealPayment.update({ where: { id: input.refId }, data: { status: 'ESTORNADO' } })
    await createDealAudit(tx as never, {
      dealId: deal.id, tenantId, unitId: deal.unitId, userId: input.actor.id, userName: input.actor.name ?? undefined, userRole: input.actor.role ?? undefined,
      action: refund ? 'ESTORNAR_PAGAMENTO' : 'DEVOLUCAO_PROPRIETARIO', field: refund ? 'payment' : 'acquisition',
      oldValue: line.label, newValue: `R$ ${r2(input.amount).toFixed(2)}`, reason: input.notes ?? undefined,
    })
  })
  return { ok: true }
}

/** Desfaz um estorno marcado por engano: o lançamento fica cancelado e o pagamento volta a conciliado. */
export async function undoRefund(tenantId: string, dealId: string, refId: string, kind: RefundKind, actor: RefundInput['actor']): Promise<{ ok: true } | { ok: false; error: string }> {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, tenantId }, select: { id: true, unitId: true } })
  if (!deal) return { ok: false, error: 'Negociação não encontrada.' }
  const entry = await prisma.financialEntry.findFirst({ where: { dealId, source: refundSource(kind, refId) }, select: { id: true, amount: true, settlementBatchId: true } })
  if (!entry) return { ok: false, error: 'Estorno não encontrado.' }
  const closed = await periodError(tenantId, [(await prisma.financialEntry.findUnique({ where: { id: entry.id }, select: { paidDate: true } }))?.paidDate])
  if (closed) return { ok: false, error: closed }
  await prisma.$transaction(async (tx) => {
    // Nunca apaga: fica cancelado (origem renomeada para liberar um novo estorno).
    await tx.financialEntry.update({ where: { id: entry.id }, data: { status: 'CANCELADO', source: `${refundSource(kind, refId)}#X${Date.now()}`, notes: 'Estorno desfeito.' } })
    if (kind === 'ESTORNO_CLIENTE') await tx.dealPayment.updateMany({ where: { id: refId, dealId, status: 'ESTORNADO' }, data: { status: 'CONFIRMADO' } })
    await createDealAudit(tx as never, {
      dealId, tenantId, unitId: deal.unitId, userId: actor.id, userName: actor.name ?? undefined, userRole: actor.role ?? undefined,
      action: 'DESFAZER_ESTORNO', field: 'payment', oldValue: `R$ ${Number(entry.amount).toFixed(2)}`, newValue: null,
    })
  })
  return { ok: true }
}
