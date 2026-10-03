// =============================================================================
// Edição da negociação: aplica pagamentos/débitos vindos da tela (por id) com
// log campo a campo em DealAuditLog (visível à gerência no resumo).
// Regras puras em children-sync-core.ts.
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  DEBT_FIELDS, PAYMENT_FIELDS, debtLabel, describeChanges, diffChildren, isLockedPayment, paymentLabel,
  type ChildDiff, type DebtRow, type PaymentRow,
} from './children-sync-core'

const n = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const s = (v: unknown, max = 200) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : null }
const day = (v: unknown) => { const t = String(v ?? '').trim(); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null }
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)

export function paymentFromBody(p: Record<string, unknown>): PaymentRow {
  const type = String(p.type ?? 'OUTROS').toUpperCase()
  const ret = n(p.returnPct)
  return {
    id: String(p.id ?? ''), type, status: null, value: n(p.amount ?? p.value) ?? 0,
    method: ['SINAL', 'ENTRADA'].includes(type) ? s(p.signalMethod ?? p.method, 30)?.toUpperCase() ?? null : null,
    bank: s(p.bank), cardBrand: s(p.cardBrand, 30), pixKey: s(p.pixKey), installments: n(p.installments),
    installmentValue: n(p.installmentValue), installmentIntervalDays: n(p.installmentIntervalDays),
    returnPct: ret == null ? null : Math.min(6, Math.max(0, Math.round(ret * 100) / 100)),
    vehiclePlate: s(p.vehiclePlate, 10), firstDueDate: day(p.firstDueDate), dueDate: day(p.dueDate),
    notes: s(p.notes, 1000), authorizationCode: s(p.authorizationCode, 40),
  }
}

export function debtFromBody(d: Record<string, unknown>): DebtRow {
  return {
    id: String(d.id ?? ''), vehicleRole: s(d.vehicleRole, 20), type: String(d.type ?? 'OUTROS').toUpperCase(),
    description: s(d.description), value: n(d.value) ?? 0, dueDate: day(d.dueDate), responsavel: s(d.responsavel, 20) ?? 'LOJA', notes: s(d.notes, 1000),
  }
}

export async function loadChildren(dealId: string) {
  const [pays, debts] = await Promise.all([
    prisma.dealPayment.findMany({ where: { dealId } }),
    prisma.dealDebt.findMany({ where: { dealId } }),
  ])
  const payments: PaymentRow[] = pays.map((p) => ({
    id: p.id, type: p.type, status: p.status, value: Number(p.value), method: p.method, bank: p.bank, cardBrand: p.cardBrand, pixKey: p.pixKey,
    installments: p.installments, installmentValue: p.installmentValue == null ? null : Number(p.installmentValue), installmentIntervalDays: p.installmentIntervalDays,
    returnPct: p.returnPct == null ? null : Number(p.returnPct), vehiclePlate: p.vehiclePlate, firstDueDate: iso(p.firstDueDate), dueDate: iso(p.dueDate),
    notes: p.notes, authorizationCode: p.authorizationCode,
  }))
  const debtRows: DebtRow[] = debts.map((d) => ({
    id: d.id, vehicleRole: d.vehicleRole, type: d.type, description: d.description, value: Number(d.value), dueDate: iso(d.dueDate), responsavel: d.responsavel, notes: d.notes,
  }))
  return { payments: payments, debts: debtRows }
}

export interface ChildrenPlan { payments: ChildDiff<PaymentRow> | null; debts: ChildDiff<DebtRow> | null }

/** Planeja a sincronização (sem gravar). `null` = a tela não mandou aquela lista. */
export async function planChildren(dealId: string, body: Record<string, unknown>): Promise<ChildrenPlan> {
  const cur = await loadChildren(dealId)
  const payments = Array.isArray(body.payments)
    ? diffChildren(cur.payments, (body.payments as Record<string, unknown>[]).map(paymentFromBody), PAYMENT_FIELDS, isLockedPayment)
    : null
  const debts = Array.isArray(body.debts) || body.debts === undefined && Array.isArray(body.payments)
    ? diffChildren(cur.debts, ((body.debts as Record<string, unknown>[] | undefined) ?? []).map(debtFromBody), DEBT_FIELDS)
    : null
  // Pagamentos travados que sumiram da tela (ex.: cancelados) continuam no banco.
  return { payments, debts }
}

export const planHasChanges = (p: ChildrenPlan) =>
  [p.payments, p.debts].some((d) => d && (d.create.length || d.update.length || d.remove.length))

const date = (v: string | null) => (v ? new Date(`${v}T12:00:00`) : null)

/** Aplica o plano dentro da transação e registra o log. */
export async function applyChildren(
  tx: Prisma.TransactionClient, deal: { id: string; tenantId: string | null; unitId: string | null }, plan: ChildrenPlan,
  actor: { id: string; name: string | null; role: string },
  /** Novo pagamento/débito criado (id da tela → id gravado) — p/ vincular comprovante. */
  onCreated?: (kind: 'payment' | 'debt', tmpId: string, id: string) => Promise<void>,
) {
  const before = await loadChildrenTx(tx, deal.id)
  const audit = (field: string, oldValue: string | null, newValue: string | null) => tx.dealAuditLog.create({
    data: { dealId: deal.id, tenantId: deal.tenantId, unitId: deal.unitId, userId: actor.id, userName: actor.name, userRole: actor.role, action: 'EDITAR', field, oldValue, newValue },
  })

  if (plan.payments) {
    const p = plan.payments
    for (const u of p.update) {
      const d = u.data
      await tx.dealPayment.update({
        where: { id: u.id },
        data: {
          ...('type' in d ? { type: d.type } : {}), ...('value' in d ? { value: d.value } : {}), ...('method' in d ? { method: d.method } : {}),
          ...('bank' in d ? { bank: d.bank } : {}), ...('cardBrand' in d ? { cardBrand: d.cardBrand } : {}), ...('pixKey' in d ? { pixKey: d.pixKey } : {}),
          ...('installments' in d ? { installments: d.installments } : {}), ...('installmentValue' in d ? { installmentValue: d.installmentValue } : {}),
          ...('installmentIntervalDays' in d ? { installmentIntervalDays: d.installmentIntervalDays } : {}), ...('returnPct' in d ? { returnPct: d.returnPct } : {}),
          ...('vehiclePlate' in d ? { vehiclePlate: d.vehiclePlate } : {}), ...('firstDueDate' in d ? { firstDueDate: date(d.firstDueDate ?? null) } : {}),
          ...('dueDate' in d ? { dueDate: date(d.dueDate ?? null) } : {}), ...('notes' in d ? { notes: d.notes } : {}),
          ...('authorizationCode' in d ? { authorizationCode: d.authorizationCode } : {}),
        },
      })
      const old = before.payments.find((x) => x.id === u.id)
      await audit('pagamento', old ? paymentLabel(old) : null, describeChanges(u.changes))
    }
    for (const c of p.create) {
      const created = await tx.dealPayment.create({
        select: { id: true },
        data: {
          dealId: deal.id, tenantId: deal.tenantId, type: c.type, status: 'PENDENTE', value: c.value, method: c.method, bank: c.bank, cardBrand: c.cardBrand,
          pixKey: c.pixKey, installments: c.installments, installmentValue: c.installmentValue, installmentIntervalDays: c.installmentIntervalDays,
          returnPct: c.returnPct, vehiclePlate: c.vehiclePlate, firstDueDate: date(c.firstDueDate), dueDate: date(c.dueDate), notes: c.notes,
          authorizationCode: c.authorizationCode, createdById: actor.id,
        },
      })
      await onCreated?.('payment', c.id, created.id)
      await audit('pagamento', null, `Incluído: ${paymentLabel(c)}`)
    }
    for (const id of p.remove) {
      const old = before.payments.find((x) => x.id === id)
      await tx.dealPayment.delete({ where: { id } })
      await audit('pagamento', old ? paymentLabel(old) : id, 'Removido')
    }
  }

  if (plan.debts) {
    const d = plan.debts
    for (const u of d.update) {
      const x = u.data
      await tx.dealDebt.update({
        where: { id: u.id },
        data: {
          ...('vehicleRole' in x ? { vehicleRole: x.vehicleRole } : {}), ...('type' in x ? { type: x.type } : {}), ...('description' in x ? { description: x.description } : {}),
          ...('value' in x ? { value: x.value } : {}), ...('dueDate' in x ? { dueDate: date(x.dueDate ?? null) } : {}),
          ...('responsavel' in x ? { responsavel: x.responsavel } : {}), ...('notes' in x ? { notes: x.notes } : {}),
        },
      })
      const old = before.debts.find((y) => y.id === u.id)
      await audit('débito', old ? debtLabel(old) : null, describeChanges(u.changes))
    }
    for (const c of d.create) {
      const created = await tx.dealDebt.create({
        select: { id: true },
        data: { dealId: deal.id, vehicleRole: c.vehicleRole, type: c.type, description: c.description, value: c.value, dueDate: date(c.dueDate), responsavel: c.responsavel, notes: c.notes, source: 'MANUAL' },
      })
      await onCreated?.('debt', c.id, created.id)
      await audit('débito', null, `Incluído: ${debtLabel(c)}`)
    }
    for (const id of d.remove) {
      const old = before.debts.find((y) => y.id === id)
      await tx.dealDebt.delete({ where: { id } })
      await audit('débito', old ? debtLabel(old) : id, 'Removido')
    }
  }
}

async function loadChildrenTx(tx: Prisma.TransactionClient, dealId: string) {
  const [pays, debts] = await Promise.all([tx.dealPayment.findMany({ where: { dealId } }), tx.dealDebt.findMany({ where: { dealId } })])
  return {
    payments: pays.map((p) => ({ type: p.type, value: Number(p.value), method: p.method, bank: p.bank, id: p.id })),
    debts: debts.map((d) => ({ type: d.type, description: d.description, value: Number(d.value), responsavel: d.responsavel, id: d.id })),
  }
}

type Actor = { id: string; name?: string | null; role: string }
type PayLike = { type: string; value: unknown; method?: string | null; bank?: string | null; status?: string | null }
type DebtLike = { type: string; value: unknown; description?: string | null; responsavel?: string | null }

export const payLabel = (p: PayLike) => paymentLabel({ type: p.type, value: Number(p.value), method: p.method ?? null, bank: p.bank ?? null })
export const debtRowLabel = (d: DebtLike) => debtLabel({ type: d.type, value: Number(d.value), description: d.description ?? null, responsavel: d.responsavel ?? null })

/** Log de alteração de pagamento/débito no histórico da negociação (resumo, gerência). */
export async function logDealChild(dealId: string, actor: Actor, field: 'pagamento' | 'débito', oldValue: string | null, newValue: string | null) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { tenantId: true, unitId: true } })
  await prisma.dealAuditLog.create({
    data: { dealId, tenantId: deal?.tenantId ?? null, unitId: deal?.unitId ?? null, userId: actor.id, userName: actor.name ?? null, userRole: actor.role, action: 'EDITAR', field, oldValue, newValue },
  }).catch((e) => console.error('[deal-audit]', e))
}

const STATUS_PT: Record<string, string> = { PENDENTE: 'pendente', CONFIRMADO: 'confirmado', CANCELADO: 'cancelado' }
export const statusPt = (s: string | null | undefined) => STATUS_PT[String(s ?? 'PENDENTE').toUpperCase()] ?? String(s ?? '').toLowerCase()
