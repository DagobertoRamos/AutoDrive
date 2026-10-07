// =============================================================================
// /api/financing/banks — bancos da loja (F&I). Cada loja tem os seus.
//   GET  : financing (?active=true)
//   POST : configurarBancos — sem duplicar nome na mesma loja
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { createBankSchema } from '@/lib/validators/financing'
import { getBankProvider } from '@/lib/finance/fi/gateway/registry'
import { fiAuth, fiErrorResponse } from '@/lib/finance/fi/route'

export async function GET(req: Request) {
  const auth = await fiAuth(req)
  if (!auth.ok) return auth.res
  try {
    const onlyActive = new URL(req.url).searchParams.get('active') === 'true'
    const data = await prisma.financeBank.findMany({
      where: { tenantId: auth.tenantId, ...(onlyActive ? { active: true } : {}) },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, active: true, notes: true, adapterKey: true, _count: { select: { proposals: true } } },
    })
    return NextResponse.json({ success: true, data: data.map(({ _count, ...b }) => ({ ...b, proposals: _count.proposals })) })
  } catch (err) { return fiErrorResponse(err) }
}

export async function POST(req: Request) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'configurarBancos' })
  if (!auth.ok) return auth.res
  try {
    const d = createBankSchema.parse(await req.json())
    if (d.adapterKey && !getBankProvider(d.adapterKey)) return NextResponse.json({ success: false, error: 'Canal de integração inválido.' }, { status: 400 })
    const dup = await prisma.financeBank.findFirst({ where: { tenantId: auth.tenantId, name: { equals: d.name, mode: 'insensitive' } }, select: { id: true } })
    if (dup) return NextResponse.json({ success: false, error: 'Este banco já está cadastrado na loja.' }, { status: 409 })
    const bank = await prisma.financeBank.create({
      data: { tenantId: auth.tenantId, name: d.name, code: d.code ?? null, active: d.active, notes: d.notes ?? null, adapterKey: d.adapterKey || null },
    })
    await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'CREATE', entity: 'FinanceBank', entityId: bank.id, userName: auth.user.name, userRole: auth.user.role })
    return NextResponse.json({ success: true, data: bank }, { status: 201 })
  } catch (err) { return fiErrorResponse(err) }
}
