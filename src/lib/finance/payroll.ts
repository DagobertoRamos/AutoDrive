// =============================================================================
// Folha e comissões — carga do mês (Prisma) e pagamento.
//   loadPayrollMonth → colaboradores da loja + salário (lançamentos das despesas
//                      fixas do colaborador), benefícios, adiantamentos e
//                      comissões do período, com o fechamento calculado
//                      (payroll-core.ts).
//   payEmployee      → baixa salário/benefícios/comissões numa conta e data,
//                      descontando os adiantamentos pagos no salário. A baixa
//                      de comissão passa por applyStatusSideEffects (comissão
//                      fica PAGO no sistema de comissões).
// =============================================================================

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ensureFinanceSetup } from './setup'
import { applyStatusSideEffects } from './entry-settlement'
import { syncTenantFinance } from './finance-sync'
import {
  COMMISSION_TYPE_LABEL, PAYROLL_CODES, classifyPayrollEntry, commissionPaid, computeEmployeeMonth, discountedMonth,
  monthLabel, monthRange, planAdvanceDiscount, withDiscountTag, type EmployeeMonth, type PayrollKind,
} from './payroll-core'

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d))
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export interface PayrollCategories { salaryId: string | null; benefitId: string | null; advanceId: string | null; proLaboreId: string | null }

const CODE_FALLBACK_NAME: Record<string, string> = {
  [PAYROLL_CODES.SALARIO]: 'salários', [PAYROLL_CODES.BENEFICIO]: 'benefícios',
  [PAYROLL_CODES.ADIANTAMENTO]: 'adiantamentos e vales', [PAYROLL_CODES.PRO_LABORE]: 'pró-labore',
}

/** Categorias da folha no plano da loja (por código; cai no nome se o código mudou). */
export async function payrollCategories(tenantId: string): Promise<PayrollCategories> {
  await ensureFinanceSetup(tenantId)
  const rows = await prisma.financialCategory.findMany({ where: { tenantId, kind: 'DESPESA' }, select: { id: true, code: true, name: true, active: true } })
  const find = (code: string) => rows.find((r) => r.code === code)?.id
    ?? rows.find((r) => r.name.trim().toLowerCase() === CODE_FALLBACK_NAME[code])?.id ?? null
  return {
    salaryId: find(PAYROLL_CODES.SALARIO), benefitId: find(PAYROLL_CODES.BENEFICIO),
    advanceId: find(PAYROLL_CODES.ADIANTAMENTO), proLaboreId: find(PAYROLL_CODES.PRO_LABORE),
  }
}

export interface PayrollEntryRow {
  id: string; kind: PayrollKind; description: string; amount: number; originalAmount: number | null
  status: string; date: string | null; paidDate: string | null; notes: string | null
  discountedMonth: string | null; accountId: string | null; recurrenceId: string | null; categoryId: string | null
}
export interface PayrollCommissionRow {
  id: string; ruleType: string; label: string; description: string; value: number; status: string
  entryId: string | null; entryStatus: string | null; paid: boolean; createdAt: string
}
export interface PayrollRecurrenceRow {
  id: string; description: string; amount: number; dayOfMonth: number; active: boolean
  categoryId: string | null; accountId: string | null; startDate: string; endDate: string | null; kind: PayrollKind
}
export interface PayrollEmployee {
  userId: string; name: string; email: string; role: string; status: string
  cargo: string | null; unit: string | null; cpf: string | null
  recurrences: PayrollRecurrenceRow[]
  entries: PayrollEntryRow[]
  commissions: PayrollCommissionRow[]
  summary: EmployeeMonth
}

interface EmployeeRef {
  userId: string; name: string; email: string; role: string; status: string; cpf: string | null
  cargo: string | null; unit: string | null; sellerIds: string[]; managerIds: string[]
}

async function loadEmployeeRefs(tenantId: string, onlyUserId?: string, extraUserIds: string[] = []): Promise<EmployeeRef[]> {
  const where: Prisma.UserWhereInput = onlyUserId
    ? { tenantId, id: onlyUserId }
    : { tenantId, OR: [{ status: { in: ['ATIVO', 'SUSPENSO'] } }, ...(extraUserIds.length ? [{ id: { in: extraUserIds } }] : [])] }
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true, name: true, email: true, role: true, status: true, cpf: true,
      position: { select: { name: true } }, unit: { select: { name: true } },
      seller: { select: { id: true, fullName: true, cargo: true, position: { select: { name: true } }, unit: { select: { name: true } } } },
      manager: { select: { id: true, fullName: true, position: { select: { name: true } }, unit: { select: { name: true } } } },
    },
    orderBy: { name: 'asc' },
  })
  return users.map((u) => ({
    userId: u.id, name: u.seller?.fullName || u.manager?.fullName || u.name, email: u.email, role: u.role, status: u.status, cpf: u.cpf,
    cargo: u.seller?.position?.name ?? u.manager?.position?.name ?? u.position?.name ?? u.seller?.cargo ?? null,
    unit: u.seller?.unit?.name ?? u.manager?.unit?.name ?? u.unit?.name ?? null,
    sellerIds: u.seller ? [u.seller.id] : [],
    managerIds: u.manager ? [u.manager.id] : [],
  }))
}

export interface PayrollMonth {
  month: string
  monthLabel: string
  categories: PayrollCategories
  employees: PayrollEmployee[]
  totals: { gross: number; deductions: number; net: number; salary: number; commissions: number; advancesToDiscount: number }
}

export async function loadPayrollMonth(tenantId: string, month: string, onlyUserId?: string): Promise<PayrollMonth> {
  const categories = await payrollCategories(tenantId)
  const { start, end } = monthRange(month)
  const advanceCat = categories.advanceId

  // Lançamentos do colaborador: competência (ou vencimento) no mês; adiantamentos
  // pagos ainda não descontados de meses anteriores vêm junto (descontam agora).
  const or: Prisma.FinancialEntryWhereInput[] = [
    { competenceDate: { gte: start, lt: end } },
    { competenceDate: null, dueDate: { gte: start, lt: end } },
  ]
  if (advanceCat) {
    or.push({ categoryId: advanceCat, status: 'PAGO', dueDate: { lt: end }, OR: [{ notes: null }, { NOT: { notes: { contains: '[descontado:' } } }] })
    or.push({ categoryId: advanceCat, notes: { contains: `[descontado:${month}]` } })
  }
  const entryRows = await prisma.financialEntry.findMany({
    where: { tenantId, employeeUserId: onlyUserId ? onlyUserId : { not: null }, status: { not: 'CANCELADO' }, commissionCalculationId: null, OR: or },
    select: {
      id: true, employeeUserId: true, description: true, amount: true, chargedAmount: true, status: true, dueDate: true, competenceDate: true,
      paidDate: true, notes: true, accountId: true, recurrenceId: true, categoryId: true, category: { select: { code: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
  })

  const recRows = await prisma.financialRecurrence.findMany({
    where: { tenantId, type: 'DESPESA', employeeUserId: onlyUserId ? onlyUserId : { not: null } },
    select: { id: true, employeeUserId: true, description: true, amount: true, dayOfMonth: true, active: true, categoryId: true, accountId: true, startDate: true, endDate: true, category: { select: { code: true } } },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
  })

  const extraIds = [...new Set([...entryRows.map((e) => e.employeeUserId!), ...recRows.filter((r) => r.active).map((r) => r.employeeUserId!)])]
  const refs = await loadEmployeeRefs(tenantId, onlyUserId, extraIds)

  // Comissões do período (gravadas por Seller.id ou, no gerente, Manager.id / User.id).
  const sellerToUser = new Map<string, string>()
  const managerToUser = new Map<string, string>()
  for (const r of refs) {
    r.sellerIds.forEach((s) => sellerToUser.set(s, r.userId))
    r.managerIds.forEach((m) => managerToUser.set(m, r.userId))
    managerToUser.set(r.userId, r.userId)
  }
  const comRows = refs.length
    ? await prisma.commissionCalculation.findMany({
        where: {
          tenantId, period: month, status: { not: 'CANCELADO' },
          OR: [{ sellerId: { in: [...sellerToUser.keys()] } }, { managerId: { in: [...managerToUser.keys()] } }],
        },
        select: { id: true, sellerId: true, managerId: true, ruleType: true, description: true, commissionValue: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      })
    : []
  const comEntries = comRows.length
    ? await prisma.financialEntry.findMany({ where: { commissionCalculationId: { in: comRows.map((c) => c.id) } }, select: { id: true, commissionCalculationId: true, status: true } })
    : []
  const entryByCom = new Map(comEntries.map((e) => [e.commissionCalculationId!, e]))

  const employees: PayrollEmployee[] = refs.map((r) => {
    const entries: PayrollEntryRow[] = entryRows.filter((e) => e.employeeUserId === r.userId).map((e) => ({
      id: e.id, kind: classifyPayrollEntry(e.category?.code), description: e.description, amount: num(e.amount),
      originalAmount: e.chargedAmount == null ? null : num(e.chargedAmount), status: e.status,
      date: iso(e.competenceDate ?? e.dueDate), paidDate: iso(e.paidDate), notes: e.notes,
      discountedMonth: discountedMonth(e.notes), accountId: e.accountId, recurrenceId: e.recurrenceId, categoryId: e.categoryId,
    }))
    const commissions: PayrollCommissionRow[] = comRows
      .filter((c) => (c.sellerId && sellerToUser.get(c.sellerId) === r.userId) || (!(c.sellerId && sellerToUser.has(c.sellerId)) && c.managerId && managerToUser.get(c.managerId) === r.userId))
      .map((c) => {
        const fe = entryByCom.get(c.id)
        const row = { id: c.id, ruleType: c.ruleType, label: COMMISSION_TYPE_LABEL[c.ruleType] ?? c.ruleType, description: c.description, value: num(c.commissionValue), status: c.status, entryId: fe?.id ?? null, entryStatus: fe?.status ?? null, createdAt: c.createdAt.toISOString() }
        return { ...row, paid: commissionPaid(row) }
      })
    const recurrences: PayrollRecurrenceRow[] = recRows.filter((x) => x.employeeUserId === r.userId).map((x) => ({
      id: x.id, description: x.description, amount: num(x.amount), dayOfMonth: x.dayOfMonth, active: x.active,
      categoryId: x.categoryId, accountId: x.accountId, startDate: x.startDate.toISOString(), endDate: iso(x.endDate),
      kind: classifyPayrollEntry(x.category?.code),
    }))
    const summary = computeEmployeeMonth(month, entries.map((e) => ({ ...e, grossAmount: e.kind === 'SALARIO' ? e.originalAmount : null })), commissions.map((c) => ({ id: c.id, ruleType: c.ruleType, description: c.description, value: c.value, status: c.status, entryId: c.entryId, entryStatus: c.entryStatus })))
    return { userId: r.userId, name: r.name, email: r.email, role: r.role, status: r.status, cargo: r.cargo, unit: r.unit, cpf: r.cpf, recurrences, entries, commissions, summary }
  })

  const r2 = (n: number) => Math.round(n * 100) / 100
  const totals = employees.reduce((t, e) => ({
    gross: r2(t.gross + e.summary.gross), deductions: r2(t.deductions + e.summary.deductions), net: r2(t.net + e.summary.net),
    salary: r2(t.salary + e.summary.salary.total), commissions: r2(t.commissions + e.summary.commissions.total),
    advancesToDiscount: r2(t.advancesToDiscount + e.summary.advances.toDiscount),
  }), { gross: 0, deductions: 0, net: 0, salary: 0, commissions: 0, advancesToDiscount: 0 })

  return { month, monthLabel: monthLabel(month), categories, employees, totals }
}

// ── Pagamento ────────────────────────────────────────────────────────────────

export interface PayInput {
  month: string
  userId: string
  accountId: string
  paidDate: string // YYYY-MM-DD
  /** Lançamentos de salário/benefício a pagar (padrão: todos os pendentes do mês). */
  entryIds?: string[]
  /** Comissões a pagar (padrão: todas as pendentes do período). */
  commissionIds?: string[]
  /** Desconta no salário os adiantamentos pagos ainda não descontados (padrão: sim). */
  discountAdvances?: boolean
  note?: string | null
}

export interface PayResult { paidEntries: number; paidCommissions: number; discounted: number; total: number }

const noon = (ymd: string) => new Date(`${ymd.slice(0, 10)}T12:00:00.000Z`)

async function settle(id: string, paidDate: Date, accountId: string, extra: Prisma.FinancialEntryUncheckedUpdateInput = {}) {
  const existing = await prisma.financialEntry.findUnique({ where: { id }, select: { status: true, paidDate: true, source: true, commissionCalculationId: true } })
  if (!existing || existing.status === 'PAGO' || existing.status === 'CANCELADO') return false
  await prisma.financialEntry.update({ where: { id }, data: { ...extra, status: 'PAGO', paidDate, accountId } })
  await applyStatusSideEffects(existing, 'PAGO', paidDate)
  return true
}

export async function payEmployee(tenantId: string, input: PayInput): Promise<{ error: string } | { result: PayResult }> {
  let month = await loadPayrollMonth(tenantId, input.month, input.userId)
  let emp = month.employees[0]
  if (!emp) return { error: 'Colaborador não encontrado.' }

  // Comissão sem lançamento financeiro ainda → sincroniza antes de pagar.
  const wantedCom = (c: PayrollCommissionRow) => !c.paid && (!input.commissionIds || input.commissionIds.includes(c.id))
  if (emp.commissions.some((c) => wantedCom(c) && !c.entryId)) {
    await syncTenantFinance(tenantId)
    month = await loadPayrollMonth(tenantId, input.month, input.userId)
    emp = month.employees[0]
    if (!emp) return { error: 'Colaborador não encontrado.' }
  }
  const coms = emp.commissions.filter(wantedCom)
  if (coms.some((c) => !c.entryId)) return { error: 'Há comissão sem lançamento no financeiro. Sincronize e tente de novo.' }

  const pendingPay = emp.entries.filter((e) => e.kind !== 'ADIANTAMENTO' && e.status === 'PREVISTO' && (!input.entryIds || input.entryIds.includes(e.id)))
  if (!pendingPay.length && !coms.length) return { error: 'Nada a pagar para este colaborador no mês.' }

  const paidDate = noon(input.paidDate)
  const note = input.note?.trim() || null

  // Desconto dos adiantamentos no salário.
  const salaryEntries = pendingPay.filter((e) => e.kind === 'SALARIO')
  const advances = input.discountAdvances === false ? [] : emp.entries.filter((e) => e.kind === 'ADIANTAMENTO' && e.status === 'PAGO' && !e.discountedMonth)
  const plan = planAdvanceDiscount(salaryEntries.map((e) => ({ id: e.id, amount: e.amount })), advances.map((a) => ({ id: a.id, amount: a.amount, date: a.date })))

  let paidEntries = 0
  let total = 0
  for (const e of pendingPay) {
    const cut = plan.salary.find((s) => s.id === e.id)
    if (cut && cut.amount !== cut.original) {
      const row = await prisma.financialEntry.findUnique({ where: { id: e.id }, select: { notes: true, chargedAmount: true } })
      const tag = `Desconto de adiantamentos na folha ${monthLabel(input.month)}: ${(cut.original - cut.amount).toFixed(2).replace('.', ',')}`
      const notes = [row?.notes, tag, note].filter(Boolean).join('\n').slice(0, 2000)
      // amount 0 = salário inteiro coberto por adiantamentos (o custo já está neles).
      if (await settle(e.id, paidDate, input.accountId, { amount: cut.amount, chargedAmount: row?.chargedAmount ?? cut.original, notes })) { paidEntries++; total += cut.amount }
      continue
    }
    const extra = note ? { notes: [e.notes, note].filter(Boolean).join('\n').slice(0, 2000) } : {}
    if (await settle(e.id, paidDate, input.accountId, extra)) { paidEntries++; total += e.amount }
  }

  let paidCommissions = 0
  for (const c of coms) {
    if (c.entryId && (await settle(c.entryId, paidDate, input.accountId))) { paidCommissions++; total += c.value }
  }

  for (const id of plan.advanceIds) {
    const a = await prisma.financialEntry.findUnique({ where: { id }, select: { notes: true } })
    await prisma.financialEntry.update({ where: { id }, data: { notes: withDiscountTag(a?.notes, input.month, note) } })
  }

  return { result: { paidEntries, paidCommissions, discounted: plan.total, total: Math.round(total * 100) / 100 } }
}
