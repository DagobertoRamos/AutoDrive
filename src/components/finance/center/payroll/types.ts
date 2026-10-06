// Tipos da resposta de GET /api/finance/payroll (espelham src/lib/finance/payroll.ts).

export type PayrollKind = 'SALARIO' | 'BENEFICIO' | 'ADIANTAMENTO'

export interface PayrollEntryRow {
  id: string; kind: PayrollKind; description: string; amount: number; originalAmount: number | null
  status: string; date: string | null; paidDate: string | null; notes: string | null
  discountedMonth: string | null; accountId: string | null; recurrenceId: string | null; categoryId: string | null
}
export interface PayrollCommissionRow {
  id: string; ruleType: string; label: string; description: string; value: number; status: string
  entryId: string | null; entryStatus: string | null; paid: boolean; createdAt: string
  dealId?: string | null
}
export interface PayrollRecurrenceRow {
  id: string; description: string; amount: number; dayOfMonth: number; active: boolean
  categoryId: string | null; accountId: string | null; startDate: string; endDate: string | null; kind: PayrollKind
}
export interface EmployeeMonth {
  salary: { total: number; paid: number; pending: number }
  benefits: { total: number; paid: number; pending: number }
  commissions: { total: number; paid: number; pending: number; byType: { ruleType: string; label: string; count: number; total: number; pending: number }[] }
  advances: { total: number; toDiscount: number; discountedHere: number; scheduled: number }
  gross: number; deductions: number; net: number
  status: 'SEM_VALORES' | 'ABERTO' | 'PARCIAL' | 'PAGO'
}
export interface PayrollEmployee {
  userId: string; name: string; email: string; role: string; status: string
  cargo: string | null; unit: string | null; cpf: string | null
  recurrences: PayrollRecurrenceRow[]
  entries: PayrollEntryRow[]
  commissions: PayrollCommissionRow[]
  summary: EmployeeMonth
}
export interface PayrollMonthData {
  month: string; monthLabel: string
  categories: { salaryId: string | null; benefitId: string | null; advanceId: string | null; proLaboreId: string | null }
  employees: PayrollEmployee[]
  totals: { gross: number; deductions: number; net: number; salary: number; commissions: number; advancesToDiscount: number }
  accounts: { id: string; name: string; type: string }[]
  tenant: { name: string; cnpj: string | null }
}

export const STATUS_LABEL: Record<EmployeeMonth['status'], string> = { SEM_VALORES: 'Sem valores', ABERTO: 'Em aberto', PARCIAL: 'Parcial', PAGO: 'Pago' }
export const STATUS_TONE: Record<EmployeeMonth['status'], 'gray' | 'amber' | 'blue' | 'green'> = { SEM_VALORES: 'gray', ABERTO: 'amber', PARCIAL: 'blue', PAGO: 'green' }
