// =============================================================================
// /api/finance/accounts — contas financeiras (caixa/banco/cartão). Por loja.
//   GET  : finance         → { data: Conta[] (com saldo atual), units, totals }
//   POST : finance.manage
// Saldo atual = saldo inicial + realizados (RECEBIDO − PAGO) desde a data do
// saldo inicial (mesma regra do razão — ledger.ts), somado no banco.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { financeCan, financeGuard } from '@/lib/finance/access'
import { tenantRefError } from '@/lib/finance/tenant-refs'
import { accountBalancesSql } from '@/lib/finance/ledger-server'
import { accountSchema, accountData } from './schema'

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const { tenantId } = g
  const canBalances = await financeCan(g.user, 'finance.balances')

  try {
    const { searchParams } = new URL(req.url)
    const onlyActive = searchParams.get('active') === 'true'
    // Saldos somados no banco (não carrega o histórico); sem "ver saldos", nem consulta.
    const [rows, units, byAccount] = await Promise.all([
      prisma.financialAccount.findMany({ where: { tenantId, ...(onlyActive ? { active: true } : {}) }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
      prisma.unit.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      canBalances ? accountBalancesSql(tenantId) : Promise.resolve(new Map<string, number>()),
    ])
    const unitName = new Map(units.map((u) => [u.id, u.name]))
    const data = rows.map((a) => {
      const opening = Number(a.openingBalance ?? 0)
      const currentBalance = byAccount.get(a.id) ?? opening
      return canBalances
        ? { ...a, unitName: a.unitId ? unitName.get(a.unitId) ?? null : null, currentBalance, movement: Math.round((currentBalance - opening) * 100) / 100 }
        : { ...a, openingBalance: null, unitName: a.unitId ? unitName.get(a.unitId) ?? null : null, currentBalance: null, movement: null }
    })
    const consolidated = canBalances ? Math.round(data.filter((a) => a.active && a.includeInTotal).reduce((s, a) => s + (a.currentBalance ?? 0), 0) * 100) / 100 : null
    return NextResponse.json({ success: true, data, units, totals: { consolidated } })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const g = await financeGuard('finance.manage', req)
  if (g.error) return g.error
  const { user, tenantId } = g

  try {
    const d = accountSchema.parse(await req.json())
    const refErr = await tenantRefError(tenantId, { unitId: d.unitId ?? null })
    if (refErr) return NextResponse.json({ success: false, error: refErr }, { status: 400 })
    const account = await prisma.financialAccount.create({ data: { tenantId, createdById: user.id, ...accountData(d) } as never })
    await createSafeAuditLog({ userId: user.id, tenantId, action: 'CREATE', entity: 'FinancialAccount', entityId: account.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: account }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
